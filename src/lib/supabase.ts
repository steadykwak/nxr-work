import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { required } from './config';

export async function userClient() {
  const store = await cookies();
  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(
          items: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) {
          try {
            items.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server Component read */
          }
        },
      },
    },
  );
}
export function adminClient() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    process.env.SUPABASE_SECRET_KEY || required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function currentUser() {
  const supabase = await userClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
