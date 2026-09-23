import { currentUser, adminClient } from '@/lib/supabase';
import { publicConfigured, googleConfigured } from '@/lib/config';
import {
  connectionFor,
  accessToken,
  calendarEvents,
  type CalendarEvent,
} from '@/lib/google';
import { todaySeoul } from '@/lib/dates';
import { redirect } from 'next/navigation';
import Dashboard, { type Task } from './dashboard';
export const dynamic = 'force-dynamic';
export default async function Home() {
  if (!publicConfigured()) redirect('/login');
  const { user, supabase } = await currentUser();
  if (!user) redirect('/login');
  const [{ data: tasks, error: taskError }, connection] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('source_due_date', { ascending: true }),
    googleConfigured()
      ? connectionFor(user.id).catch(() => null)
      : Promise.resolve(null),
  ]);
  let events: CalendarEvent[] = [];
  let calendarError: string | undefined;
  if (connection) {
    try {
      events = await calendarEvents(await accessToken(user.id));
      await adminClient()
        .from('google_connections')
        .update({ last_calendar_sync_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } catch (error) {
      calendarError =
        error instanceof Error ? error.message : '캘린더를 읽지 못했습니다.';
    }
  }
  return (
    <Dashboard
      configured
      googleReady={googleConfigured()}
      email={user.email}
      connected={Boolean(connection)}
      lastSync={connection?.last_sheet_sync_at ?? undefined}
      lastCalendarSync={connection?.last_calendar_sync_at ?? undefined}
      tasks={(tasks ?? []) as Task[]}
      events={events}
      today={todaySeoul()}
      dataError={taskError?.message}
      calendarError={calendarError}
    />
  );
}
