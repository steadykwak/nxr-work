import { currentUser, adminClient } from '@/lib/supabase';
import { publicConfigured, googleConfigured } from '@/lib/config';
import {
  connectionFor,
  accessToken,
  calendarEvents,
  hasGoogleScope,
  GOOGLE_SHEETS_WRITE_SCOPE,
  type CalendarEvent,
} from '@/lib/google';
import { todaySeoul } from '@/lib/dates';
import { redirect } from 'next/navigation';
import Dashboard, { type Task } from './dashboard';
import { importFromSheet } from '@/lib/sheet-import';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!publicConfigured()) redirect('/login');
  const { user, supabase } = await currentUser();
  if (!user) redirect('/login');
  const [{ data: initialTasks, error: taskError }, initialConnection] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('source_due_date', { ascending: true }),
      googleConfigured()
        ? connectionFor(user.id).catch(() => null)
        : Promise.resolve(null),
    ]);

  let tasks = (initialTasks ?? []) as Task[];
  const connection = initialConnection;

  // 신규 유저 최초 대시보드 진입 시 시트 데이터 1회 자동 가져오기 (Import)
  if (connection && !connection.initial_imported_at) {
    try {
      const importResult = await importFromSheet(user.id);
      connection.initial_imported_at = importResult.at;
      const { data: refreshedTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('source_due_date', { ascending: true });
      if (refreshedTasks) tasks = refreshedTasks as Task[];
    } catch (importError) {
      console.error('[Auto Initial Import Error]:', importError);
    }
  }

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
      initialImportedAt={connection?.initial_imported_at ?? undefined}
      lastExportAt={connection?.last_sheet_export_at ?? undefined}
      lastExportError={connection?.last_sheet_export_error ?? undefined}
      writeAccess={hasGoogleScope(
        connection?.granted_scopes ?? null,
        GOOGLE_SHEETS_WRITE_SCOPE,
      )}
      syncInProgress={Boolean(
        connection?.sync_lock_at &&
        Date.now() - new Date(connection.sync_lock_at).getTime() < 15 * 60_000,
      )}
      lastCalendarSync={connection?.last_calendar_sync_at ?? undefined}
      tasks={tasks}
      events={events}
      today={todaySeoul()}
      dataError={taskError?.message}
      calendarError={calendarError}
    />
  );
}
