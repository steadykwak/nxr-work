import { NextResponse } from 'next/server';
import { adminClient, currentUser } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';

const ALLOWED_STATUSES = ['시작 전', '진행 중', '대기', '완료'] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;

  // 대상 태스크 조회 (소유권 및 source 확인)
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('id, user_id, source, source_completed, source_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !task) {
    return NextResponse.json(
      { error: '업무를 찾을 수 없습니다.' },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    completed?: unknown;
    status?: unknown;
    title?: unknown;
    owner?: unknown;
    createdDate?: unknown;
    dueDate?: unknown;
    note?: unknown;
  };

  if (task.source === 'sheet') {
    // 시트 업무: override_* 필드만 수정
    const values: Record<string, string | boolean | null> = {};

    if (typeof body.status === 'string' && body.status.length <= 100) {
      const trimmedStatus = body.status.trim();
      values.override_status = trimmedStatus || null;
      if (trimmedStatus === '완료') {
        values.override_completed = true;
      } else if (typeof body.completed !== 'boolean' && body.completed === undefined) {
        // 완료가 아닌 다른 상태로 변경 시, completed가 명시되지 않았다면 false로 설정
        values.override_completed = false;
      }
    }

    if (typeof body.completed === 'boolean') {
      values.override_completed = body.completed;
      if (body.completed && !values.override_status) {
        values.override_status = '완료';
      }
    }

    if (!Object.keys(values).length) {
      return NextResponse.json(
        { error: '변경할 값이 없습니다.' },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update(values)
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // 수동 업무 (source === 'manual'): 원본 필드 직접 수정 가능
  // DB 트리거 우회를 위해 adminClient(service_role) 사용하되, 소유권과 source='manual' 철저히 제한
  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const trimmedTitle = body.title.trim();
    if (!trimmedTitle) {
      return NextResponse.json(
        { error: '업무명을 입력해 주세요.' },
        { status: 400 },
      );
    }
    updates.source_title = trimmedTitle;
  }

  if (typeof body.owner === 'string') {
    updates.source_owner = body.owner.trim() || null;
  } else if (body.owner === null) {
    updates.source_owner = null;
  }

  if (typeof body.createdDate === 'string') {
    updates.source_created_date = /^\d{4}-\d{2}-\d{2}$/.test(body.createdDate)
      ? body.createdDate
      : null;
  } else if (body.createdDate === null) {
    updates.source_created_date = null;
  }

  if (typeof body.dueDate === 'string') {
    updates.source_due_date = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
      ? body.dueDate
      : null;
  } else if (body.dueDate === null) {
    updates.source_due_date = null;
  }

  if (typeof body.status === 'string') {
    const statusVal = body.status.trim();
    if (ALLOWED_STATUSES.includes(statusVal as (typeof ALLOWED_STATUSES)[number])) {
      updates.source_status = statusVal;
      if (statusVal === '완료') {
        updates.source_completed = true;
      } else if (typeof body.completed !== 'boolean') {
        updates.source_completed = false;
      }
    }
  }

  if (typeof body.completed === 'boolean') {
    updates.source_completed = body.completed;
    if (body.completed && !updates.source_status) {
      updates.source_status = '완료';
    }
  }

  if (typeof body.note === 'string') {
    updates.source_note = body.note.trim() || null;
  } else if (body.note === null) {
    updates.source_note = null;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json(
      { error: '변경할 값이 없습니다.' },
      { status: 400 },
    );
  }

  const { data: updatedTask, error: updateError } = await adminClient()
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('source', 'manual')
    .select(
      'id,source,source_id,source_title,source_owner,source_created_date,source_due_date,source_due_raw,source_completed,source_status,source_note,source_url,override_completed,override_status',
    )
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, task: updatedTask });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;

  // 대상 태스크 조회 (source 검증)
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('id, user_id, source')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !task) {
    return NextResponse.json(
      { error: '업무를 찾을 수 없습니다.' },
      { status: 404 },
    );
  }

  if (task.source === 'sheet') {
    return NextResponse.json(
      { error: '구글 시트 연동 업무는 삭제할 수 없습니다.' },
      { status: 400 },
    );
  }

  const { error: deleteError } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('source', 'manual');

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

