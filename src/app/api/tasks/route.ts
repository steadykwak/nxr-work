import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';

const ALLOWED_STATUSES = ['시작 전', '진행 중', '대기', '완료'] as const;

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: '요청 출처를 확인할 수 없습니다.' },
      { status: 403 },
    );
  }

  const { user, supabase } = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    owner?: unknown;
    createdDate?: unknown;
    dueDate?: unknown;
    status?: unknown;
    note?: unknown;
  };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json(
      { error: '업무명을 입력해 주세요.' },
      { status: 400 },
    );
  }

  const owner =
    typeof body.owner === 'string' && body.owner.trim()
      ? body.owner.trim()
      : null;

  const createdDate =
    typeof body.createdDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.createdDate)
      ? body.createdDate
      : null;

  const dueDate =
    typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
      ? body.dueDate
      : null;

  let status = '시작 전';
  if (
    typeof body.status === 'string' &&
    ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])
  ) {
    status = body.status;
  }

  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  const isCompleted = status === '완료';

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      source: 'manual',
      source_id: crypto.randomUUID(),
      source_title: title,
      source_owner: owner,
      source_created_date: createdDate,
      source_due_date: dueDate,
      source_status: status,
      source_completed: isCompleted,
      source_note: note,
    })
    .select(
      'id,source,source_id,source_title,source_owner,source_created_date,source_due_date,source_due_raw,source_completed,source_status,source_note,source_url,override_completed,override_status',
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, task: data }, { status: 201 });
}
