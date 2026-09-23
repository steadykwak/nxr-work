import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  initialized: false,
  claim: vi.fn(),
  release: vi.fn(),
  token: vi.fn(),
  write: vi.fn(),
}));
vi.mock('./google', () => ({
  connectionFor: async () => ({
    initial_imported_at: mock.initialized ? '2026-09-23' : null,
  }),
  accessToken: mock.token,
  GOOGLE_SHEETS_WRITE_SCOPE: 'write-scope',
}));
vi.mock('./sheets', () => ({ writeSheetTasks: mock.write }));
vi.mock('./sync-lock', () => ({
  claimSync: mock.claim,
  releaseSync: mock.release,
  SyncBusyError: class SyncBusyError extends Error {},
}));
vi.mock('./supabase', () => ({
  adminClient: () => ({
    from: (table: string) =>
      table === 'tasks'
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    range: async () => ({
                      data: [
                        {
                          id: 'task-uuid-1',
                          source_id: 'task-1',
                          source_completed: false,
                          source_status: '대기',
                          override_completed: true,
                          override_status: null,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        : {
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
          },
  }),
}));
import { exportToSheet } from './sheet-export';

beforeEach(() => {
  vi.clearAllMocks();
  mock.initialized = false;
  mock.claim.mockResolvedValue('lock-1');
  mock.release.mockResolvedValue(undefined);
  mock.token.mockResolvedValue('token');
  mock.write.mockResolvedValue(1);
});

describe('공통 시트 내보내기 로직', () => {
  it('초기 가져오기 전에는 토큰과 시트에 접근하지 않는다', async () => {
    await expect(exportToSheet('user-1')).rejects.toThrow('초기 동기화');
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.write).not.toHaveBeenCalled();
  });

  it('해당 사용자의 sheet 업무만 쓰기 권한으로 내보낸다', async () => {
    mock.initialized = true;
    expect(await exportToSheet('user-1')).toMatchObject({ exported: 1 });
    expect(mock.claim).toHaveBeenCalledWith('user-1', false);
    expect(mock.token).toHaveBeenCalledWith('user-1', 'write-scope');
    expect(mock.write).toHaveBeenCalledWith('token', [
      expect.objectContaining({ id: 'task-uuid-1', source_id: 'task-1' }),
    ]);
    expect(mock.release).toHaveBeenCalledWith('user-1', 'lock-1');
  });
});
