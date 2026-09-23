import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { required, siteUrl } from '@/lib/config';
import { adminClient } from '@/lib/supabase';
import { encrypt } from '@/lib/security';
import { normalizeScopes } from '@/lib/google';

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

    if (data?.session?.user && data.session.provider_token) {
      try {
        const existing = await adminClient()
          .from('google_connections')
          .select('refresh_token_encrypted, granted_scopes')
          .eq('user_id', data.session.user.id)
          .maybeSingle();

        const refreshToken = data.session.provider_refresh_token
          ? encrypt(data.session.provider_refresh_token)
          : (existing.data?.refresh_token_encrypted ?? null);

        const queryScope = request.nextUrl.searchParams.get('scope');
        const rawScope = normalizeScopes(queryScope);
        const prevScopes = normalizeScopes(existing.data?.granted_scopes);
        const mergedScopes =
          Array.from(
            new Set(
              [
                ...(prevScopes ? prevScopes.split(/\s+/) : []),
                ...(rawScope ? rawScope.split(/\s+/) : []),
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/calendar.events.readonly',
              ].filter(Boolean),
            ),
          ).join(' ') || null;

        const values = {
          access_token_encrypted: encrypt(data.session.provider_token),
          refresh_token_encrypted: refreshToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          google_email: data.session.user.email ?? null,
          granted_scopes: mergedScopes,
        };

        if (existing.data) {
          await adminClient()
            .from('google_connections')
            .update(values)
            .eq('user_id', data.session.user.id);
        } else {
          await adminClient()
            .from('google_connections')
            .insert({ user_id: data.session.user.id, ...values });
        }
      } catch (saveError) {
        console.error('[auth/callback] Failed to save google_connections:', saveError);
      }
    }

    return response;
  } catch (err) {
    console.error('[auth/callback] Unexpected Error:', err);
    return login('exchange');
  }
}
