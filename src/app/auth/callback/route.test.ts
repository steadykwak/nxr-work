import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ fail: false }));
vi.mock('@/lib/config', () => ({ required: () => 'test-config' }));
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
