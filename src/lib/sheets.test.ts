import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSheetUpdates,
  parseSheetRows,
  writeSheetTasks,
  type ExportTask,
} from './sheets';

vi.mock('./config', () => ({
  required: (name: string) =>
    ({
      GOOGLE_SPREADSHEET_ID: 'test-sheet',
      GOOGLE_SHEET_NAME: '곽운도',
    })[name as 'GOOGLE_SPREADSHEET_ID' | 'GOOGLE_SHEET_NAME'],
}));
afterEach(() => vi.unstubAllGlobals());

const task: ExportTask = {
  id: 'task-uuid-1',
  source_id: 'task-1',
  source_completed: false,
  source_status: '대기',
  override_completed: true,
  override_status: '완료',
};

describe('NXR Work → Google Sheets 쓰기', () => {
  it('현재 ID 위치를 찾아 E(완료), F(상태), G(고유 Task ID)를 RAW로 쓴다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [['other'], [], ['task-1']] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await writeSheetTasks('token', [task])).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [idUrl] = fetchMock.mock.calls[0];
    expect(idUrl).toContain('G2%3AG');
    const [, options] = fetchMock.mock.calls[1];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      valueInputOption: 'RAW',
      data: [
        { range: "'곽운도'!E4:G4", values: [[true, '완료', 'task-uuid-1']] },
      ],
    });
  });

  it('중복·누락 ID는 쓰기 전에 중단하며 재시도해도 같은 값을 만든다', () => {
    expect(() =>
      buildSheetUpdates([task], [['task-1'], ['task-1']], '곽운도'),
    ).toThrow('고유 업무 ID');
    expect(() => buildSheetUpdates([task], [['other']], '곽운도')).toThrow(
      '고유 업무 ID',
    );
    expect(buildSheetUpdates([task], [['task-1']], '곽운도')).toEqual(
      buildSheetUpdates([task], [['task-1']], '곽운도'),
    );
    expect(
      buildSheetUpdates(
        [{ ...task, id: undefined, override_completed: null, override_status: null }],
        [['task-1']],
        '곽운도',
      ),
    ).toEqual([
      { range: "'곽운도'!E2:G2", values: [[false, '대기', '']] },
    ]);
  });

  it('일부 태스크가 시트와 일치하지 않더라도 일치하는 태스크는 안전하게 업데이트한다', () => {
    const task2: ExportTask = {
      id: 'task-uuid-2',
      source_id: 'deleted-task',
      source_completed: false,
      source_status: '시작 전',
      override_completed: null,
      override_status: null,
    };
    const updates = buildSheetUpdates([task, task2], [['task-1']], '곽운도');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      range: "'곽운도'!E2:G2",
      values: [[true, '완료', 'task-uuid-1']],
    });
  });
});

describe('Google Sheets → NXR Work 8컬럼(A~H) 읽기 파싱', () => {
  it('A~H 8개 컬럼을 SheetTask 객체로 올바르게 파싱한다', () => {
    const rows = [
      ['담당자', '업무명', '시작일', '기한', '완료', '상태', 'taskID', '비고'], // 헤더 행 (스킵 대상)
      [
        '홍길동',
        '기능 개발',
        '2026-09-23',
        '2026-09-25',
        'TRUE',
        '진행 중',
        'uuid-1234',
        '참고 메모',
      ],
      [
        '김철수',
        '문서 작성',
        '2026-09-24',
        '2026-09-26',
        'FALSE',
        '대기',
        '', // taskID 없음 -> row-3 fallback
        '',
      ],
    ];

    const result = parseSheetRows(rows, 'test-sheet', 100, 2026);
    expect(result.warnings).toHaveLength(0);
    expect(result.tasks).toHaveLength(2);

    expect(result.tasks[0]).toEqual({
      source: 'sheet',
      source_id: 'uuid-1234',
      source_row: 3, // rows[1]은 3행
      source_owner: '홍길동',
      source_title: '기능 개발',
      source_created_raw: '2026-09-23',
      source_due_raw: '2026-09-25',
      source_created_date: '2026-09-23',
      source_due_date: '2026-09-25',
      source_completed: true,
      source_status: '진행 중',
      source_note: '참고 메모',
      source_url:
        'https://docs.google.com/spreadsheets/d/test-sheet/edit#gid=100&range=A3:H3',
      source_raw: [
        '홍길동',
        '기능 개발',
        '2026-09-23',
        '2026-09-25',
        'TRUE',
        '진행 중',
        'uuid-1234',
        '참고 메모',
      ],
    });

    expect(result.tasks[1]).toMatchObject({
      source: 'sheet',
      source_id: 'row-4', // rows[2]는 4행
      source_row: 4,
      source_owner: '김철수',
      source_title: '문서 작성',
      source_completed: false,
      source_status: '대기',
      source_note: null,
    });
  });
});
