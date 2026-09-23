import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: true,
  sameOrigin: true,
  insertData: { id: 'task-1', source: 'manual', source_title: '새 업무' },
  insertError: null as Error | null,
}));

vi.mock('@/lib/security', () => ({
  sameOrigin: () => mock.sameOrigin,
}));

vi.mock('@/lib/supabase', () => ({
  currentUser: async () => ({
    user: mock.user ? { id: 'user-1' } : null,
    supabase: {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: mock.insertData,
              error: mock.insertError,
            }),
          }),
        }),
      }),
    },
  }),
}));

import { POST } from './route';

describe('수동 업무 생성 (POST /api/tasks)', () => {
  it('로그인하지 않은 요청은 401을 반환한다', async () => {
    mock.user = false;
    mock.sameOrigin = true;
    const response = await POST(
      new Request('http://localhost:3000/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: '업무' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('업무명이 없으면 400을 반환한다', async () => {
    mock.user = true;
    mock.sameOrigin = true;
    const response = await POST(
      new Request('http://localhost:3000/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: '   ' }),
      }),
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('업무명');
  });

  it('유효한 입력이면 201과 함께 생성된 태스크를 반환한다', async () => {
    mock.user = true;
    mock.sameOrigin = true;
    const response = await POST(
      new Request('http://localhost:3000/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: '새 업무',
          owner: '홍길동',
          status: '진행 중',
        }),
      }),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.task.source_title).toBe('새 업무');
  });
});
