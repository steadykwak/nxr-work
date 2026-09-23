import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard, { type Task } from './dashboard';

const baseTask: Task = {
  id: 'base',
  source_title: '업무',
  source_owner: '곽운도',
  source_created_date: '2026-09-22',
  source_due_date: '2026-09-22',
  source_due_raw: null,
  source_completed: false,
  source_status: '진행 중',
  source_note: null,
  source_url: null,
  override_completed: null,
  override_status: null,
  source: 'sheet',
};

const event = (
  id: string,
  title: string,
  startsAt: string,
  endsAt: string,
) => ({
  id,
  title,
  startsAt,
  endsAt,
  allDay: false,
  url: null,
});

describe('오늘의 업무 화면', () => {
  it('기존 스타일 안에 시간순 미팅과 미완료 업무의 기한 설명을 표시한다', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        configured
        googleReady={false}
        email="user@example.com"
        today="2026-09-23"
        tasks={[
          { ...baseTask, id: 'late', source_title: '지난 기한 업무' },
          {
            ...baseTask,
            id: 'soon',
            source_title: '임박 업무',
            source_due_date: '2026-09-26',
          },
          {
            ...baseTask,
            id: 'done',
            source_title: '처리된 항목',
            override_completed: true,
          },
        ]}
        events={[
          event(
            'afternoon',
            '오후 미팅',
            '2026-09-23T06:00:00Z',
            '2026-09-23T07:00:00Z',
          ),
          event(
            'lunch',
            '점심시간',
            '2026-09-23T03:00:00Z',
            '2026-09-23T04:00:00Z',
          ),
          event(
            'morning',
            '오전 미팅',
            '2026-09-23T00:00:00Z',
            '2026-09-23T01:00:00Z',
          ),
        ]}
      />,
    );
    expect(html).toContain('class="shell"');
    expect(html).toContain('오늘 예정된 미팅');
    expect(html.indexOf('오전 미팅')).toBeLessThan(html.indexOf('오후 미팅'));
    expect(html).not.toContain('점심시간');
    expect(html).toContain('진행 중인 미완료 업무');
    expect(html).toContain('지난 기한 업무');
    expect(html).toContain('임박 업무');
    expect(html).not.toContain('처리된 항목');
    expect(html).toContain('aria-label="기한 지남"');
    expect(html).toContain('aria-label="3일 이내 기한"');
  });
});

describe('시트 동기화 화면', () => {
  const base = {
    configured: true,
    googleReady: true,
    email: 'user@example.com',
    connected: true,
    today: '2026-09-23',
    tasks: [] as Task[],
    events: [],
  };

  it('초기 가져오기 전에는 초기 동기화만 표시한다', () => {
    const html = renderToStaticMarkup(<Dashboard {...base} />);
    expect(html).toContain('초기 동기화');
    expect(html).not.toContain('지금 동기화');
  });

  it('초기 가져오기 뒤에는 쓰기 권한과 마지막 성공 상태를 표시한다', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        {...base}
        initialImportedAt="2026-09-22T00:00:00Z"
        lastExportAt="2026-09-23T00:00:00Z"
        writeAccess
      />,
    );
    expect(html).toContain('지금 동기화');
    expect(html).toContain('마지막 성공');
    expect(html).not.toContain('초기 동기화</button>');
  });

  it('쓰기 권한이 없으면 재인증 진입점을 표시한다', () => {
    const html = renderToStaticMarkup(
      <Dashboard {...base} initialImportedAt="2026-09-22T00:00:00Z" />,
    );
    expect(html).toContain('Google 쓰기 권한 연결');
    expect(html).not.toContain('지금 동기화');
  });
});
