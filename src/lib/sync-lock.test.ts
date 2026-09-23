import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  acquired: false,
  filter: '',
  initial: false,
}));
vi.mock('./supabase', () => ({
  adminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          or: (filter: string) => {
            mock.filter = filter;
            return {
              is: () => ({
                select: async () => ({
                  data: mock.acquired ? [{ user_id: 'user-1' }] : [],
                }),
              }),
              not: () => ({
                select: async () => ({
                  data: mock.acquired ? [{ user_id: 'user-1' }] : [],
                }),
              }),
            };
          },
        }),
      }),
    }),
  }),
}));
import { claimSync, SyncBusyError } from './sync-lock';

beforeEach(() => {
  mock.acquired = false;
  mock.filter = '';
});

describe('사용자별 DB 동기화 잠금', () => {
  it('이미 진행 중인 동기화는 중복 획득하지 못한다', async () => {
    await expect(claimSync('user-1', false)).rejects.toBeInstanceOf(
      SyncBusyError,
    );
    expect(mock.filter).toContain('sync_lock_at.is.null');
  });
  it('조건부 DB 갱신이 한 행을 획득했을 때만 진행한다', async () => {
    mock.acquired = true;
    await expect(claimSync('user-1', true)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});
