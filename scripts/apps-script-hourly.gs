/** Hourly timer only. NXR Work performs authentication and sheet writes on its server. */
function syncNxrWorkHourly() {
  const properties = PropertiesService.getScriptProperties();
  const appUrl = properties.getProperty('NXR_WORK_URL');
  const secret = properties.getProperty('CRON_SECRET');
  if (!appUrl || !secret || !/^https:\/\//.test(appUrl)) {
    throw new Error('HTTPS NXR_WORK_URL and CRON_SECRET script properties are required.');
  }
  const response = UrlFetchApp.fetch(
    appUrl.replace(/\/$/, '') + '/api/cron/sheet-export',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + secret },
      muteHttpExceptions: true,
      followRedirects: false,
    },
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('NXR Work sync failed (HTTP ' + response.getResponseCode() + ').');
  }
}

/** Run once in the Apps Script editor. Avoid creating duplicate hourly triggers. */
function installNxrWorkHourlyTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === 'syncNxrWorkHourly',
  );
  if (!exists) {
    ScriptApp.newTrigger('syncNxrWorkHourly').timeBased().everyHours(1).create();
  }
}
