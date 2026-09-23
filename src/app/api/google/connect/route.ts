import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { currentUser } from '@/lib/supabase';
import { googleConfigured, required, siteUrl } from '@/lib/config';
export async function GET() {
  const origin = siteUrl();
  if (!googleConfigured())
    return NextResponse.redirect(new URL('/?error=google-config', origin));
  const { user } = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/', origin));
  const state = randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: required('GOOGLE_CLIENT_ID'),
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope:
      'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events.readonly',
    include_granted_scopes: 'true',
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
