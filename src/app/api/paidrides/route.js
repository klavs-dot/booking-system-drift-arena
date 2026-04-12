import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SHEET_ID = process.env.SHEET_ID;
const TAB_NAME = 'Apmaksātie braucieni';

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

export const maxDuration = 30;

// GET — nolasīt visus ierakstus
export async function GET() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Pārbaudīt vai tab eksistē, ja nē — izveidot
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const tabExists = meta.data.sheets.some(s => s.properties.title === TAB_NAME);

    if (!tabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] }
      });
      // Pievienot headeri
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${TAB_NAME}'!A1:F1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['ID', 'Vārds', 'Uzvārds', 'Telefons', 'Braucieni', 'Piezīmes']] }
      });
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A:F`,
    });

    const rows = res.data.values || [];
    // Izlaist headeri
    const data = rows.slice(1).map(r => ({
      id: r[0] || '',
      name: r[1] || '',
      surname: r[2] || '',
      phone: r[3] || '',
      rides: r[4] || '0',
      notes: r[5] || '',
    })).filter(r => r.id);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('PaidRides GET error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST — pievienot jaunu vai atjaunot
export async function POST(req) {
  try {
    const body = await req.json();
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    if (body.action === 'add') {
      const id = 'PR_' + Date.now();
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `'${TAB_NAME}'!A:F`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[id, body.name || '', body.surname || '', body.phone || '', body.rides || '0', body.notes || '']] }
      });
      return NextResponse.json({ ok: true, id });
    }

    if (body.action === 'update') {
      // Atrast rindu pēc ID
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${TAB_NAME}'!A:F`,
      });
      const rows = res.data.values || [];
      let rowIdx = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.id) { rowIdx = i + 1; break; }
      }
      if (rowIdx === -1) return NextResponse.json({ ok: false, error: 'Nav atrasts' }, { status: 404 });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${TAB_NAME}'!A${rowIdx}:F${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[body.id, body.name || '', body.surname || '', body.phone || '', body.rides || '0', body.notes || '']] }
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'delete') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${TAB_NAME}'!A:F`,
      });
      const rows = res.data.values || [];
      let rowIdx = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.id) { rowIdx = i; break; }
      }
      if (rowIdx === -1) return NextResponse.json({ ok: false, error: 'Nav atrasts' }, { status: 404 });

      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const tab = sheetMeta.data.sheets.find(s => s.properties.title === TAB_NAME);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{
            deleteDimension: {
              range: { sheetId: tab.properties.sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 }
            }
          }]
        }
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Nezināma darbība' }, { status: 400 });
  } catch (e) {
    console.error('PaidRides POST error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
