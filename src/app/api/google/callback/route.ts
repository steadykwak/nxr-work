import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { currentUser, adminClient } from '@/lib/supabase';
import { encrypt } from '@/lib/security';
import { normalizeScopes } from '@/lib/google';
import { required, siteUrl } from '@/lib/config';
export async function GET(request: NextRequest) {
  const origin = siteUrl();
  const redirect = (message: string) =>
    NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(message)}`, origin),
    );
  const state = request.nextUrl.searchParams.get('state');
  if (!state || state !== request.cookies.get('google_oauth_state')?.value)
    return redirect('OAuth 상태 확인 실패');
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return redirect('Google 연결이 취소되었습니다');
  const { user } = await currentUser();
  if (!user) return redirect('로그인 세션이 만료되었습니다');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: required('GOOGLE_CLIENT_ID'),
        client_secret: required('GOOGLE_CLIENT_SECRET'),
        redirect_uri: `${origin}/api/google/callback`,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(
        '[Google OAuth Token Exchange Error]:',
        response.status,
        errorBody,
      );
      throw new Error(
        `토큰 교환 실패 (${response.status}): ${errorBody || response.statusText}`,
      );
    }
    const token = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    let existingRefreshToken: string | null = null;
    let existingGrantedScopes: string | null = null;
    try {
      const existing = await adminClient()
        .from('google_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing.data) {
        existingRefreshToken = existing.data.refresh_token_encrypted ?? null;
        existingGrantedScopes = existing.data.granted_scopes ?? null;
      }
    } catch (lookupErr) {
      console.warn('[Google OAuth DB Lookup Warning]:', lookupErr);
    }

    const queryScope = request.nextUrl.searchParams.get('scope');
    const rawScope = normalizeScopes(
      [token.scope, queryScope].filter(Boolean).join(' '),
    );
    const prevScopes = normalizeScopes(existingGrantedScopes);
    const mergedScopes =
      Array.from(
        new Set(
          [
            ...(prevScopes ? prevScopes.split(/\s+/) : []),
            ...(rawScope ? rawScope.split(/\s+/) : []),
          ].filter(Boolean),
        ),
      ).join(' ') || null;
    console.log('[Google OAuth Callback] Granted scopes saved:', mergedScopes);

    const baseValues: Record<string, unknown> = {
      user_id: user.id,
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: token.refresh_token
        ? encrypt(token.refresh_token)
        : existingRefreshToken,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      google_email: null,
    };

    let { error: saveError } = await adminClient()
      .from('google_connections')
      .upsert(
        { ...baseValues, granted_scopes: mergedScopes },
        { onConflict: 'user_id' },
      );

    if (saveError && saveError.code === '42703') {
      console.warn(
        '[Google OAuth DB Save] Column granted_scopes missing in DB, falling back to base columns',
      );
      const fallback = await adminClient()
        .from('google_connections')
        .upsert(baseValues, { onConflict: 'user_id' });
      saveError = fallback.error;
    }

    if (saveError) {
      console.error('[Google OAuth DB Save Error]:', saveError);
      throw saveError;
    }
    revalidatePath('/', 'layout');
    revalidatePath('/');
    const result = NextResponse.redirect(new URL('/?connected=1', origin));
    result.cookies.delete('google_oauth_state');
    return result;
  } catch (error) {
    console.error('[Google OAuth Callback Error]:', error);
    return redirect(
      error instanceof Error ? error.message : 'Google 연결 실패',
    );
  }
}
