import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: true, exportToSheet: vi.fn() }));
vi.mock('@/lib/security', () => ({ sameOrigin: () => true }));
vi.mock('@/lib/supabase', () => ({
  currentUser: async () => ({ user: mock.user ? { id: 'user-1' } : null }),
}));
vi.mock('@/lib/sheet-export', () => ({ exportToSheet: mock.exportToSheet }));
vi.mock('@/lib/sync-lock', () => ({
  SyncBusyError: class SyncBusyError extends Error {},
}));
import { POST } from './route';

describe('수동 지금 동기화', () => {
  it('로그인한 사용자 ID만 공통 내보내기 함수에 전달한다', async () => {
    mock.user = true;
    mock.exportToSheet.mockResolvedValue({
      exported: 1,
      at: '2026-09-23T00:00:00Z',
    });
    const response = await POST(
      new Request('http://localhost:3000/api/sync/export', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(mock.exportToSheet).toHaveBeenCalledWith('user-1');
  });

  it('로그인하지 않은 요청은 시트 내보내기를 실행하지 않는다', async () => {
    mock.user = false;
    mock.exportToSheet.mockClear();
    const response = await POST(
      new Request('http://localhost:3000/api/sync/export', { method: 'POST' }),
    );
    expect(response.status).toBe(401);
    expect(mock.exportToSheet).not.toHaveBeenCalled();
  });
});
