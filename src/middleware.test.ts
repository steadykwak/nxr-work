import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ authenticated: false }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mock.authenticated ? { id: 'user-1' } : null },
      }),
    },
  }),
}));

import { middleware } from './middleware';

afterEach(() => {
  vi.unstubAllEnvs();
  mock.authenticated = false;
});

describe('login route guard', () => {
  it('redirects unauthenticated visitors before rendering tasks', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    const response = await middleware(
      new NextRequest('http://localhost:3000/'),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });
  it('redirects signed-in visitors away from the login page', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    mock.authenticated = true;
    const response = await middleware(
      new NextRequest('http://localhost:3000/login'),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });
});
