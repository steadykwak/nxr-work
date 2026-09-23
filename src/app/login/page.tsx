import { redirect } from 'next/navigation';
import { publicConfigured } from '@/lib/config';
import { currentUser } from '@/lib/supabase';
import LoginScreen from './screen';

export const dynamic = 'force-dynamic';

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const configured = publicConfigured();
  if (configured) {
    const { user } = await currentUser();
    if (user) redirect('/');
  }
  const { error } = await searchParams;
  return <LoginScreen configured={configured} error={error} />;
}
