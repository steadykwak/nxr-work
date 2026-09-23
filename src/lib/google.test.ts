import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calendarEvents,
  GOOGLE_SHEETS_WRITE_SCOPE,
  hasGoogleScope,
} from './google';

vi.mock('./supabase', () => ({ adminClient: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('읽기 전용 Google Calendar 목록', () => {
  it('점심 일정만 제외하고 점심과 겹치는 일반 미팅은 남긴다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'lunch',
            summary: '점심시간',
            start: { dateTime: '2026-09-23T12:00:00+09:00' },
            end: { dateTime: '2026-09-23T13:00:00+09:00' },
          },
          {
            id: 'meeting',
            summary: '고객 미팅',
            start: { dateTime: '2026-09-23T11:30:00+09:00' },
            end: { dateTime: '2026-09-23T12:30:00+09:00' },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const events = await calendarEvents('test-token');
    expect(events.map((event) => event.id)).toEqual(['meeting']);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });
});

describe('Google Sheets 쓰기 권한', () => {
  it('읽기 전용 토큰은 쓰기 동기화에 사용할 수 없다', () => {
    expect(
      hasGoogleScope(
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        GOOGLE_SHEETS_WRITE_SCOPE,
      ),
    ).toBe(false);
    expect(
      hasGoogleScope(
        `https://www.googleapis.com/auth/calendar.events.readonly ${GOOGLE_SHEETS_WRITE_SCOPE}`,
        GOOGLE_SHEETS_WRITE_SCOPE,
      ),
    ).toBe(true);
  });
});
