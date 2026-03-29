import { google } from 'googleapis';
import { getCache, setCache, clearCache } from './cache.js';

const SHEET_ID   = process.env.SHEET_ID;
const SHEET_NAME = 'Rezervacijas';
const DELETED_SHEET = 'Dzēstās rezervācijas';

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
    outside:  r[15] === true || r[15] === 'TRUE' || r[15] === 'true',
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
    range: `${SHEET_NAME}!A:P`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const bookings = rows.slice(1).filter(r => r[0]).map(rowToBooking);
  setCache(bookings);
  return bookings;
}

export async function saveBooking(data) {
  const people   = parseInt(data.people) || 0;
  const isClosed = data.closed === true || data.closed === 'true';
  const isOutside = data.outside === true || data.outside === 'true';
  const sheets   = await getSheets();
  const id       = 'R' + Date.now();
  const ts       = nowRiga();
  await sheets.spreadsheets.values.append({
    spreadsheetId:    SHEET_ID,
    range:            `${SHEET_NAME}!A:P`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[
      id, data.date, data.timeFrom || '', data.timeTo || '',
      data.client || '', data.phone || '', data.email || '', people,
      data.invoice || 'Uz vietas', data.comment || '',
      data.admin || '', ts, data.food || '', 'Aktīva', isClosed, isOutside,
    ]]},
  });
  clearCache();
  return { ok: true, id };
}

export async function updateBooking(id, data) {
  const sheets = await getSheets();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:P`,
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
  if (data.date)              set(2, data.date);
  if (data.timeFrom)          set(3, data.timeFrom);
  if (data.timeTo)            set(4, data.timeTo);
  if (data.client !== undefined)  set(5, data.client);
  if (data.phone !== undefined)   set(6, data.phone);
  if (data.email !== undefined)   set(7, data.email);
  if (data.people !== undefined)  set(8, parseInt(data.people));
  if (data.invoice !== undefined) set(9, data.invoice);
  if (data.comment !== undefined) set(10, data.comment);
  if (data.admin !== undefined)   set(11, data.admin);
  set(12, nowRiga());
  if (data.food !== undefined)    set(13, data.food);
  if (data.status !== undefined)  set(14, data.status);
  if (data.closed !== undefined)  set(15, data.closed === true || data.closed === 'true');
  if (data.outside !== undefined) set(16, data.outside === true || data.outside === 'true');
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

  // Iegūt rezervācijas datus pirms dzēšanas
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:P`,
  });
  const rows = res.data.values || [];
  const idx  = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(id));
  if (idx === -1) return { ok: false, reason: 'not_found' };

  const deletedRow = rows[idx];

  // Saglabāt dzēstajā lapā
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
        resource: { values: [['ID','Datums','No','Līdz','Klients','Telefons','E-pasts','Cilvēki','Maks.','Komentāri','Admin','Pieņemts','Ēdieni','Statuss','Slēgts','Ārpus','Dzēšanas datums','Iemesls']] }
      });
    }
    const now = nowRiga();
    const rowData = [...(deletedRow.slice(0, 16))];
    while (rowData.length < 16) rowData.push('');
    rowData.push(now, reason || '');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${DELETED_SHEET}!A:R`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  } catch(e) {
    console.error('Nevar saglabāt dzēsto:', e.message);
  }

  // Dzēst no galvenās lapas
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
