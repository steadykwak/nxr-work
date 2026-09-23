import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  imported: false,
  upsert: vi.fn(),
  fetchSheet: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
}));
vi.mock('@/lib/security', () => ({ sameOrigin: () => true }));
vi.mock('@/lib/supabase', () => ({
  currentUser: async () => ({ user: { id: 'user-1' } }),
  adminClient: () => ({
    from: () => ({
      upsert: mock.upsert,
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => ({
              data: [{ user_id: 'user-1' }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/google', () => ({
  connectionFor: async () => ({
    initial_imported_at: mock.imported ? '2026-09-23' : null,
  }),
  accessToken: async () => 'token',
}));
vi.mock('@/lib/sheets', () => ({ fetchSheet: mock.fetchSheet }));
vi.mock('@/lib/sync-lock', () => ({
  claimSync: mock.claim,
  releaseSync: mock.release,
  SyncBusyError: class SyncBusyError extends Error {},
}));
import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mock.imported = false;
  mock.claim.mockResolvedValue('lock-1');
  mock.release.mockResolvedValue(undefined);
  mock.fetchSheet.mockResolvedValue({
    tasks: [{ source: 'sheet', source_id: 'task-1' }],
    warnings: [],
  });
  mock.upsert.mockResolvedValue({ error: null });
});

describe('최초 1회 시트 가져오기', () => {
  it('기존 업무는 보존하는 insert-only upsert를 실행한다', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/sync', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(mock.upsert.mock.calls[0][1]).toEqual({
      onConflict: 'user_id,source,source_id',
      ignoreDuplicates: true,
    });
    expect(mock.release).toHaveBeenCalledWith('user-1', 'lock-1');
  });

  it('완료 이후 재가져오기는 서버에서 차단한다', async () => {
    mock.imported = true;
    const response = await POST(
      new Request('http://localhost:3000/api/sync', { method: 'POST' }),
    );
    expect(response.status).toBe(409);
    expect(mock.fetchSheet).not.toHaveBeenCalled();
    expect(mock.upsert).not.toHaveBeenCalled();
  });
});
