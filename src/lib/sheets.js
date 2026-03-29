import { google } from 'googleapis';

const SHEET_ID   = process.env.SHEET_ID;
const SHEET_NAME = 'Rezervācijas';
const CAP_MAX    = 90;
const TZ         = 'Europe/Riga';

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheet() {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

function toMin(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

function p2(n) { return String(n).padStart(2, '0'); }

function overlaps(s1, e1, s2, e2) {
  return toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);
}

function nowRiga() {
  return new Date().toLocaleString('lv-LV', { timeZone: TZ });
}

function minToTime(min) {
  return p2(Math.floor(min / 60)) + ':' + p2(min % 60);
}

const WORK_HOURS = {
  1: { open: '11:00', close: '22:00' },
  2: { open: '11:00', close: '22:00' },
  3: { open: '11:00', close: '22:00' },
  4: { open: '11:00', close: '22:00' },
  5: { open: '11:00', close: '23:00' },
  6: { open: '10:00', close: '23:00' },
  0: { open: '10:00', close: '22:00' },
};

function workHours(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return WORK_HOURS[dow] || { open: '11:00', close: '22:00' };
}

function withinHours(dateStr, from, to) {
  const wh = workHours(dateStr);
  return toMin(from) >= toMin(wh.open) && toMin(to) <= toMin(wh.close);
}

function rowToBooking(r) {
  return {
    id:       String(r[0] || ''),
    date:     r[1] ? String(r[1]).substring(0, 10) : '',
    timeFrom: String(r[2] || ''),
    timeTo:   String(r[3] || ''),
    client:   String(r[4] || ''),
    phone:    String(r[5] || ''),
    email:    String(r[6] || ''),
    people:   parseInt(r[7]) || 0,
    invoice:  String(r[8] || ''),
    comment:  String(r[9] || ''),
    admin:    String(r[10] || ''),
    accepted: String(r[11] || ''),
    food:     String(r[12] || ''),
    status:   String(r[13] || 'Aktīva'),
    closed:   r[14] === true || r[14] === 'TRUE' || r[14] === 'true',
  };
}

export async function getAllBookings() {
  const sheets = await getSheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:O`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(r => r[0]).map(rowToBooking);
}

function getOccupancyFromList(bookings, dateStr, from, to, excludeId) {
  const relevant = bookings.filter(b =>
    b.date === dateStr &&
    b.status !== 'Atcelta' &&
    String(b.id) !== String(excludeId || '') &&
    overlaps(b.timeFrom, b.timeTo, from, to)
  );
  if (!relevant.length) return 0;
  if (relevant.some(b => b.closed)) return CAP_MAX;
  const pts = new Set([toMin(from), toMin(to)]);
  relevant.forEach(b => { pts.add(toMin(b.timeFrom)); pts.add(toMin(b.timeTo)); });
  const sorted = [...pts].sort((a, b) => a - b);
  let maxOcc = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    const occ = relevant
      .filter(b => toMin(b.timeFrom) <= mid && toMin(b.timeTo) > mid)
      .reduce((s, b) => s + b.people, 0);
    if (occ > maxOcc) maxOcc = occ;
  }
  return maxOcc;
}

export async function saveBooking(data) {
  const isClosed  = data.closed === true || data.closed === 'true';
  const isOutside = data.outside === true || data.outside === 'true';
  const people    = parseInt(data.people) || 0;

  if (!isOutside && !withinHours(data.date, data.timeFrom, data.timeTo)) {
    const wh = workHours(data.date);
    return { ok: false, reason: 'hours', open: wh.open, close: wh.close };
  }

  const bookings = await getAllBookings();
  if (!isClosed) {
    const occ = getOccupancyFromList(bookings, data.date, data.timeFrom, data.timeTo, null);
    if (occ + people > CAP_MAX) return { ok: false, reason: 'capacity', occupied: occ };
    if (occ >= CAP_MAX) return { ok: false, reason: 'closed_event' };
  }

  const sheets = await getSheet();
  const id     = 'R' + Date.now();
  const ts     = nowRiga();

  await sheets.spreadsheets.values.append({
    spreadsheetId:     SHEET_ID,
    range:             `${SHEET_NAME}!A:O`,
    valueInputOption:  'USER_ENTERED',
    resource: { values: [[
      id, data.date, data.timeFrom, data.timeTo,
      data.client || '', data.phone || '', data.email || '', people,
      data.invoice || 'Uz vietas', data.comment || '',
      data.admin || '', ts, data.food || '', 'Aktīva', isClosed,
    ]]},
  });

  return { ok: true, id };
}

export async function updateBooking(id, data) {
  const sheets  = await getSheet();
  const res     = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:O`,
  });
  const rows = res.data.values || [];
  const idx  = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (idx === -1) return { ok: false, reason: 'not_found' };

  const rowNum = idx + 1;
  const cur    = rows[idx];

  const updates = [];
  const set = (col, val) => {
    if (val !== undefined && val !== null)
      updates.push({ range: `${SHEET_NAME}!${String.fromCharCode(64 + col)}${rowNum}`, values: [[val]] });
  };

  if (data.date)     set(2, data.date);
  if (data.timeFrom) set(3, data.timeFrom);
  if (data.timeTo)   set(4, data.timeTo);
  if (data.client)   set(5, data.client);
  if (data.phone)    set(6, data.phone);
  if (data.email)    set(7, data.email);
  if (data.people)   set(8, parseInt(data.people));
  if (data.invoice)  set(9, data.invoice);
  if (data.comment !== undefined) set(10, data.comment);
  if (data.admin)    set(11, data.admin);
  set(12, nowRiga());
  if (data.food !== undefined)   set(13, data.food);
  if (data.status)   set(14, data.status);
  if (data.closed !== undefined) set(15, data.closed === true || data.closed === 'true');

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data: updates },
    });
  }
  return { ok: true };
}

export async function deleteBooking(id) {
  const sheets = await getSheet();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });
  const rows = res.data.values || [];
  const idx  = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (idx === -1) return { ok: false, reason: 'not_found' };

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetId   = sheetMeta.data.sheets.find(s => s.properties.title === SHEET_NAME)?.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: { requests: [{ deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }
    }}]},
  });
  return { ok: true };
}

export async function setStatus(id, status) {
  return updateBooking(id, { status });
}

export { CAP_MAX, workHours };
