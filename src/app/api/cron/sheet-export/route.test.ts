import { afterEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ exportToSheet: vi.fn() }));
vi.mock('@/lib/sheet-export', () => ({ exportToSheet: mock.exportToSheet }));
vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        not: () => ({
          order: () => ({
            range: async () => ({
              data: [{ user_id: 'user-1' }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
import { GET } from './route';

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

describe('시간별 서버 동기화', () => {
  it('비밀값이 없거나 다르면 실행하지 않는다', async () => {
    const request = new Request('http://localhost:3000/api/cron/sheet-export');
    expect((await GET(request)).status).toBe(401);
    process.env.CRON_SECRET = 'test-secret';
    expect((await GET(request)).status).toBe(401);
    expect(mock.exportToSheet).not.toHaveBeenCalled();
  });

  it('인증된 요청에 수동 실행과 동일한 로직을 사용한다', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mock.exportToSheet.mockResolvedValue({ exported: 1 });
    const response = await GET(
      new Request('http://localhost:3000/api/cron/sheet-export', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.exportToSheet).toHaveBeenCalledWith('user-1');
  });
});
