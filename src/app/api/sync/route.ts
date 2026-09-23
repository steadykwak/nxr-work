import { NextResponse } from 'next/server';
import { currentUser, adminClient } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';
import { accessToken } from '@/lib/google';
import { fetchSheet } from '@/lib/sheets';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: '요청 출처를 확인할 수 없습니다.' }, { status: 403 });
  const { user } = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const token = await accessToken(user.id);
    const { tasks, warnings } = await fetchSheet(token);
    if (tasks.length) {
      const { error } = await adminClient().from('tasks').upsert(tasks.map(task => ({ ...task, user_id: user.id, source_synced_at: new Date().toISOString() })), { onConflict: 'user_id,source,source_id' });
      if (error) throw error;
    }
    const at = new Date().toISOString();
    await adminClient().from('google_connections').update({ last_sheet_sync_at: at }).eq('user_id', user.id);
    return NextResponse.json({ imported: tasks.length, warnings, at });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '동기화 실패' }, { status: 500 });
  }
}
