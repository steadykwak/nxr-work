import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  importResult: {
    alreadyImported: false,
    imported: 1,
    warnings: [],
    at: '2026-09-23',
  },
  importFromSheet: vi.fn(),
}));

vi.mock('@/lib/security', () => ({ sameOrigin: () => true }));
vi.mock('@/lib/supabase', () => ({
  currentUser: async () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/sheet-import', () => ({
  importFromSheet: mock.importFromSheet,
}));
vi.mock('@/lib/sync-lock', () => ({
  SyncBusyError: class SyncBusyError extends Error {},
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mock.importFromSheet.mockImplementation(async () => mock.importResult);
});

describe('최초 1회 시트 가져오기 API', () => {
  it('로그인한 사용자의 초기 가져오기를 호출한다', async () => {
    mock.importResult = {
      alreadyImported: false,
      imported: 1,
      warnings: [],
      at: '2026-09-23',
    };
    const response = await POST(
      new Request('http://localhost:3000/api/sync', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(mock.importFromSheet).toHaveBeenCalledWith('user-1');
  });

  it('이미 완료된 경우 409를 반환한다', async () => {
    mock.importResult = {
      alreadyImported: true,
      imported: 0,
      warnings: [],
      at: '2026-09-23',
    };
    const response = await POST(
      new Request('http://localhost:3000/api/sync', { method: 'POST' }),
    );
    expect(response.status).toBe(409);
    expect(mock.importFromSheet).toHaveBeenCalledWith('user-1');
  });
});
