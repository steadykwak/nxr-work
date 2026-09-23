import { NextRequest, NextResponse } from 'next/server';
import { currentUser, adminClient } from '@/lib/supabase';
import { encrypt } from '@/lib/security';
import { required } from '@/lib/config';
export async function GET(request: NextRequest) {
  const redirect = (message: string) => NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, request.url));
  const state = request.nextUrl.searchParams.get('state');
  if (!state || state !== request.cookies.get('google_oauth_state')?.value) return redirect('OAuth 상태 확인 실패');
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return redirect('Google 연결이 취소되었습니다');
  const { user } = await currentUser();
  if (!user) return redirect('로그인 세션이 만료되었습니다');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: `${required('NEXT_PUBLIC_SITE_URL')}/api/google/callback`, grant_type: 'authorization_code' }), cache: 'no-store' });
    if (!response.ok) throw new Error(`토큰 교환 실패 (${response.status})`);
    const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const existing = await adminClient().from('google_connections').select('refresh_token_encrypted').eq('user_id', user.id).maybeSingle();
    const { error } = await adminClient().from('google_connections').upsert({ user_id: user.id, access_token_encrypted: encrypt(token.access_token), refresh_token_encrypted: token.refresh_token ? encrypt(token.refresh_token) : existing.data?.refresh_token_encrypted ?? null, expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), google_email: null }, { onConflict: 'user_id' });
    if (error) throw error;
    const result = NextResponse.redirect(new URL('/?connected=1', request.url));
    result.cookies.delete('google_oauth_state');
    return result;
  } catch (error) { return redirect(error instanceof Error ? error.message : 'Google 연결 실패'); }
}
