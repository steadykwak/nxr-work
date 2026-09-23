import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';
import { exportToSheet } from '@/lib/sheet-export';
import { SyncBusyError } from '@/lib/sync-lock';

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
  try {
    return NextResponse.json(await exportToSheet(user.id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '동기화 실패' },
      { status: error instanceof SyncBusyError ? 409 : 400 },
    );
  }
}
