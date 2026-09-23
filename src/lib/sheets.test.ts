import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSheetUpdates, writeSheetTasks, type ExportTask } from './sheets';

vi.mock('./config', () => ({
  required: (name: string) =>
    ({
      GOOGLE_SPREADSHEET_ID: 'test-sheet',
      GOOGLE_SHEET_NAME: '곽운도',
    })[name as 'GOOGLE_SPREADSHEET_ID' | 'GOOGLE_SHEET_NAME'],
}));
afterEach(() => vi.unstubAllGlobals());

const task: ExportTask = {
  source_id: 'task-1',
  source_completed: false,
  source_status: '대기',
  override_completed: true,
  override_status: '완료',
};

describe('NXR Work → Google Sheets 쓰기', () => {
  it('현재 ID 위치를 찾아 L 체크박스와 M 상태만 RAW로 쓴다', async () => {
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
    const [, options] = fetchMock.mock.calls[1];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      valueInputOption: 'RAW',
      data: [
        { range: "'곽운도'!L4", values: [[true]] },
        { range: "'곽운도'!M4", values: [['완료']] },
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
        [{ ...task, override_completed: null, override_status: null }],
        [['task-1']],
        '곽운도',
      ),
    ).toEqual([
      { range: "'곽운도'!L2", values: [[false]] },
      { range: "'곽운도'!M2", values: [['대기']] },
    ]);
  });
});
