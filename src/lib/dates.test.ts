import { describe, expect, it } from 'vitest';
import { sheetDate } from './dates';
import { parseSheetRows } from './sheets';
describe('시트 가져오기', () => {
  it('연도 없는 날짜의 요일을 검증한다', () => {
    expect(sheetDate('09/29 (화)', 2026)).toBe('2026-09-29');
    expect(sheetDate('09/29 (월)', 2026)).toBeNull();
  });
  it('중복 ID 및 업무명 누락 행은 건너뛰고 경고한다', () => {
    const row = (id: string, title = '업무') => [
      '곽운도', // A(0): 담당자
      title, // B(1): 업무명
      '2026-09-23', // C(2): 시작일
      '2026-09-24', // D(3): 기한
      'FALSE', // E(4): 완료 여부
      '시작 전', // F(5): 상태
      id, // G(6): taskID / UUID
      '비고', // H(7): 비고
    ];
    const result = parseSheetRows(
      [row('a'), row('a'), row('b', '')],
      'sheet',
      1,
      2026,
    );
    expect(result.tasks).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      source_owner: '곽운도',
      source_title: '업무',
      source_created_date: '2026-09-23',
      source_due_date: '2026-09-24',
      source_completed: false,
      source_status: '시작 전',
      source_id: 'a',
      source_note: '비고',
    });
  });
});
