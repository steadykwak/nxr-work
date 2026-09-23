import { required } from './config';
import { sheetDate } from './dates';

export type SheetTask = {
  source: 'sheet';
  source_id: string;
  source_row: number;
  source_owner: string | null;
  source_title: string;
  source_created_raw: string | null;
  source_due_raw: string | null;
  source_created_date: string | null;
  source_due_date: string | null;
  source_completed: boolean;
  source_status: string | null;
  source_note: string | null;
  source_url: string;
  source_raw: string[];
};
export type ImportWarning = { row: number; message: string };
const cell = (row: unknown[], index: number) => String(row[index] ?? '').trim();
export function parseSheetRows(
  rows: unknown[][],
  spreadsheetId: string,
  sheetId: number,
  year: number,
) {
  const warnings: ImportWarning[] = [];
  const tasks: SheetTask[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i] ?? [];
    if (!row.some((v) => String(v ?? '').trim())) continue;
    if (cell(row, 0) === '담당자' && cell(row, 1) === '업무명') continue;

    const rawId = cell(row, 6);
    const id = rawId || `row-${rowNum}`;
    const title = cell(row, 1);

    if (seen.has(id)) {
      warnings.push({ row: rowNum, message: `중복 업무 ID(${id})라서 건너뜀` });
      continue;
    }
    seen.add(id);

    if (!title) {
      warnings.push({ row: rowNum, message: '업무명이 없어 건너뜀' });
      continue;
    }

    const createdRaw = cell(row, 2);
    const dueRaw = cell(row, 3);
    const created = sheetDate(createdRaw, year);
    const due = sheetDate(dueRaw, year);

    if (createdRaw && !created) {
      warnings.push({ row: rowNum, message: `생성일 해석 실패: ${createdRaw}` });
    }
    if (dueRaw && !due) {
      warnings.push({ row: rowNum, message: `기한 해석 실패: ${dueRaw}` });
    }

    const completedRaw = cell(row, 4).toUpperCase();
    if (completedRaw && !['TRUE', 'FALSE'].includes(completedRaw)) {
      warnings.push({
        row: rowNum,
        message: `완료값 해석 실패: ${completedRaw}`,
      });
    }

    tasks.push({
      source: 'sheet',
      source_id: id,
      source_row: rowNum,
      source_owner: cell(row, 0) || null,
      source_title: title,
      source_created_raw: createdRaw || null,
      source_due_raw: dueRaw || null,
      source_created_date: created,
      source_due_date: due,
      source_completed: completedRaw === 'TRUE' || row[4] === true,
      source_status: cell(row, 5) || null,
      source_note: cell(row, 7) || null,
      source_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}&range=A${rowNum}:H${rowNum}`,
      source_raw: Array.from({ length: 8 }, (_, j) => cell(row, j)),
    });
  }
  return { tasks, warnings };
}
export async function fetchSheet(accessToken: string) {
  const id = required('GOOGLE_SPREADSHEET_ID'),
    name = required('GOOGLE_SHEET_NAME');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metaResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`,
    { headers, cache: 'no-store' },
  );
  if (!metaResponse.ok)
    throw new Error(
      `Google Sheets 메타데이터 읽기 실패 (${metaResponse.status})`,
    );
  const meta = (await metaResponse.json()) as {
    sheets?: {
      properties: {
        sheetId: number;
        title: string;
        gridProperties?: { rowCount?: number };
      };
    }[];
  };
  const sheet = meta.sheets?.find(
    (s) => s.properties.title === name,
  )?.properties;
  if (!sheet) throw new Error(`워크시트 '${name}'을 찾지 못했습니다.`);
  const end = Math.max(2, sheet.gridProperties?.rowCount ?? 1000);
  const range = encodeURIComponent(
    `'${name.replaceAll("'", "''")}'!A2:H${end}`,
  );
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    { headers, cache: 'no-store' },
  );
  if (!response.ok)
    throw new Error(`Google Sheets 데이터 읽기 실패 (${response.status})`);
  const data = (await response.json()) as { values?: unknown[][] };
  return parseSheetRows(
    data.values ?? [],
    id,
    sheet.sheetId,
    Number(required('GOOGLE_SHEET_DATE_YEAR')),
  );
}

export type ExportTask = {
  id?: string;
  source_id: string | null;
  source_completed: boolean;
  source_status: string | null;
  override_completed: boolean | null;
  override_status: string | null;
};

export function buildSheetUpdates(
  tasks: ExportTask[],
  idRows: unknown[][],
  name: string,
) {
  const rows = new Map<string, number[]>();
  idRows.forEach((row, index) => {
    const rowNum = index + 2;
    const id = cell(row, 0);
    if (id) {
      rows.set(id, [...(rows.get(id) ?? []), rowNum]);
    }
    const fallbackId = `row-${rowNum}`;
    if (!rows.has(fallbackId)) {
      rows.set(fallbackId, [rowNum]);
    }
  });

  return tasks.map((task) => {
    const targetId = task.source_id || task.id;
    if (!targetId) {
      throw new Error('시트에서 고유 업무 ID를 확인할 수 없습니다: (없음)');
    }
    const matched =
      rows.get(targetId) ?? (task.id ? rows.get(task.id) : undefined);
    if (!matched || matched.length !== 1) {
      throw new Error(
        `시트에서 고유 업무 ID를 확인할 수 없습니다: ${task.source_id ?? task.id ?? '(없음)'}`,
      );
    }
    const row = matched[0];
    const tab = `'${name.replaceAll("'", "''")}'`;
    return {
      range: `${tab}!E${row}:G${row}`,
      values: [
        [
          task.override_completed ?? task.source_completed,
          task.override_status ?? task.source_status ?? '',
          task.id ?? '',
        ],
      ],
    };
  });
}

export async function writeSheetTasks(
  accessToken: string,
  tasks: ExportTask[],
) {
  if (!tasks.length) return 0;
  const id = required('GOOGLE_SPREADSHEET_ID');
  const name = required('GOOGLE_SHEET_NAME');
  const tab = `'${name.replaceAll("'", "''")}'`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const idResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${tab}!G2:G`)}?valueRenderOption=FORMATTED_VALUE`,
    { headers, cache: 'no-store' },
  );
  if (!idResponse.ok)
    throw new Error(`Google Sheets 업무 ID 확인 실패 (${idResponse.status})`);
  const ids = (await idResponse.json()) as { values?: unknown[][] };
  const data = buildSheetUpdates(tasks, ids.values ?? [], name);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
      cache: 'no-store',
    },
  );
  if (!response.ok)
    throw new Error(
      `Google Sheets 쓰기 실패 (${response.status}). 권한과 시트를 확인해 주세요.`,
    );
  return tasks.length;
}
