import { describe, expect, it } from 'vitest';
import { todaySeoul } from './dates';
import {
  dueUrgency,
  effectiveCompleted,
  isLunchEvent,
  meetingViewEvents,
  ongoingIncompleteTasks,
  todayMeetings,
  weekRange,
  type MeetingView,
} from './today';

const event = (title: string, startsAt: string, endsAt: string) => ({
  title,
  startsAt,
  endsAt,
  allDay: false,
});

describe('서울 날짜 기준 오늘의 업무', () => {
  it('UTC 경계에서 서울 날짜를 사용한다', () => {
    expect(todaySeoul(new Date('2026-09-22T14:59:59Z'))).toBe('2026-09-22');
    expect(todaySeoul(new Date('2026-09-22T15:00:00Z'))).toBe('2026-09-23');
    const meetings = [
      event('밤 미팅', '2026-09-22T15:30:00Z', '2026-09-22T16:00:00Z'),
    ];
    expect(todayMeetings(meetings, '2026-09-23')).toHaveLength(1);
  });

  it('점심 제목이나 정확한 점심 구간만 제외하고 겹친 미팅은 유지한다', () => {
    expect(
      isLunchEvent(
        event('점심시간', '2026-09-23T02:30:00Z', '2026-09-23T03:30:00Z'),
      ),
    ).toBe(true);
    expect(
      isLunchEvent(
        event('점심 약속', '2026-09-23T02:30:00Z', '2026-09-23T03:30:00Z'),
      ),
    ).toBe(true);
    expect(
      isLunchEvent(
        event(
          'Lunch with team',
          '2026-09-23T02:30:00Z',
          '2026-09-23T03:30:00Z',
        ),
      ),
    ).toBe(true);
    expect(
      isLunchEvent(
        event('개인 일정', '2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
      ),
    ).toBe(true);
    expect(
      isLunchEvent(
        event('고객 미팅', '2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isLunchEvent(
        event('점심 미팅', '2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isLunchEvent(
        event('오전 회의', '2026-09-23T02:30:00Z', '2026-09-23T03:30:00Z'),
      ),
    ).toBe(false);
    expect(
      isLunchEvent(
        event('오후 회의', '2026-09-23T03:30:00Z', '2026-09-23T04:30:00Z'),
      ),
    ).toBe(false);
  });

  it('오늘 미팅을 시작 시간순으로 정렬하고 점심을 제거한다', () => {
    const events = [
      event('오후', '2026-09-23T06:00:00Z', '2026-09-23T07:00:00Z'),
      event('점심시간', '2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
      event('오전', '2026-09-23T00:00:00Z', '2026-09-23T01:00:00Z'),
    ];
    expect(
      todayMeetings(events, '2026-09-23').map((item) => item.title),
    ).toEqual(['오전', '오후']);
  });

  it('원본과 오버라이드의 유효 완료 상태로 시작일이 지난 업무를 고른다', () => {
    const base = {
      source_created_date: '2026-09-22',
      source_due_date: '2026-09-20',
      source_completed: false,
      override_completed: null,
    };
    const tasks = [
      { ...base, id: 'open' },
      { ...base, id: 'source-done', source_completed: true },
      { ...base, id: 'override-done', override_completed: true },
      {
        ...base,
        id: 'override-open',
        source_completed: true,
        override_completed: false,
      },
      { ...base, id: 'starts-today', source_created_date: '2026-09-23' },
      { ...base, id: 'no-start', source_created_date: null },
    ];
    expect(
      ongoingIncompleteTasks(tasks, '2026-09-23').map((task) => task.id),
    ).toEqual(['open', 'override-open']);
    expect(effectiveCompleted(tasks[3])).toBe(false);
  });

  it('기한이 지난 날은 빨강, 오늘부터 3일 이내는 주황으로 분류한다', () => {
    expect(dueUrgency('2026-09-22', '2026-09-23')).toBe('overdue');
    expect(dueUrgency('2026-09-23', '2026-09-23')).toBe('soon');
    expect(dueUrgency('2026-09-26', '2026-09-23')).toBe('soon');
    expect(dueUrgency('2026-09-27', '2026-09-23')).toBeNull();
    expect(dueUrgency(null, '2026-09-23')).toBeNull();
  });
});

describe('미팅 일정 기간별 보기', () => {
  const today = '2026-09-23';
  const events = [
    event('다음 월요일', '2026-09-27T15:00:00Z', '2026-09-27T16:00:00Z'),
    event('일요일 늦게', '2026-09-27T14:30:00Z', '2026-09-27T14:45:00Z'),
    event('오늘 오후', '2026-09-23T06:00:00Z', '2026-09-23T07:00:00Z'),
    event('점심시간', '2026-09-23T03:00:00Z', '2026-09-23T04:00:00Z'),
    event('지난 점심', '2026-09-21T03:00:00Z', '2026-09-21T04:00:00Z'),
    event('지난 월요일', '2026-09-21T00:00:00Z', '2026-09-21T01:00:00Z'),
    event('이전 일요일', '2026-09-20T00:00:00Z', '2026-09-20T01:00:00Z'),
    event('오늘 오전', '2026-09-22T15:00:00Z', '2026-09-22T16:00:00Z'),
  ];

  it('월요일부터 일요일까지의 주를 서울 날짜로 계산한다', () => {
    expect(weekRange(today)).toEqual({
      monday: '2026-09-21',
      sunday: '2026-09-27',
    });
    expect(weekRange('2026-09-27')).toEqual({
      monday: '2026-09-21',
      sunday: '2026-09-27',
    });
    expect(
      meetingViewEvents(events, today, 'week').map((item) => item.title),
    ).toEqual(['지난 월요일', '오늘 오전', '오늘 오후', '일요일 늦게']);
  });

  it('오늘 포함 5일과 지난 회의를 구분하고 날짜·시작 시간순으로 정렬한다', () => {
    expect(
      meetingViewEvents(events, today, 'today').map((item) => item.title),
    ).toEqual(['오늘 오전', '오늘 오후']);
    expect(
      meetingViewEvents(events, today, 'fiveDays').map((item) => item.title),
    ).toEqual(['오늘 오전', '오늘 오후', '일요일 늦게']);
    expect(
      meetingViewEvents(events, today, 'past').map((item) => item.title),
    ).toEqual(['이전 일요일', '지난 월요일']);
    const crossMonth = [
      event('5일째', '2026-10-03T00:00:00+09:00', '2026-10-03T01:00:00+09:00'),
      event('6일째', '2026-10-04T00:00:00+09:00', '2026-10-04T01:00:00+09:00'),
    ];
    expect(
      meetingViewEvents(crossMonth, '2026-09-29', 'fiveDays').map(
        (item) => item.title,
      ),
    ).toEqual(['5일째']);
  });

  it('모든 보기에 점심 제외 규칙을 동일하게 적용한다', () => {
    const views: MeetingView[] = ['today', 'week', 'fiveDays', 'past', 'all'];
    for (const view of views) {
      expect(
        meetingViewEvents(events, today, view).every(
          (item) => !item.title.includes('점심'),
        ),
      ).toBe(true);
    }
    expect(meetingViewEvents(events, today, 'all')).toHaveLength(6);
  });
});
