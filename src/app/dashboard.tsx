'use client';
import { useEffect, useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Layers3,
  Link2,
  ListTodo,
  RefreshCw,
  Search,
  ArrowUpRight,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { CalendarEvent } from '@/lib/google';
import {
  dueUrgency,
  effectiveCompleted,
  eventSeoulDate,
  meetingViewEvents,
  ongoingIncompleteTasks,
  pastMeetingWeek,
  todayMeetings,
  weekRange,
  type MeetingView,
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
  initialImportedAt?: string;
  lastExportAt?: string;
  lastExportError?: string;
  writeAccess?: boolean;
  syncInProgress?: boolean;
  lastCalendarSync?: string;
  tasks: Task[];
  events: CalendarEvent[];
  today: string;
  dataError?: string;
  calendarError?: string;
};

type TaskFormData = {
  title: string;
  owner: string;
  createdDate: string;
  dueDate: string;
  status: string;
  note: string;
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

function statusClass(status: string) {
  switch (status) {
    case '진행 중':
      return 'in-progress';
    case '대기':
      return 'waiting';
    case '완료':
      return 'done';
    case '시작 전':
    default:
      return 'todo';
  }
}

export default function Dashboard({
  configured,
  googleReady,
  email,
  connected,
  initialImportedAt,
  lastExportAt,
  lastExportError,
  syncInProgress,
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
  const [meetingView, setMeetingView] = useState<MeetingView>('today');
  const [pastWeekStart, setPastWeekStart] = useState(weekRange(today).monday);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, startTransition] = useTransition();

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

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
  const pastEvents = meetingViewEvents(events, today, 'past');
  const firstPastWeek = pastEvents.length
    ? weekRange(eventSeoulDate(pastEvents[0])).monday
    : weekRange(today).monday;
  const lastPastWeek = pastEvents.length
    ? weekRange(eventSeoulDate(pastEvents[pastEvents.length - 1])).monday
    : weekRange(today).monday;
  const visibleMeetings =
    meetingView === 'past'
      ? pastMeetingWeek(events, today, pastWeekStart)
      : meetingViewEvents(events, today, meetingView);
  const ongoingTasks = ongoingIncompleteTasks(tasks, today);
  const timeline = [
    ...tasks.map((task) => ({
      date: task.source_due_date ?? '9999-12-31',
      kind: 'task' as const,
      task,
    })),
    ...meetingViewEvents(events, today, 'all').map((event) => ({
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
        const response = await fetch('/api/sync/export', {
          method: 'POST',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setNotice(`${result.exported}건을 Google Sheets에 반영했습니다.`);
        location.reload();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '동기화 실패');
      }
    });
  }

  async function updateStatus(task: Task, nextStatus: string) {
    const isCompleted = nextStatus === '완료';
    const prevTask = { ...task };

    setTasks((current) =>
      current.map((item) => {
        if (item.id !== task.id) return item;
        if (item.source === 'manual') {
          return {
            ...item,
            source_status: nextStatus,
            source_completed: isCompleted,
            override_status: nextStatus,
            override_completed: isCompleted,
          };
        }
        return {
          ...item,
          override_status: nextStatus,
          override_completed: isCompleted,
        };
      }),
    );

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          completed: isCompleted,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || '상태 변경 실패');
      }
    } catch (error) {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? prevTask : item)),
      );
      setNotice(
        error instanceof Error ? error.message : '상태 변경에 실패했습니다.',
      );
    }
  }

  async function toggle(task: Task) {
    const next = !completed(task);
    const nextStatus = next ? '완료' : '진행 중';
    const prevTask = { ...task };

    setTasks((current) =>
      current.map((item) => {
        if (item.id !== task.id) return item;
        if (item.source === 'manual') {
          return {
            ...item,
            source_completed: next,
            source_status: nextStatus,
            override_completed: next,
            override_status: nextStatus,
          };
        }
        return {
          ...item,
          override_completed: next,
          override_status: nextStatus,
        };
      }),
    );

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next, status: nextStatus }),
      });
      if (!response.ok) {
        setTasks((current) =>
          current.map((item) => (item.id === task.id ? prevTask : item)),
        );
        setNotice('완료 상태 저장에 실패했습니다.');
      }
    } catch {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? prevTask : item)),
      );
      setNotice('완료 상태 저장에 실패했습니다.');
    }
  }

  function openCreateModal() {
    setModalTask(null);
    setIsModalOpen(true);
  }

  function openEditModal(task: Task) {
    setModalTask(task);
    setIsModalOpen(true);
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`'${task.source_title}' 업무를 삭제하시겠습니까?`)) {
      return;
    }
    const prevTasks = [...tasks];
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || '삭제 실패');
      }
      setNotice('업무가 삭제되었습니다.');
    } catch (error) {
      setTasks(prevTasks);
      setNotice(
        error instanceof Error ? error.message : '업무 삭제에 실패했습니다.',
      );
    }
  }

  async function saveTask(formData: TaskFormData) {
    setModalBusy(true);
    try {
      if (modalTask) {
        // Edit (manual task)
        const response = await fetch(`/api/tasks/${modalTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '수정 실패');
        setTasks((current) =>
          current.map((item) =>
            item.id === modalTask.id ? { ...item, ...result.task } : item,
          ),
        );
        setNotice('업무가 수정되었습니다.');
      } else {
        // Create
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '생성 실패');
        setTasks((current) => [result.task, ...current]);
        setNotice('새 업무가 추가되었습니다.');
      }
      setIsModalOpen(false);
      setModalTask(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setModalBusy(false);
    }
  }

  const taskRow = (task: Task) => {
    const currentStatus =
      task.override_status ?? task.source_status ?? '시작 전';

    return (
      <div
        className={`task-row ${completed(task) ? 'done' : ''}`}
        key={task.id}
      >
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
            {task.source_owner || '담당자 없음'}
            {task.source === 'manual' && (
              <span className="source-tag manual">수동</span>
            )}
            {task.source_note && (
              <span className="note-preview" title={task.source_note}>
                · {task.source_note}
              </span>
            )}
          </span>
        </div>
        <div className="status-dropdown-wrap">
          <select
            className={`status-select ${statusClass(currentStatus)}`}
            value={currentStatus}
            onChange={(e) => updateStatus(task, e.target.value)}
            aria-label={`${task.source_title} 상태 변경`}
          >
            <option value="시작 전">시작 전</option>
            <option value="진행 중">진행 중</option>
            <option value="대기">대기</option>
            <option value="완료">완료</option>
          </select>
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
        {task.source === 'manual' && (
          <div className="task-actions">
            <button
              className="action-btn edit"
              onClick={() => openEditModal(task)}
              title="업무 수정"
              aria-label="업무 수정"
            >
              <Pencil size={14} />
            </button>
            <button
              className="action-btn delete"
              onClick={() => deleteTask(task)}
              title="업무 삭제"
              aria-label="업무 삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
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
  };
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
          {initialImportedAt && (
            <small className="sync-time">
              초기 가져오기{' '}
              {new Date(initialImportedAt).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}
            </small>
          )}
          {lastExportAt && (
            <small className="sync-time">
              시트로 마지막 동기화{' '}
              {new Date(lastExportAt).toLocaleString('ko-KR', {
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
              <span className="account">Google 연동 준비</span>
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
            <div className="heading-actions">
              {email && (
                <button
                  className="secondary add-task-btn"
                  onClick={openCreateModal}
                >
                  <Plus size={16} /> 새 업무 추가
                </button>
              )}
              {email && connected && (
                <button
                  className="primary"
                  onClick={sync}
                  disabled={busy || syncInProgress}
                >
                  <RefreshCw size={16} className={busy ? 'spinning' : ''} />{' '}
                  {busy || syncInProgress ? '동기화 중...' : '시트 동기화'}
                </button>
              )}
            </div>
          </div>
          {(initialImportedAt || lastExportAt) && (
            <p className="sync-status" role="status">
              {syncInProgress ? 'Google Sheets 동기화 진행 중 · ' : ''}
              {lastExportAt
                ? `마지막 성공 ${new Date(lastExportAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                : 'Google Sheets로 동기화한 기록이 없습니다.'}
            </p>
          )}
          {notice && (
            <div className="notice" role="status">
              <CircleAlert size={16} />
              {notice}
            </div>
          )}
          {lastExportError && (
            <div className="notice error" role="alert">
              <CircleAlert size={16} /> 마지막 시트 동기화 실패:{' '}
              {lastExportError}
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
                시트 읽기·쓰기와 캘린더 읽기 권한을 요청합니다. OAuth 화면에서
                계정을 직접 선택할 수 있습니다.
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
                      <button
                        onClick={() => {
                          setMeetingView('all');
                          setTab('events');
                        }}
                      >
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
                  <div className="toolbar">
                    <div
                      className="filters meeting-filters"
                      aria-label="미팅 일정 기간"
                    >
                      {(
                        [
                          ['today', '오늘'],
                          ['week', '이번 주'],
                          ['fiveDays', '+5일'],
                          ['past', '지난 회의'],
                          ['all', '전체'],
                        ] as const
                      ).map(([view, label]) => (
                        <button
                          key={view}
                          className={meetingView === view ? 'selected' : ''}
                          aria-pressed={meetingView === view}
                          onClick={() => {
                            setMeetingView(view);
                            if (view === 'past') setPastWeekStart(lastPastWeek);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {meetingView === 'past' && (
                    <div
                      className="week-pagination"
                      role="group"
                      aria-label="지난 회의 주별 이동"
                    >
                      <button
                        onClick={() =>
                          setPastWeekStart(weekRange(pastWeekStart, -1).monday)
                        }
                        disabled={
                          !pastEvents.length || pastWeekStart <= firstPastWeek
                        }
                      >
                        <ChevronLeft size={15} /> 이전 주
                      </button>
                      <span aria-live="polite">
                        {pastWeekStart} ~ {weekRange(pastWeekStart).sunday}
                      </span>
                      <button
                        onClick={() =>
                          setPastWeekStart(weekRange(pastWeekStart, 1).monday)
                        }
                        disabled={
                          !pastEvents.length || pastWeekStart >= lastPastWeek
                        }
                      >
                        다음 주 <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                  <div className="list">
                    {visibleMeetings.length ? (
                      visibleMeetings.map(eventRow)
                    ) : (
                      <p className="empty">
                        {events.length
                          ? '이 기간에 표시할 미팅 일정이 없습니다.'
                          : '표시할 미팅 일정이 없습니다. Google Calendar 연결을 확인해 주세요.'}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <TaskModal
        isOpen={isModalOpen}
        task={modalTask}
        onClose={() => {
          setIsModalOpen(false);
          setModalTask(null);
        }}
        onSubmit={saveTask}
        busy={modalBusy}
      />
    </div>
  );
}

function TaskModal({
  isOpen,
  task,
  onClose,
  onSubmit,
  busy,
}: {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('시작 전');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.source_title || '');
      setOwner(task.source_owner || '');
      setCreatedDate(task.source_created_date || '');
      setDueDate(task.source_due_date || '');
      setStatus(task.override_status ?? task.source_status ?? '시작 전');
      setNote(task.source_note || '');
    } else {
      setTitle('');
      setOwner('');
      setCreatedDate('');
      setDueDate('');
      setStatus('시작 전');
      setNote('');
    }
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSubmit({
      title: title.trim(),
      owner: owner.trim(),
      createdDate,
      dueDate,
      status,
      note: note.trim(),
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{task ? '업무 수정' : '새 업무 추가'}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="task-title">업무명 *</label>
            <input
              id="task-title"
              type="text"
              required
              placeholder="업무 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-owner">담당자</label>
              <input
                id="task-owner"
                type="text"
                placeholder="담당자 이름"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-status">상태</label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="시작 전">시작 전</option>
                <option value="진행 중">진행 중</option>
                <option value="대기">대기</option>
                <option value="완료">완료</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-created">시작일</label>
              <input
                id="task-created"
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-due">기한</label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="task-note">비고</label>
            <textarea
              id="task-note"
              rows={3}
              placeholder="참고할 메모나 비고 사항을 입력하세요"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={busy}
            >
              취소
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || !title.trim()}
            >
              {busy ? '저장 중...' : task ? '수정 완료' : '업무 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
