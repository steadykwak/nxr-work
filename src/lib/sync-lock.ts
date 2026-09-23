import { randomUUID } from 'node:crypto';
import { adminClient } from './supabase';

export class SyncBusyError extends Error {
  constructor() {
    super('이미 동기화가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  }
}

export async function claimSync(userId: string, initial: boolean) {
  const id = randomUUID();
  const now = new Date();
  const expired = new Date(now.getTime() - 15 * 60_000).toISOString();
  let query = adminClient()
    .from('google_connections')
    .update({ sync_lock_id: id, sync_lock_at: now.toISOString() })
    .eq('user_id', userId)
    .or(`sync_lock_at.is.null,sync_lock_at.lt.${expired}`);
  query = initial
    ? query.is('initial_imported_at', null)
    : query.not('initial_imported_at', 'is', null);
  const { data, error } = await query.select('user_id');
  if (error) throw error;
  if (!data?.length) throw new SyncBusyError();
  return id;
}

export async function releaseSync(userId: string, lockId: string) {
  const { error } = await adminClient()
    .from('google_connections')
    .update({ sync_lock_id: null, sync_lock_at: null })
    .eq('user_id', userId)
    .eq('sync_lock_id', lockId);
  if (error) throw error;
}
