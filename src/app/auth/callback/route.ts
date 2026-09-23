import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { required } from '@/lib/config';

export async function GET(request: NextRequest) {
  const login = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  if (request.nextUrl.searchParams.has('error')) return login('cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return login('callback');

  let response = NextResponse.redirect(new URL('/', request.url));
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
          response = NextResponse.redirect(new URL('/', request.url));
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const flowId = request.nextUrl.searchParams.get('sb_flow_id');
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) return login('exchange');
    return response;
  } catch {
    return login('exchange');
  }
}
