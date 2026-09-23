export const LUNCH_WINDOW_SEOUL = { start: '12:00', end: '13:00' } as const;

const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type CalendarItem = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  eventType?: string;
};

type TaskProgress = {
  source_created_date: string | null;
  source_due_date: string | null;
  source_completed: boolean;
  override_completed: boolean | null;
};

export function seoulDate(instant: Date) {
  return seoulDateFormatter.format(instant);
}

export function eventSeoulDate(event: CalendarItem) {
  return event.allDay
    ? event.startsAt.slice(0, 10)
    : seoulDate(new Date(event.startsAt));
}

export function isLunchEvent(event: CalendarItem) {
  const title = event.title.trim().replace(/\s+/g, ' ');
  if (event.eventType === 'lunch') return true;
  if (/미팅|회의|면담|meeting|sync|call/i.test(title)) return false;
  if (
    /^(?:점심(?:시간|식사|휴식)?|중식(?:시간|식사)?|런치(?:타임|브레이크)?)(?:$|\s|[(:])|^lunch(?:$|\s|[(:])/i.test(
      title,
    )
  )
    return true;
  if (event.allDay) return false;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    eventSeoulDate(event) === seoulDate(end) &&
    seoulTimeFormatter.format(start) === LUNCH_WINDOW_SEOUL.start &&
    seoulTimeFormatter.format(end) === LUNCH_WINDOW_SEOUL.end
  );
}

export type MeetingView = 'today' | 'week' | 'fiveDays' | 'past' | 'all';

function dateAfter(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekRange(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = dateAfter(today, -((weekday + 6) % 7));
  return { monday, sunday: dateAfter(monday, 6) };
}

export function meetingViewEvents<T extends CalendarItem>(
  events: T[],
  today: string,
  view: MeetingView,
): T[] {
  const { monday, sunday } = weekRange(today);
  const fifthDay = dateAfter(today, 4);
  return events
    .filter((event) => {
      if (isLunchEvent(event)) return false;
      const day = eventSeoulDate(event);
      switch (view) {
        case 'today':
          return day === today;
        case 'week':
          return day >= monday && day <= sunday;
        case 'fiveDays':
          return day >= today && day <= fifthDay;
        case 'past':
          return day < today;
        case 'all':
          return true;
      }
    })
    .sort((a, b) => {
      const dayOrder = eventSeoulDate(a).localeCompare(eventSeoulDate(b));
      if (dayOrder) return dayOrder;
      if (a.allDay || b.allDay)
        return a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
}

export function todayMeetings<T extends CalendarItem>(
  events: T[],
  today: string,
): T[] {
  return meetingViewEvents(events, today, 'today');
}

export function effectiveCompleted(task: TaskProgress) {
  return task.override_completed ?? task.source_completed;
}

export function ongoingIncompleteTasks<T extends TaskProgress>(
  tasks: T[],
  today: string,
): T[] {
  return tasks.filter(
    (task) =>
      Boolean(task.source_created_date && task.source_created_date < today) &&
      !effectiveCompleted(task),
  );
}

export type DueUrgency = 'overdue' | 'soon' | null;
export function dueUrgency(dueDate: string | null, today: string): DueUrgency {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return null;
  const days = (due - current) / 86_400_000;
  return days < 0 ? 'overdue' : days <= 3 ? 'soon' : null;
}
