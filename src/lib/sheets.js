import { google } from 'googleapis';
import { getCache, setCache, clearCache } from './cache.js';

const SHEET_ID   = process.env.SHEET_ID;
const SHEET_NAME = 'Rezervacijas';
const DELETED_SHEET = 'Dzēstās rezervācijas';

// ================================================================
// Google Sheets kolonnas (A=1, B=2, ... S=19):
// A(0)  = ID
// B(1)  = Datums
// C(2)  = Laiks no
// D(3)  = Laiks līdz
// E(4)  = Klients
// F(5)  = Telefons
// G(6)  = E-pasts
// H(7)  = Cilvēku skaits
// I(8)  = Maksājums
// J(9)  = Komentārs
// K(10) = Administrators
// L(11) = Pieņemts (timestamp)
// M(12) = Ēdieni
// N(13) = Statuss
// O(14) = Slēgtais pasākums
// P(15) = Ārpus darba laika
// Q(16) = Dzērieni
// R(17) = Braucieni
// S(18) = Rekvizīti (JSON)
// ================================================================

function getAuth() {
  let credentials = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT nav iestatīts');
  const creds = JSON.parse(credentials);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

function isOutsideHours(dateStr, timeFrom, timeTo) {
  if (!dateStr || !timeFrom || !timeTo) return false;
  const WORK_HOURS = {
    1:{open:'11:00',close:'22:00'}, 2:{open:'11:00',close:'22:00'},
    3:{open:'11:00',close:'22:00'}, 4:{open:'11:00',close:'22:00'},
    5:{open:'11:00',close:'23:00'}, 6:{open:'10:00',close:'23:00'},
    0:{open:'10:00',close:'22:00'},
  };
  try {
    const [y,m,d] = dateStr.split('-').map(Number);
    const dow = new Date(y,m-1,d).getDay();
    const wh = WORK_HOURS[dow] || {open:'11:00',close:'22:00'};
    const toMin = t => { const p=String(t).match(/(\d{1,2}):(\d{2})/); return p?parseInt(p[1])*60+parseInt(p[2]):0; };
    return toMin(timeFrom) < toMin(wh.open) || toMin(timeTo) > toMin(wh.close);
  } catch(e) { return false; }
}

function bool(v) {
  return v === true || v === 'TRUE' || v === 'true' || String(v).toUpperCase() === 'TRUE';
}

function rowToBooking(r) {
  const dateStr = r[1] ? String(r[1]).substring(0, 10) : '';
  const tf = String(r[2] || '');
  const tt = String(r[3] || '');
  return {
    id:        String(r[0] || ''),
    date:      dateStr,
    timeFrom:  tf,
    timeTo:    tt,
    client:    String(r[4] || ''),
    phone:     String(r[5] || ''),
    email:     String(r[6] || ''),
    people:    parseInt(r[7]) || 0,
    invoice:   String(r[8] || ''),
    comment:   String(r[9] || ''),
    admin:     String(r[10] || ''),
    accepted:  String(r[11] || ''),
    food:      String(r[12] || ''),
    status:    String(r[13] || 'Aktīva'),
    closed:    bool(r[14]),
    outside:   bool(r[15]) || isOutsideHours(dateStr, tf, tt),
    drinks:    String(r[16] || ''),
    rides:     parseInt(r[17]) || 0,
    rekviziti: String(r[18] || ''),
  };
}

function nowRiga() {
  return new Date().toLocaleString('lv-LV', { timeZone: 'Europe/Riga' });
}

export async function getAllBookings() {
  const cached = getCache();
  if (cached) return cached;
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:S`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const bookings = rows.slice(1).filter(r => r[0]).map(rowToBooking);
  setCache(bookings);
  return bookings;
}

export async function saveBooking(data) {
  const sheets = await getSheets();
  const id  = 'R' + Date.now();
  const ts  = nowRiga();
  await sheets.spreadsheets.values.append({
    spreadsheetId:    SHEET_ID,
    range:            `${SHEET_NAME}!A:S`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[
      id,                                    // A - ID
      data.date || '',                       // B - Datums
      data.timeFrom || '',                   // C - No
      data.timeTo || '',                     // D - Līdz
      data.client || '',                     // E - Klients
      data.phone || '',                      // F - Telefons
      data.email || '',                      // G - E-pasts
      parseInt(data.people) || 0,            // H - Cilvēki
      data.invoice || 'Uz vietas',           // I - Maksājums
      data.comment || '',                    // J - Komentārs
      data.admin || '',                      // K - Admins
      ts,                                    // L - Pieņemts
      data.food || '',                       // M - Ēdieni
      'Aktīva',                              // N - Statuss
      bool(data.closed),                     // O - Slēgts
      bool(data.outside),                    // P - Ārpus
      data.drinks || '',                     // Q - Dzērieni
      parseInt(data.rides) || 0,             // R - Braucieni
      data.rekviziti || '',                  // S - Rekvizīti
    ]]},
  });
  clearCache();
  return { ok: true, id };
}

export async function updateBooking(id, data) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:S`,
  });
  const rows = res.data.values || [];
  const idx  = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (idx === -1) return { ok: false, reason: 'not_found' };
  const rowNum = idx + 1;
  const updates = [];
  const col = (c) => String.fromCharCode(64 + c);
  const set = (c, val) => {
    if (val !== undefined && val !== null)
      updates.push({ range: `${SHEET_NAME}!${col(c)}${rowNum}`, values: [[val]] });
  };
  // B=2 C=3 D=4 E=5 F=6 G=7 H=8 I=9 J=10 K=11 L=12 M=13 N=14 O=15 P=16 Q=17 R=18 S=19
  if (data.date !== undefined)      set(2, data.date);
  if (data.timeFrom !== undefined)  set(3, data.timeFrom);
  if (data.timeTo !== undefined)    set(4, data.timeTo);
  if (data.client !== undefined)    set(5, data.client);
  if (data.phone !== undefined)     set(6, data.phone);
  if (data.email !== undefined)     set(7, data.email);
  if (data.people !== undefined)    set(8, parseInt(data.people) || 0);
  if (data.invoice !== undefined)   set(9, data.invoice);
  if (data.comment !== undefined)   set(10, data.comment);
  if (data.admin !== undefined)     set(11, data.admin);
  set(12, nowRiga());
  if (data.food !== undefined)      set(13, data.food);
  if (data.status !== undefined)    set(14, data.status);
  if (data.closed !== undefined)    set(15, bool(data.closed));
  if (data.outside !== undefined)   set(16, bool(data.outside));
  if (data.drinks !== undefined)    set(17, data.drinks);
  if (data.rides !== undefined)     set(18, parseInt(data.rides) || 0);
  if (data.rekviziti !== undefined) set(19, data.rekviziti);
  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data: updates },
    });
  }
  clearCache();
  return { ok: true };
}

export async function deleteBooking(id, clientName, reason) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:S`,
  });
  const rows = res.data.values || [];
  const idx  = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (idx === -1) return { ok: false, reason: 'not_found' };
  const deletedRow = rows[idx];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetExists = meta.data.sheets.some(s => s.properties.title === DELETED_SHEET);
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests: [{ addSheet: { properties: { title: DELETED_SHEET } } }] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${DELETED_SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['ID','Datums','No','Līdz','Klients','Telefons','E-pasts','Cilvēki','Maks.','Komentāri','Admin','Pieņemts','Ēdieni','Statuss','Slēgts','Ārpus','Dzērieni','Braucieni','Rekvizīti','Dzēšanas datums','Iemesls']] }
      });
    }
    const now = nowRiga();
    const rowData = [...(deletedRow.slice(0, 19))];
    while (rowData.length < 19) rowData.push('');
    rowData.push(now, reason || '');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${DELETED_SHEET}!A:U`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  } catch(e) {
    console.error('Nevar saglabāt dzēsto:', e.message);
  }
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetId   = sheetMeta.data.sheets.find(s => s.properties.title === SHEET_NAME)?.properties.sheetId;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: { requests: [{ deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }
    }}] }
  });
  clearCache();
  return { ok: true };
}

export async function setStatus(id, status) {
  return updateBooking(id, { status });
}
