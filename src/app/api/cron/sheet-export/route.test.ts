import { afterEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  exportToSheet: vi.fn(),
  connections: [{ user_id: 'user-1' }] as { user_id: string }[] | null,
  dbError: null as Error | null,
}));

vi.mock('@/lib/sheet-export', () => ({ exportToSheet: mock.exportToSheet }));
vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        not: () => ({
          order: () => ({
            range: async () => ({
              data: mock.connections,
              error: mock.dbError,
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
  mock.connections = [{ user_id: 'user-1' }];
  mock.dbError = null;
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
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.exported).toBe(1);
    expect(mock.exportToSheet).toHaveBeenCalledWith('user-1');
  });

  it('동기화할 유저가 없으면 404를 반환한다', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mock.connections = [];
    const response = await GET(
      new Request('http://localhost:3000/api/cron/sheet-export', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('동기화 대상 유저가 없습니다');
  });

  it('Google 토큰 인증 만료 에러 발생 시 401을 반환한다', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mock.exportToSheet.mockRejectedValue(
      new Error('Google 인증이 만료되었습니다. 다시 연결해 주세요.'),
    );
    const response = await GET(
      new Request('http://localhost:3000/api/cron/sheet-export', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.failed).toBe(1);
  });

  it('DB 에러 발생 시 500과 함께 에러 메시지를 반환한다', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mock.dbError = new Error('DB connection failed');
    const response = await GET(
      new Request('http://localhost:3000/api/cron/sheet-export', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('데이터베이스');
  });
});
