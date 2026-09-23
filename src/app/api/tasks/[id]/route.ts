import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
import { sameOrigin } from '@/lib/security';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: '요청 출처를 확인할 수 없습니다.' }, { status: 403 });
  const { user, supabase } = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await request.json() as { completed?: unknown; status?: unknown };
  const values: Record<string, string | boolean | null> = {};
  if (typeof body.completed === 'boolean') values.override_completed = body.completed;
  if (typeof body.status === 'string' && body.status.length <= 100) values.override_status = body.status.trim() || null;
  if (!Object.keys(values).length) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });
  const { id } = await context.params;
  const { error } = await supabase.from('tasks').update(values).eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
