import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('Apps Script 1시간 타이머', () => {
  it('중복 트리거를 만들지 않고 비밀 헤더로 서버 경로만 호출한다', () => {
    const fetch = vi.fn().mockReturnValue({ getResponseCode: () => 200 });
    const create = vi.fn();
    const everyHours = vi.fn().mockReturnValue({ create });
    const timeBased = vi.fn().mockReturnValue({ everyHours });
    const newTrigger = vi.fn().mockReturnValue({ timeBased });
    let installed = false;
    const context = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (key: string) =>
            key === 'NXR_WORK_URL' ? 'https://work.example/' : 'test-secret',
        }),
      },
      UrlFetchApp: { fetch },
      ScriptApp: {
        getProjectTriggers: () =>
          installed ? [{ getHandlerFunction: () => 'syncNxrWorkHourly' }] : [],
        newTrigger,
      },
    };
    const script = readFileSync('scripts/apps-script-hourly.gs', 'utf8');
    runInNewContext(script, context);
    const functions = context as typeof context & {
      syncNxrWorkHourly: () => void;
      installNxrWorkHourlyTrigger: () => void;
    };
    functions.installNxrWorkHourlyTrigger();
    installed = true;
    functions.installNxrWorkHourlyTrigger();
    expect(newTrigger).toHaveBeenCalledTimes(1);
    expect(everyHours).toHaveBeenCalledWith(1);
    functions.syncNxrWorkHourly();
    expect(fetch).toHaveBeenCalledWith(
      'https://work.example/api/cron/sheet-export',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );
  });
});
