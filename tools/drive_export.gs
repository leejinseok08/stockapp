/**
 * StockApp daily collector + Google Drive export.
 *
 * Paste into https://script.google.com (new project), set the project time zone to Asia/Seoul
 * (Project Settings), then run `setup` once and approve the permissions.
 * It calls the server twice a day (after the Korean close and after the US close), which both
 * stores that day's numbers in the database and saves the full history CSV to the Drive folder.
 */

const API = "https://stockapp-ghmx.onrender.com";
const FOLDER_ID = "1esIN2h1joPicY-k-rne6Jthjfp-dPMMf"; // "StockApp Data"
const FILE_NAME = "market_snapshots.csv";

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("collectAndExport").timeBased().everyDays(1).atHour(16).nearMinute(30).create(); // after KRX close
  ScriptApp.newTrigger("collectAndExport").timeBased().everyDays(1).atHour(7).nearMinute(0).create(); // after US close
  collectAndExport();
}

function collectAndExport() {
  // The free server sleeps when idle; the first request can take ~30-60s to wake it.
  const collected = fetchWithRetry(`${API}/market/collect`, { method: "post" });
  const csv = fetchWithRetry(`${API}/market/export.csv`, { method: "get" }).getContentText();

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const existing = folder.getFilesByName(FILE_NAME);
  if (existing.hasNext()) {
    existing.next().setContent(csv);
  } else {
    folder.createFile(FILE_NAME, csv, MimeType.CSV);
  }
  console.log(`collect: ${collected.getContentText()} / csv rows: ${csv.split("\n").length - 2}`);
}

function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, { ...options, muteHttpExceptions: true });
      if (res.getResponseCode() < 500) return res;
      lastError = new Error(`HTTP ${res.getResponseCode()}`);
    } catch (e) {
      lastError = e;
    }
    Utilities.sleep(15000 * (attempt + 1));
  }
  throw lastError;
}
