/**
 * Mindlap lead files: "Leads – Master" (every lead) split 50/50 into "Leads – BDE 1" and "Leads – BDE 2".
 *
 * Live copy: Apps Script project "Mindlap lead files" (script.google.com, owner aflahkt610@gmail.com). To set it up again,
 * paste this file over Code.gs in a new project, save, then
 *   1. run `setup` (allow access when Google asks). It prints the key for the booking app.
 *   2. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone". Copy the web app URL.
 *   3. On the booking app server set LEADS_SHEET_URL (that URL) and LEADS_SHEET_KEY (the key from step 1).
 *
 * What it does:
 * - A lead from the booking app (each new WhatsApp chat on 774) or typed into Master by hand gets a Lead ID and the next
 *   BDE in turn (BDE 1, BDE 2, BDE 1, ...), and is copied into that BDE's file.
 * - When a BDE changes Status, Last call, Next follow-up or Notes in their file, Master shows the same.
 * - A phone that already has an open lead (not Booked, Not interested or Junk) is not added again.
 */

const MASTER_ID = "1muMdGqpRAIb4rwmu0hGReu0kJ3Sef8_273wdIZoX4LA";
const BDES = [
  { name: "BDE 1", id: "1_7VJFmpwP_4j5-mQgKlcFe54vkYVfli3Xos7vLvBnvg" },
  { name: "BDE 2", id: "1aNi8UcZ--X2HnBlTegaUyrD-5Hif0xNAxWSHdTFaNhY" },
];
const TAB = "Leads";
const CLOSED = ["Booked", "Not interested", "Junk"];

// Master columns: A Lead ID, B Received, C Name, D Phone, E First message, F Source, G Assigned to,
// H Status, I Last call, J Next follow-up, K Notes. BDE columns: A..E the same, then F Status .. I Notes.
const M = { id: 1, received: 2, name: 3, phone: 4, message: 5, source: 6, assigned: 7, status: 8 };
const BDE_STATUS_COL = 6; // F..I in a BDE file map to H..K in Master
const SYNC_WIDTH = 4;

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("KEY")) props.setProperty("KEY", Utilities.getUuid().replace(/-/g, ""));
  if (!props.getProperty("COUNT")) props.setProperty("COUNT", "0");
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onMasterEdit").forSpreadsheet(MASTER_ID).onEdit().create();
  BDES.forEach((b) => ScriptApp.newTrigger("onBdeEdit").forSpreadsheet(b.id).onEdit().create());
  Logger.log("LEADS_SHEET_KEY = " + props.getProperty("KEY"));
}

/** The booking app posts {name, phone, message, source, receivedAt} here with ?key=... */
function doPost(e) {
  const key = PropertiesService.getScriptProperties().getProperty("KEY");
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json({ ok: false, error: "forbidden" });
  let d;
  try {
    d = JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ ok: false, error: "bad json" });
  }
  const phone = String(d.phone || "").trim();
  if (!phone) return json({ ok: false, error: "phone required" });
  return withLock(() => {
    const master = sheet(MASTER_ID);
    const open = openLeadFor(master, phone);
    if (open) return json({ ok: true, duplicate: true, leadId: open });
    const row = master.getLastRow() + 1;
    const received = d.receivedAt ? new Date(d.receivedAt) : new Date();
    master.getRange(row, 1, 1, 8).setValues([["", received, d.name || "", "'" + phone, d.message || "", d.source || "WhatsApp 774", "", ""]]);
    return json(Object.assign({ ok: true }, assign(master, row)));
  });
}

/** A lead typed into Master by hand: once its phone is in, it gets an ID and a BDE like any other. */
function onMasterEdit(e) {
  if (!e || e.range.getSheet().getName() !== TAB) return;
  const master = e.range.getSheet();
  withLock(() => {
    for (let r = Math.max(2, e.range.getRow()); r <= e.range.getLastRow(); r++) {
      const v = master.getRange(r, 1, 1, M.assigned).getValues()[0];
      if (!v[M.id - 1] && String(v[M.phone - 1]).trim()) {
        if (!v[M.received - 1]) master.getRange(r, M.received).setValue(new Date());
        if (!v[M.source - 1]) master.getRange(r, M.source).setValue("Typed in");
        assign(master, r);
      }
    }
  });
}

/** A BDE's own updates, shown in Master next to the lead. */
function onBdeEdit(e) {
  if (!e || e.range.getSheet().getName() !== TAB) return;
  const bdeSheet = e.range.getSheet();
  const first = Math.max(2, e.range.getRow());
  const last = e.range.getLastRow();
  if (last < first || e.range.getLastColumn() < BDE_STATUS_COL) return;
  const master = sheet(MASTER_ID);
  const ids = master.getRange(1, M.id, master.getLastRow(), 1).getValues().map((r) => String(r[0]));
  for (let r = first; r <= last; r++) {
    const id = String(bdeSheet.getRange(r, 1).getValue());
    const at = ids.indexOf(id);
    if (!id || at < 1) continue;
    const values = bdeSheet.getRange(r, BDE_STATUS_COL, 1, SYNC_WIDTH).getValues();
    master.getRange(at + 1, M.status, 1, SYNC_WIDTH).setValues(values);
  }
}

/** Gives row `row` of Master the next Lead ID and the next BDE in turn, and copies it to that BDE's file. */
function assign(master, row) {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty("COUNT") || "0") + 1;
  props.setProperty("COUNT", String(n));
  const bde = BDES[(n - 1) % BDES.length];
  const id = "L-" + ("0000" + n).slice(-5);
  master.getRange(row, M.id).setValue(id);
  master.getRange(row, M.assigned).setValue(bde.name);
  if (!master.getRange(row, M.status).getValue()) master.getRange(row, M.status).setValue("New");
  const v = master.getRange(row, 1, 1, M.status).getValues()[0];
  const phone = String(v[M.phone - 1]);
  sheet(bde.id).appendRow([id, v[M.received - 1], v[M.name - 1], "'" + phone, v[M.message - 1], v[M.status - 1]]);
  return { leadId: id, assignedTo: bde.name };
}

function openLeadFor(master, phone) {
  const last = master.getLastRow();
  if (last < 2) return null;
  const rows = master.getRange(2, 1, last - 1, M.status).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][M.phone - 1]).trim() === phone && CLOSED.indexOf(String(rows[i][M.status - 1])) < 0) return rows[i][M.id - 1];
  }
  return null;
}

function sheet(id) {
  return SpreadsheetApp.openById(id).getSheetByName(TAB);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
