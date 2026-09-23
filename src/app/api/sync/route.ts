import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';
import { importFromSheet } from '@/lib/sheet-import';
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
    const result = await importFromSheet(user.id);
    if (result.alreadyImported) {
      return NextResponse.json(
        {
          error:
            '초기 동기화는 이미 완료됐습니다. 이후에는 NXR Work에서 시트로 동기화해 주세요.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '동기화 실패' },
      { status: error instanceof SyncBusyError ? 409 : 500 },
    );
  }
}

