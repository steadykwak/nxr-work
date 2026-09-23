import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_SITE_URL, PRODUCTION_SITE_URL, siteUrl } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('허용된 앱 URL', () => {
  it('로컬 개발에서는 localhost를 사용한다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', PRODUCTION_SITE_URL);
    expect(siteUrl()).toBe(LOCAL_SITE_URL);
  });

  it('Vercel 운영 및 프리뷰에서는 고정된 운영 도메인을 사용한다', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', LOCAL_SITE_URL);
    expect(siteUrl()).toBe(PRODUCTION_SITE_URL);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(siteUrl()).toBe(PRODUCTION_SITE_URL);
  });

  it('그 밖의 실행 환경에서는 임의의 도메인을 거부한다', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://untrusted.example');
    expect(() => siteUrl()).toThrow('NEXT_PUBLIC_SITE_URL');
  });
});
