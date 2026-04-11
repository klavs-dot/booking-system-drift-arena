import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const INVOICE_SHEET_ID = process.env.INVOICE_SHEET_ID || '1w_XA_aIyXyZzGLzUbgaMllTUtu8BkwxmA5bsXeeayPA';

function getAuth() {
  let credentials = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT nav iestatīts');
  const creds = JSON.parse(credentials);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

export const maxDuration = 30;

export async function POST(req) {
  try {
    const data = await req.json();
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const s = data.sender || {};
    const rek = data.rek || {};
    const rides = data.rides || { qty: 0, price: 0, total: 0 };
    const drinks = data.drinks || [];
    const isTelpa = data.isTelpa;
    const invNumber = data.invNumber || 'Rēķins';

    // 1. Atrast Šablons sheet ID
    const meta = await sheets.spreadsheets.get({ spreadsheetId: INVOICE_SHEET_ID });
    const templateSheet = meta.data.sheets.find(s => s.properties.title === 'Šablons');
    if (!templateSheet) {
      return NextResponse.json({ ok: false, error: 'Šablons nav atrasts!' }, { status: 400 });
    }
    const templateSheetId = templateSheet.properties.sheetId;

    // 2. Kopēt šablonu
    const copyRes = await sheets.spreadsheets.sheets.copyTo({
      spreadsheetId: INVOICE_SHEET_ID,
      sheetId: templateSheetId,
      resource: { destinationSpreadsheetId: INVOICE_SHEET_ID }
    });
    const newSheetId = copyRes.data.sheetId;

    // 3. Pārsaukt un pārvietot
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: INVOICE_SHEET_ID,
      resource: {
        requests: [
          { updateSheetProperties: { properties: { sheetId: newSheetId, title: invNumber, index: 1 }, fields: 'title,index' } }
        ]
      }
    });

    // 4. Sagatavot pozīcijas
    const positions = [];
    let grandTotal = 0;

    if (isTelpa) {
      const total = rides.total + drinks.reduce((sum, d) => sum + d.qty * d.price, 0);
      const net = total / 1.21;
      positions.push({ name: 'Telpu noma', qty: 1, price: net, sum: net });
      grandTotal = total;
    } else {
      if (rides.total > 0) {
        const rNet = rides.total / 1.21;
        positions.push({ name: 'Braucieni', qty: rides.qty, price: rides.price / 1.21, sum: rNet });
        grandTotal += rides.total;
      }
      drinks.forEach(d => {
        if (d.price > 0) {
          const lt = d.qty * d.price;
          const ln = lt / 1.21;
          positions.push({ name: d.name || 'Dzēriens', qty: d.qty, price: d.price / 1.21, sum: ln });
          grandTotal += lt;
        }
      });
    }

    const netGrand = grandTotal / 1.21;
    const vatGrand = grandTotal - netGrand;

    // 5. Find-and-replace placeholders
    const replacements = {
      '{{REKINA_NR}}': invNumber,
      '{{DATUMS}}': data.date || '',
      '{{TERMINS}}': data.dueDate || '',
      '{{SANEMEJS_NOSAUKUMS}}': rek.name || data.client || '',
      '{{SANEMEJS_REG}}': rek.reg ? 'Reģ. Nr: ' + rek.reg : '',
      '{{SANEMEJS_PVN}}': rek.pvn ? 'PVN Nr: ' + rek.pvn : '',
      '{{SANEMEJS_ADRESE}}': rek.addr || '',
      '{{SUMMA_BEZ_PVN}}': netGrand.toFixed(2) + ' EUR',
      '{{PVN_SUMMA}}': vatGrand.toFixed(2) + ' EUR',
      '{{KOPA_APMAKSAI}}': grandTotal.toFixed(2) + ' EUR',
    };

    // Pozīcijas 1-5
    for (let i = 1; i <= 5; i++) {
      const p = positions[i - 1];
      replacements['{{POZ_' + i + '_NOSAUKUMS}}'] = p ? p.name : '';
      replacements['{{POZ_' + i + '_DAUDZ}}'] = p ? String(p.qty) : '';
      replacements['{{POZ_' + i + '_CENA}}'] = p ? p.price.toFixed(2) : '';
      replacements['{{POZ_' + i + '_SUMMA}}'] = p ? p.sum.toFixed(2) : '';
    }

    // Batch find-and-replace
    const replaceRequests = Object.entries(replacements).map(([find, replace]) => ({
      findReplace: {
        find: find,
        replacement: replace,
        sheetId: newSheetId,
        matchCase: true,
        matchEntireCell: false,
      }
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: INVOICE_SHEET_ID,
      resource: { requests: replaceRequests }
    });

    // 6. Eksportēt kā PDF
    const authClient = await auth.getClient();
    const token = await authClient.getAccessToken();

    const pdfUrl = `https://docs.google.com/spreadsheets/d/${INVOICE_SHEET_ID}/export?`
      + `format=pdf&gid=${newSheetId}`
      + `&size=A4&portrait=true`
      + `&fitw=true&gridlines=false`
      + `&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4`;

    const pdfRes = await fetch(pdfUrl, {
      headers: { Authorization: 'Bearer ' + token.token }
    });

    if (!pdfRes.ok) {
      return NextResponse.json({ ok: false, error: 'PDF eksports neizdevās: ' + pdfRes.status }, { status: 500 });
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = 'data:application/pdf;base64,' + Buffer.from(pdfBuffer).toString('base64');

    return NextResponse.json({
      ok: true,
      pdf: pdfBase64,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${INVOICE_SHEET_ID}/edit#gid=${newSheetId}`,
      invNumber
    });

  } catch (e) {
    console.error('Invoice error:', e.message, e.stack);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
