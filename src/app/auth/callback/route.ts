import { NextRequest, NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await userClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL('/', request.url));
}
