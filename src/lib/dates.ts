import { seoulDate } from './today';
const week: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};
export function sheetDate(value: string, year: number): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const short = /^(\d{1,2})\/(\d{1,2})(?:\s*\(([일월화수목금토])\))?$/.exec(
    raw,
  );
  if (!iso && !short) return null;
  const y = iso ? Number(iso[1]) : year;
  const m = Number(iso ? iso[2] : short![1]);
  const d = Number(iso ? iso[3] : short![2]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  if (short?.[3] && date.getUTCDay() !== week[short[3]]) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function todaySeoul(now = new Date()) {
  return seoulDate(now);
}
