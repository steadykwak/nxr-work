import { describe, expect, it } from 'vitest';
import { sheetDate } from './dates';
import { parseSheetRows } from './sheets';
describe('시트 가져오기', () => {
  it('연도 없는 날짜의 요일을 검증한다', () => {
    expect(sheetDate('09/29 (화)', 2026)).toBe('2026-09-29');
    expect(sheetDate('09/29 (월)', 2026)).toBeNull();
  });
  it('빈 ID와 중복 ID는 건너뛰고 경고한다', () => {
    const row = (id: string) => [id, '', '곽운도', '', '', '업무', '', '', '2026-09-23', '2026-09-24', '', 'FALSE', '시작 전'];
    const result = parseSheetRows([[], row('a'), row('a'), row('')], 'sheet', 1, 2026);
    expect(result.tasks).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });
});
