import { accessToken, connectionFor } from './google';
import { fetchSheet, type ImportWarning } from './sheets';
import { adminClient } from './supabase';
import { claimSync, releaseSync, SyncBusyError } from './sync-lock';

export type ImportResult = {
  alreadyImported: boolean;
  imported: number;
  warnings: ImportWarning[];
  at: string;
};

export async function importFromSheet(userId: string): Promise<ImportResult> {
  const connection = await connectionFor(userId);
  if (!connection) throw new Error('Google 계정을 연결해 주세요.');
  if (connection.initial_imported_at) {
    return {
      alreadyImported: true,
      imported: 0,
      warnings: [],
      at: connection.initial_imported_at,
    };
  }
  const lockId = await claimSync(userId, true);
  try {
    const token = await accessToken(userId);
    const { tasks, warnings } = await fetchSheet(token);
    if (!tasks.length && warnings.length) {
      throw new Error(
        '가져올 수 있는 업무가 없습니다. 시트의 ID와 업무명을 확인해 주세요.',
      );
    }
    if (tasks.length) {
      const { error } = await adminClient()
        .from('tasks')
        .upsert(
          tasks.map((task) => ({
            ...task,
            user_id: userId,
            source_synced_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id,source,source_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    const at = new Date().toISOString();
    let { data, error } = await adminClient()
      .from('google_connections')
      .update({ last_sheet_sync_at: at, initial_imported_at: at })
      .eq('user_id', userId)
      .eq('sync_lock_id', lockId)
      .select('user_id');

    if (error && error.code === '42703') {
      const fallback = await adminClient()
        .from('google_connections')
        .update({ last_sheet_sync_at: at })
        .eq('user_id', userId)
        .eq('sync_lock_id', lockId)
        .select('user_id');
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    if (!data?.length) throw new SyncBusyError();
    return { alreadyImported: false, imported: tasks.length, warnings, at };
  } finally {
    await releaseSync(userId, lockId);
  }
}
