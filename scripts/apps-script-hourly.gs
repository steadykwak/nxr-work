/** Hourly timer only. NXR Work performs authentication and sheet writes on its server. */
function syncNxrWorkHourly() {
  const properties = PropertiesService.getScriptProperties();
  const appUrl = properties.getProperty('NXR_WORK_URL');
  const secret = properties.getProperty('CRON_SECRET');
  if (!appUrl || !secret || !/^https:\/\//.test(appUrl)) {
    throw new Error('HTTPS NXR_WORK_URL and CRON_SECRET script properties are required.');
  }

  const endpoint = appUrl.replace(/\/$/, '') + '/api/cron/sheet-export';
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
    followRedirects: false,
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText ? response.getContentText() : '';

  if (statusCode !== 200) {
    console.error('NXR Work sync failed (HTTP ' + statusCode + '): ' + responseText);
    throw new Error('NXR Work sync failed (HTTP ' + statusCode + '): ' + responseText);
  }

  console.log('NXR Work sync succeeded (HTTP 200): ' + responseText);
}

/** Run once in the Apps Script editor. Avoid creating duplicate hourly triggers. */
function installNxrWorkHourlyTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(
    (trigger) => trigger.getHandlerFunction() === 'syncNxrWorkHourly',
  );
  if (!exists) {
    ScriptApp.newTrigger('syncNxrWorkHourly').timeBased().everyHours(1).create();
    console.log('Installed 1-hour trigger for syncNxrWorkHourly.');
  } else {
    console.log('Trigger for syncNxrWorkHourly already exists.');
  }
}
