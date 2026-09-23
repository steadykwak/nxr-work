import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ fail: false }));
vi.mock('@/lib/config', () => ({
  required: () => 'test-config',
  siteUrl: () =>
    process.env.VERCEL_ENV === 'production'
      ? 'https://nxr-work.vercel.app'
      : 'http://localhost:3000',
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    config: {
      cookies: {
        setAll: (
          items: { name: string; value: string; options: { path: string } }[],
        ) => void;
      };
    },
  ) => ({
    auth: {
      exchangeCodeForSession: async () => {
        if (mock.fail) return { error: new Error('exchange failed') };
        config.cookies.setAll([
          { name: 'test-session', value: 'stored', options: { path: '/' } },
        ]);
        return { error: null };
      },
    },
  }),
}));

import { GET } from './route';

describe('Supabase OAuth callback', () => {
  it('provider cancellation returns to the styled login route', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/auth/callback?error=access_denied',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=cancelled',
    );
  });
  it('a missing code returns to the login route', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/auth/callback'),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=callback',
    );
  });
  it('stores the exchanged session in the redirect response', async () => {
    mock.fail = false;
    const response = await GET(
      new NextRequest('http://localhost:3000/auth/callback?code=test-code'),
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
    expect(response.cookies.get('test-session')?.value).toBe('stored');
  });
  it('production callback returns to the canonical deployed app', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const response = await GET(
      new NextRequest('https://untrusted.example/auth/callback?code=test-code'),
    );
    expect(response.headers.get('location')).toBe(
      'https://nxr-work.vercel.app/',
    );
    vi.unstubAllEnvs();
  });
  it('does not trust an arbitrary callback request host locally', async () => {
    const response = await GET(
      new NextRequest(
        'https://untrusted.example/auth/callback?error=access_denied',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=cancelled',
    );
  });
  it('shows the app error route after exchange failure', async () => {
    mock.fail = true;
    const response = await GET(
      new NextRequest('http://localhost:3000/auth/callback?code=test-code'),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=exchange',
    );
  });
});
