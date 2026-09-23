import {
  accessToken,
  connectionFor,
  GOOGLE_SHEETS_WRITE_SCOPE,
} from './google';
import { writeSheetTasks, type ExportTask } from './sheets';
import { adminClient } from './supabase';
import { claimSync, releaseSync, SyncBusyError } from './sync-lock';

export async function exportToSheet(userId: string) {
  const connection = await connectionFor(userId);
  if (!connection) throw new Error('Google 계정을 연결해 주세요.');
  if (!connection.initial_imported_at)
    throw new Error(
      'Google Sheets → NXR Work 초기 동기화를 먼저 완료해 주세요.',
    );
  const lockId = await claimSync(userId, false);
  try {
    const token = await accessToken(userId, GOOGLE_SHEETS_WRITE_SCOPE);
    const tasks: ExportTask[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await adminClient()
        .from('tasks')
        .select(
          'id,source_id,source_completed,source_status,override_completed,override_status',
        )
        .eq('user_id', userId)
        .eq('source', 'sheet')
        .order('id')
        .range(offset, offset + 499);
      if (error) throw error;
      tasks.push(...((data ?? []) as ExportTask[]));
      if ((data ?? []).length < 500) break;
    }
    const exported = await writeSheetTasks(token, tasks);
    const at = new Date().toISOString();
    const { data, error } = await adminClient()
      .from('google_connections')
      .update({ last_sheet_export_at: at, last_sheet_export_error: null })
      .eq('user_id', userId)
      .eq('sync_lock_id', lockId)
      .select('user_id');
    if (error) throw error;
    if (!data?.length) throw new SyncBusyError();
    return { exported, at };
  } catch (error) {
    await adminClient()
      .from('google_connections')
      .update({
        last_sheet_export_error:
          error instanceof Error ? error.message : 'Google Sheets 동기화 실패',
      })
      .eq('user_id', userId)
      .eq('sync_lock_id', lockId);
    throw error;
  } finally {
    await releaseSync(userId, lockId);
  }
}
