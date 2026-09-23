import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { required, siteUrl } from '@/lib/config';
import { adminClient } from '@/lib/supabase';
import { encrypt } from '@/lib/security';
import { normalizeScopes } from '@/lib/google';
import { importFromSheet } from '@/lib/sheet-import';

export async function GET(request: NextRequest) {
  const origin = siteUrl();
  const login = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, origin));
  if (request.nextUrl.searchParams.has('error')) return login('cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return login('callback');

  let response = NextResponse.redirect(new URL('/', origin));
  const supabase = createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          items: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(new URL('/', origin));
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const flowId = request.nextUrl.searchParams.get('sb_flow_id');
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      console.error('[auth/callback] ExchangeCodeForSession Error:', error);
      return login('exchange');
    }

    const session = data?.session;
    const user = session?.user;
    const userId = user?.id;
    const email = user?.email;
    const providerToken = session?.provider_token;
    const providerRefreshToken = session?.provider_refresh_token;

    if (userId && providerToken) {
      try {
        let existingRefreshToken: string | null = null;
        let existingGrantedScopes: string | null = null;
        let alreadyImported = false;

        // DB 기존 연결 조회 (컬럼 미존재 시 대비 방어)
        try {
          const existing = await adminClient()
            .from('google_connections')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          if (existing.data) {
            existingRefreshToken = existing.data.refresh_token_encrypted ?? null;
            existingGrantedScopes = existing.data.granted_scopes ?? null;
            alreadyImported = Boolean(existing.data.initial_imported_at);
          }
        } catch (lookupErr) {
          console.warn('[auth/callback] Lookup warning:', lookupErr);
        }

        const refreshToken = providerRefreshToken
          ? encrypt(providerRefreshToken)
          : existingRefreshToken;

        const queryScope = request.nextUrl.searchParams.get('scope');
        const rawScope = normalizeScopes(queryScope);
        const prevScopes = normalizeScopes(existingGrantedScopes);
        const mergedScopes =
          Array.from(
            new Set(
              [
                ...(prevScopes ? prevScopes.split(/\s+/) : []),
                ...(rawScope ? rawScope.split(/\s+/) : []),
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar.events.readonly',
              ].filter(Boolean),
            ),
          ).join(' ') || null;

        const baseValues: Record<string, unknown> = {
          user_id: userId,
          access_token_encrypted: encrypt(providerToken),
          refresh_token_encrypted: refreshToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          google_email: email ?? null,
        };

        // 1차 시도: granted_scopes 포함 UPSERT
        let { error: upsertError } = await adminClient()
          .from('google_connections')
          .upsert(
            { ...baseValues, granted_scopes: mergedScopes },
            { onConflict: 'user_id' },
          );

        // 만약 DB에 granted_scopes 컬럼이 아직 없는 경우 (code 42703), granted_scopes를 제외하고 2차 시도
        if (upsertError && upsertError.code === '42703') {
          console.warn(
            '[auth/callback] Column granted_scopes missing in DB, falling back to base columns',
          );
          const fallback = await adminClient()
            .from('google_connections')
            .upsert(baseValues, { onConflict: 'user_id' });
          upsertError = fallback.error;
        }

        if (upsertError) {
          console.error('[CRITICAL DB UPSERT ERROR]:', upsertError);
          return NextResponse.redirect(
            new URL(
              `/?error=${encodeURIComponent(upsertError.message || 'DB 저장 실패')}`,
              request.url,
            ),
          );
        }

        // DB 저장 성공 시 최초 1회 자동 시트 Import 실행
        if (!alreadyImported) {
          try {
            await importFromSheet(userId);
          } catch (importErr) {
            console.error(
              '[auth/callback] Auto initial sheet import error:',
              importErr,
            );
          }
        }
      } catch (saveError) {
        console.error('[CRITICAL DB UPSERT ERROR]:', saveError);
        const message =
          saveError instanceof Error ? saveError.message : 'DB 저장 중 예외 발생';
        return NextResponse.redirect(
          new URL(`/?error=${encodeURIComponent(message)}`, request.url),
        );
      }
    }

    try {
      revalidatePath('/', 'layout');
      revalidatePath('/');
    } catch {
      // Invariant: static generation store missing in test environments
    }
    return response;
  } catch (err) {
    console.error('[auth/callback] Unexpected Error:', err);
    return login('exchange');
  }
}
