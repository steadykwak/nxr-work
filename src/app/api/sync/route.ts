import { NextResponse } from 'next/server';
import { currentUser, adminClient } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';
import { accessToken, connectionFor } from '@/lib/google';
import { fetchSheet } from '@/lib/sheets';
import { claimSync, releaseSync, SyncBusyError } from '@/lib/sync-lock';
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: '요청 출처를 확인할 수 없습니다.' },
      { status: 403 },
    );
  const { user } = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 },
    );
  let lockId: string | undefined;
  try {
    const connection = await connectionFor(user.id);
    if (!connection)
      return NextResponse.json(
        { error: 'Google 계정을 연결해 주세요.' },
        { status: 400 },
      );
    if (connection.initial_imported_at)
      return NextResponse.json(
        {
          error:
            '초기 동기화는 이미 완료됐습니다. 이후에는 NXR Work에서 시트로 동기화해 주세요.',
        },
        { status: 409 },
      );
    lockId = await claimSync(user.id, true);
    const token = await accessToken(user.id);
    const { tasks, warnings } = await fetchSheet(token);
    if (!tasks.length && warnings.length)
      throw new Error(
        '가져올 수 있는 업무가 없습니다. 시트의 ID와 업무명을 확인해 주세요.',
      );
    if (tasks.length) {
      const { error } = await adminClient()
        .from('tasks')
        .upsert(
          tasks.map((task) => ({
            ...task,
            user_id: user.id,
            source_synced_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id,source,source_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    const at = new Date().toISOString();
    const { data, error } = await adminClient()
      .from('google_connections')
      .update({ last_sheet_sync_at: at, initial_imported_at: at })
      .eq('user_id', user.id)
      .eq('sync_lock_id', lockId)
      .select('user_id');
    if (error) throw error;
    if (!data?.length) throw new SyncBusyError();
    return NextResponse.json({ imported: tasks.length, warnings, at });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '동기화 실패' },
      { status: error instanceof SyncBusyError ? 409 : 500 },
    );
  } finally {
    if (lockId) await releaseSync(user.id, lockId);
  }
}
