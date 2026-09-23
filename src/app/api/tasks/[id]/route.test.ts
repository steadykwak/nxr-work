import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: true,
  task: {
    id: 'task-1',
    user_id: 'user-1',
    source: 'sheet',
    source_completed: false,
    source_status: '시작 전',
  },
  updateError: null as Error | null,
  deleteError: null as Error | null,
}));

vi.mock('@/lib/security', () => ({
  sameOrigin: () => true,
}));

vi.mock('@/lib/supabase', () => ({
  currentUser: async () => ({
    user: mock.user ? { id: 'user-1' } : null,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: mock.task,
                error: mock.task ? null : new Error('not found'),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: mock.updateError }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              eq: async () => ({ error: mock.deleteError }),
            }),
          }),
        }),
      }),
    },
  }),
  adminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { ...mock.task, source_title: '수정됨' },
                  error: mock.updateError,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { DELETE, PATCH } from './route';

describe('태스크 수정 및 삭제 (PATCH, DELETE /api/tasks/[id])', () => {
  it('시트 업무의 상태를 완료로 변경하면 override_completed도 true가 된다', async () => {
    mock.task = {
      id: 'task-1',
      user_id: 'user-1',
      source: 'sheet',
      source_completed: false,
      source_status: '시작 전',
    };
    const response = await PATCH(
      new Request('http://localhost:3000/api/tasks/task-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: '완료' }),
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });

  it('수동 업무(manual)는 원본 필드를 수정할 수 있다', async () => {
    mock.task = {
      id: 'manual-task-1',
      user_id: 'user-1',
      source: 'manual',
      source_completed: false,
      source_status: '시작 전',
    };
    const response = await PATCH(
      new Request('http://localhost:3000/api/tasks/manual-task-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: '수정된 업무명', status: '진행 중' }),
      }),
      { params: Promise.resolve({ id: 'manual-task-1' }) },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });

  it('시트 업무(sheet)는 삭제할 수 없고 400을 반환한다', async () => {
    mock.task = {
      id: 'sheet-task-1',
      user_id: 'user-1',
      source: 'sheet',
      source_completed: false,
      source_status: '시작 전',
    };
    const response = await DELETE(
      new Request('http://localhost:3000/api/tasks/sheet-task-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'sheet-task-1' }) },
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('구글 시트');
  });

  it('수동 업무(manual)는 정상적으로 삭제된다', async () => {
    mock.task = {
      id: 'manual-task-1',
      user_id: 'user-1',
      source: 'manual',
      source_completed: false,
      source_status: '시작 전',
    };
    const response = await DELETE(
      new Request('http://localhost:3000/api/tasks/manual-task-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'manual-task-1' }) },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });
});
