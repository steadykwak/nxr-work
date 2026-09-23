import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  initialized: false,
  claim: vi.fn(),
  release: vi.fn(),
  token: vi.fn(),
  fetchSheet: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('./google', () => ({
  connectionFor: async () => ({
    initial_imported_at: mock.initialized ? '2026-09-23' : null,
  }),
  accessToken: mock.token,
}));
vi.mock('./sheets', () => ({ fetchSheet: mock.fetchSheet }));
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
            upsert: mock.upsert,
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

import { importFromSheet } from './sheet-import';

beforeEach(() => {
  vi.clearAllMocks();
  mock.initialized = false;
  mock.claim.mockResolvedValue('lock-1');
  mock.release.mockResolvedValue(undefined);
  mock.token.mockResolvedValue('token');
  mock.fetchSheet.mockResolvedValue({
    tasks: [{ source: 'sheet', source_id: 'task-1' }],
    warnings: [],
  });
  mock.upsert.mockResolvedValue({ error: null });
});

describe('공통 시트 가져오기 로직', () => {
  it('최초 1회 가져오기를 수행하고 락을 해제한다', async () => {
    const result = await importFromSheet('user-1');
    expect(result.alreadyImported).toBe(false);
    expect(result.imported).toBe(1);
    expect(mock.claim).toHaveBeenCalledWith('user-1', true);
    expect(mock.fetchSheet).toHaveBeenCalledWith('token');
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ source_id: 'task-1' })]),
      { onConflict: 'user_id,source,source_id', ignoreDuplicates: true },
    );
    expect(mock.release).toHaveBeenCalledWith('user-1', 'lock-1');
  });

  it('이미 완료된 경우 중복 가져오기를 건너뛴다', async () => {
    mock.initialized = true;
    const result = await importFromSheet('user-1');
    expect(result.alreadyImported).toBe(true);
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.fetchSheet).not.toHaveBeenCalled();
  });
});
