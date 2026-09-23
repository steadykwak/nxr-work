export function publicConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY &&
    process.env.GOOGLE_SPREADSHEET_ID &&
    process.env.GOOGLE_SHEET_NAME &&
    process.env.GOOGLE_SHEET_DATE_YEAR &&
    process.env.NEXT_PUBLIC_SITE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

export const PRODUCTION_SITE_URL = 'https://nxr-work.vercel.app';
export const LOCAL_SITE_URL = 'http://localhost:3000';

/**
 * OAuth redirects only target an explicitly allowed application origin.
 * Vercel preview hosts also return to the canonical production app instead of
 * trusting a forwarded Host header or an arbitrary preview domain.
 */
export function siteUrl() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  )
    return PRODUCTION_SITE_URL;

  if (process.env.NODE_ENV === 'development') return LOCAL_SITE_URL;

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return LOCAL_SITE_URL;
  try {
    const origin = new URL(configured).origin;
    if (origin === PRODUCTION_SITE_URL || origin === LOCAL_SITE_URL)
      return origin;
  } catch {
    // Report the same safe configuration error below.
  }
  throw new Error(
    `NEXT_PUBLIC_SITE_URL은 ${LOCAL_SITE_URL} 또는 ${PRODUCTION_SITE_URL}이어야 합니다.`,
  );
}
