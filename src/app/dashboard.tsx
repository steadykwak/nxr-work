'use client';
import { useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  Layers3,
  Link2,
  ListTodo,
  RefreshCw,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import type { CalendarEvent } from '@/lib/google';
import {
  dueUrgency,
  effectiveCompleted,
  eventSeoulDate,
  ongoingIncompleteTasks,
  todayMeetings,
} from '@/lib/today';
export type Task = {
  id: string;
  source_title: string;
  source_owner: string | null;
  source_created_date: string | null;
  source_due_date: string | null;
  source_due_raw: string | null;
  source_completed: boolean;
  source_status: string | null;
  source_note: string | null;
  source_url: string | null;
  override_completed: boolean | null;
  override_status: string | null;
  source: string;
};
type Props = {
  configured: boolean;
  googleReady: boolean;
  email?: string;
  connected?: boolean;
  lastSync?: string;
  lastCalendarSync?: string;
  tasks: Task[];
  events: CalendarEvent[];
  today: string;
  dataError?: string;
  calendarError?: string;
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+09:00`));
const eventTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
function DueLegend() {
  return (
    <div className="due-legend">
      <span>
        <i className="due-dot overdue" aria-hidden="true" /> 기한 지남
      </span>
      <span>
        <i className="due-dot soon" aria-hidden="true" /> 3일 이내 기한
      </span>
    </div>
  );
}
export default function Dashboard({
  configured,
  googleReady,
  email,
  connected,
  lastSync,
  lastCalendarSync,
  tasks: initialTasks,
  events,
  today,
  dataError,
  calendarError,
}: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [tab, setTab] = useState<'today' | 'tasks' | 'events' | 'timeline'>(
    'today',
  );
  const [filter, setFilter] = useState<'all' | 'overdue' | 'upcoming'>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, startTransition] = useTransition();
  const completed = effectiveCompleted;
  const visible = tasks.filter(
    (task) =>
      task.source_title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'overdue'
          ? Boolean(
              task.source_due_date &&
              task.source_due_date < today &&
              !completed(task),
            )
          : Boolean(task.source_due_date && task.source_due_date > today))),
  );
  const todayTasks = tasks.filter(
    (task) => task.source_due_date === today && !completed(task),
  );
  const todayEvents = todayMeetings(events, today);
  const ongoingTasks = ongoingIncompleteTasks(tasks, today);
  const timeline = [
    ...tasks.map((task) => ({
      date: task.source_due_date ?? '9999-12-31',
      kind: 'task' as const,
      task,
    })),
    ...events.map((event) => ({
      date: eventSeoulDate(event),
      kind: 'event' as const,
      event,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    await supabase.auth.signOut();
    location.assign('/login');
  }
  async function sync() {
    setNotice('');
    startTransition(async () => {
      try {
        const response = await fetch('/api/sync', { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setNotice(
          `${result.imported}건을 가져왔습니다.${
            result.warnings.length
              ? ` 경고 ${result.warnings.length}건: ${result.warnings
                  .slice(0, 4)
                  .map(
                    (w: { row: number; message: string }) =>
                      `${w.row}행 ${w.message}`,
                  )
                  .join(', ')}`
              : ''
          }`,
        );
        location.reload();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '동기화 실패');
      }
    });
  }
  async function toggle(task: Task) {
    const next = !completed(task);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, override_completed: next } : item,
      ),
    );
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: next }),
    });
    if (!response.ok) {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? task : item)),
      );
      setNotice('완료 상태 저장에 실패했습니다.');
    }
  }
  const taskRow = (task: Task) => (
    <div className={`task-row ${completed(task) ? 'done' : ''}`} key={task.id}>
      <button
        className="check"
        aria-label={`${task.source_title} 완료 변경`}
        aria-pressed={completed(task)}
        onClick={() => toggle(task)}
      >
        {completed(task) && <Check size={15} />}
      </button>
      <div className="task-main">
        <strong>{task.source_title}</strong>
        <span>
          {task.source_owner || '담당자 없음'} <i />{' '}
          {task.override_status ?? task.source_status ?? '상태 없음'}
        </span>
      </div>
      <span className="due">
        {!completed(task) &&
          dueUrgency(task.source_due_date, today) === 'overdue' && (
            <span
              className="due-dot overdue"
              role="img"
              aria-label="기한 지남"
              title="기한 지남"
            />
          )}
        {!completed(task) &&
          dueUrgency(task.source_due_date, today) === 'soon' && (
            <span
              className="due-dot soon"
              role="img"
              aria-label="3일 이내 기한"
              title="3일 이내 기한"
            />
          )}
        {task.source_due_date
          ? formatDate(task.source_due_date)
          : task.source_due_raw || '기한 없음'}
      </span>
      {task.source_url && (
        <a
          className="row-link"
          href={task.source_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="원본 시트 열기"
        >
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
  const eventRow = (event: CalendarEvent) => (
    <div className="event-row" key={event.id}>
      <div className="event-icon">
        <CalendarDays size={18} />
      </div>
      <div className="task-main">
        <strong>{event.title}</strong>
        <span>{formatDate(eventSeoulDate(event))}</span>
      </div>
      <span className="due">
        {event.allDay
          ? '종일'
          : `${eventTime(event.startsAt)} – ${eventTime(event.endsAt)}`}
      </span>
      {event.url && (
        <a
          className="row-link"
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="캘린더 일정 열기"
        >
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={20} />
          </div>
          <div>
            <b>NXR Work</b>
            <small>나의 업무 공간</small>
          </div>
        </div>
        <nav>
          <button
            className={tab === 'today' ? 'active' : ''}
            onClick={() => setTab('today')}
          >
            <Clock3 size={18} /> 오늘
          </button>
          <button
            className={tab === 'tasks' ? 'active' : ''}
            onClick={() => setTab('tasks')}
          >
            <ListTodo size={18} /> 업무 목록 <em>{tasks.length}</em>
          </button>
          <button
            className={tab === 'events' ? 'active' : ''}
            onClick={() => setTab('events')}
          >
            <CalendarDays size={18} /> 미팅 일정
          </button>
          <button
            className={tab === 'timeline' ? 'active' : ''}
            onClick={() => setTab('timeline')}
          >
            <Layers3 size={18} /> 날짜별 보기
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-label">연동 상태</div>
          <div className="connect-line">
            <span className={connected ? 'dot green' : 'dot'} /> Google Sheets{' '}
            <b>{connected ? '연결됨' : '미연결'}</b>
          </div>
          <div className="connect-line">
            <span className={connected ? 'dot green' : 'dot'} /> Google Calendar{' '}
            <b>{connected ? '연결됨' : '미연결'}</b>
          </div>
          <div className="connect-line">
            <span className={configured ? 'dot green' : 'dot'} /> Supabase{' '}
            <b>{configured ? '설정됨' : '설정 필요'}</b>
          </div>
          {lastSync && (
            <small className="sync-time">
              시트 동기화{' '}
              {new Date(lastSync).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}
            </small>
          )}
          {lastCalendarSync && (
            <small className="sync-time">
              캘린더 확인{' '}
              {new Date(lastCalendarSync).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}
            </small>
          )}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>개인 업무 공간</span>
          <div>
            {email ? (
              <>
                <span className="account">{email}</span>
                <button className="text-button" onClick={signOut}>
                  로그아웃
                </button>
              </>
            ) : (
              <span className="account">읽기 전용 연동 준비</span>
            )}
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">
                WORKSPACE /{' '}
                {tab === 'today'
                  ? 'TODAY'
                  : tab === 'tasks'
                    ? 'TASKS'
                    : tab === 'events'
                      ? 'CALENDAR'
                      : 'TIMELINE'}
              </p>
              <h1>
                {tab === 'today'
                  ? '오늘의 업무'
                  : tab === 'tasks'
                    ? '업무 목록'
                    : tab === 'events'
                      ? '미팅 일정'
                      : '날짜별 보기'}
              </h1>
              <p className="subtitle">
                {formatDate(today)} · 업무와 미팅을 한눈에 확인하세요.
              </p>
            </div>
            {email && connected && (
              <button className="primary" onClick={sync} disabled={busy}>
                <RefreshCw size={16} className={busy ? 'spinning' : ''} />{' '}
                {busy ? '가져오는 중' : '시트 동기화'}
              </button>
            )}
          </div>
          {notice && (
            <div className="notice" role="status">
              <CircleAlert size={16} />
              {notice}
            </div>
          )}
          {!configured && (
            <div className="setup">
              <Link2 size={22} />
              <h2>Supabase 연결이 필요합니다</h2>
              <p>
                README의 설정 단계를 따라 환경 변수와 데이터베이스 테이블을
                준비해 주세요. 아직 실제 데이터는 표시하지 않습니다.
              </p>
            </div>
          )}
          {email && !googleReady && (
            <div className="notice">
              <CircleAlert size={16} /> Google OAuth와 시트 설정이 필요합니다.
              README를 확인해 주세요.
            </div>
          )}
          {email && googleReady && !connected && (
            <div className="setup compact">
              <Link2 size={22} />
              <h2>Google 계정을 연결해 주세요</h2>
              <p>
                시트와 캘린더 읽기 권한만 요청합니다. OAuth 화면에서 계정을 직접
                선택할 수 있습니다.
              </p>
              <a className="primary" href="/api/google/connect">
                Google 연결 <ArrowUpRight size={16} />
              </a>
            </div>
          )}
          {email && (dataError || calendarError) && (
            <div className="notice error">
              <CircleAlert size={16} />
              {[dataError, calendarError].filter(Boolean).join(' · ')}
            </div>
          )}
          {email && (
            <>
              {tab === 'today' && (
                <>
                  <div className="summary">
                    <div>
                      <span>오늘 마감 업무</span>
                      <strong>
                        {todayTasks.length}
                        <small>건</small>
                      </strong>
                    </div>
                    <div>
                      <span>오늘의 미팅</span>
                      <strong>
                        {todayEvents.length}
                        <small>건</small>
                      </strong>
                    </div>
                    <div>
                      <span>지난 업무</span>
                      <strong>
                        {
                          tasks.filter(
                            (task) =>
                              task.source_due_date &&
                              task.source_due_date < today &&
                              !completed(task),
                          ).length
                        }
                        <small>건</small>
                      </strong>
                    </div>
                  </div>
                  <section>
                    <div className="section-title">
                      <div>
                        <span className="accent-icon blue">
                          <CalendarDays size={18} />
                        </span>
                        <h2>오늘 예정된 미팅</h2>
                      </div>
                      <button onClick={() => setTab('events')}>
                        전체 보기 <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="list">
                      {todayEvents.length ? (
                        todayEvents.map(eventRow)
                      ) : (
                        <p className="empty">오늘 예정된 미팅이 없습니다.</p>
                      )}
                    </div>
                  </section>
                  <section>
                    <div className="section-title">
                      <div>
                        <span className="accent-icon coral">
                          <ListTodo size={18} />
                        </span>
                        <h2>진행 중인 미완료 업무</h2>
                      </div>
                      <button onClick={() => setTab('tasks')}>
                        전체 보기 <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <DueLegend />
                    <div className="list">
                      {ongoingTasks.length ? (
                        ongoingTasks.map(taskRow)
                      ) : (
                        <p className="empty">
                          시작일이 오늘 이전인 미완료 업무가 없습니다.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}
              {tab === 'tasks' && (
                <section>
                  <div className="toolbar">
                    <div className="filters">
                      <button
                        className={filter === 'all' ? 'selected' : ''}
                        onClick={() => setFilter('all')}
                      >
                        전체
                      </button>
                      <button
                        className={filter === 'overdue' ? 'selected' : ''}
                        onClick={() => setFilter('overdue')}
                      >
                        지난 업무
                      </button>
                      <button
                        className={filter === 'upcoming' ? 'selected' : ''}
                        onClick={() => setFilter('upcoming')}
                      >
                        다가오는 업무
                      </button>
                    </div>
                    <label className="search">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="업무 검색"
                      />
                    </label>
                  </div>
                  <DueLegend />
                  <div className="list">
                    {visible.length ? (
                      visible.map(taskRow)
                    ) : (
                      <p className="empty">
                        표시할 업무가 없습니다. Google 연결 후 시트를 동기화해
                        주세요.
                      </p>
                    )}
                  </div>
                </section>
              )}
              {tab === 'timeline' && (
                <section>
                  <div className="section-title">
                    <div>
                      <span className="accent-icon blue">
                        <Layers3 size={18} />
                      </span>
                      <h2>업무와 미팅</h2>
                    </div>
                    <span className="section-note">날짜순</span>
                  </div>
                  <DueLegend />
                  <div className="list">
                    {timeline.length ? (
                      timeline.map((item) =>
                        item.kind === 'task'
                          ? taskRow(item.task)
                          : eventRow(item.event),
                      )
                    ) : (
                      <p className="empty">표시할 업무나 일정이 없습니다.</p>
                    )}
                  </div>
                </section>
              )}
              {tab === 'events' && (
                <section>
                  <div className="list">
                    {events.length ? (
                      events.map(eventRow)
                    ) : (
                      <p className="empty">
                        표시할 일정이 없습니다. Google Calendar 연결을 확인해
                        주세요.
                      </p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
