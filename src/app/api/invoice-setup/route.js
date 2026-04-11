import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const INVOICE_SHEET_ID = process.env.INVOICE_SHEET_ID || '1TaIeKNwAcmXT5pbtL_v1lNr89jRcHHkXC6zTBYbGYQw';

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

export async function GET() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Pārbaudīt vai Šablons jau eksistē
    const meta = await sheets.spreadsheets.get({ spreadsheetId: INVOICE_SHEET_ID });
    const existing = meta.data.sheets.map(s => s.properties.title);
    
    if (existing.includes('Šablons')) {
      return NextResponse.json({ ok: true, message: 'Šablons jau eksistē', sheets: existing });
    }

    // Pārsaukt pirmo lapu uz "Šablons"
    const firstSheetId = meta.data.sheets[0].properties.sheetId;
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: INVOICE_SHEET_ID,
      resource: {
        requests: [
          // Pārsaukt
          { updateSheetProperties: { properties: { sheetId: firstSheetId, title: 'Šablons' }, fields: 'title' } },
          // Kolonnu platumi
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: firstSheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
        ]
      }
    });

    // Aizpildīt šablonu ar saturu
    const orange = { red: 0.91, green: 0.30, blue: 0.05 }; // #E84D0E
    const white = { red: 1, green: 1, blue: 1 };
    const gray = { red: 0.4, green: 0.4, blue: 0.4 };
    const lightGray = { red: 0.95, green: 0.95, blue: 0.95 };

    await sheets.spreadsheets.values.update({
      spreadsheetId: INVOICE_SHEET_ID,
      range: 'Šablons!A1:F30',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['', 'DRIFT ARENA', '', '', '', '{{REKINA_NR}}'],
          ['', 'WOLFTRIKE', '', '', '', ''],
          ['', '', '', '', 'Izrakstīts:', '{{DATUMS}}'],
          ['', '', '', '', 'Apmaksas termiņš:', '{{TERMINS}}'],
          ['', '', '', '', '', ''],
          ['', 'NOSŪTĪTĀJS', '', 'SAŅĒMĒJS', '', ''],
          ['', 'SIA "DA LIEPĀJA"', '', '{{SANEMEJS_NOSAUKUMS}}', '', ''],
          ['', 'PVN Nr: LV40203522098', '', '{{SANEMEJS_REG}}', '', ''],
          ['', 'Reģ. Nr: 40203522098', '', '{{SANEMEJS_PVN}}', '', ''],
          ['', 'Liepāja, Ganību 197/205, LV-3407', '', '{{SANEMEJS_ADRESE}}', '', ''],
          ['', 'Luminor Bank AS Latvijas filiāle; RIKOLV2X', '', '', '', ''],
          ['', 'Konts: LV81RIKO0001080210823', '', '', '', ''],
          ['', '', '', '', '', ''],
          ['', 'NOSAUKUMS', '', 'DAUDZ. (GAB.)', 'CENA BEZ PVN (EUR)', 'SUMMA'],
          ['', '{{POZ_1_NOSAUKUMS}}', '', '{{POZ_1_DAUDZ}}', '{{POZ_1_CENA}}', '{{POZ_1_SUMMA}}'],
          ['', '{{POZ_2_NOSAUKUMS}}', '', '{{POZ_2_DAUDZ}}', '{{POZ_2_CENA}}', '{{POZ_2_SUMMA}}'],
          ['', '{{POZ_3_NOSAUKUMS}}', '', '{{POZ_3_DAUDZ}}', '{{POZ_3_CENA}}', '{{POZ_3_SUMMA}}'],
          ['', '{{POZ_4_NOSAUKUMS}}', '', '{{POZ_4_DAUDZ}}', '{{POZ_4_CENA}}', '{{POZ_4_SUMMA}}'],
          ['', '{{POZ_5_NOSAUKUMS}}', '', '{{POZ_5_DAUDZ}}', '{{POZ_5_CENA}}', '{{POZ_5_SUMMA}}'],
          ['', '', '', '', '', ''],
          ['', '', '', '', 'Summa bez PVN:', '{{SUMMA_BEZ_PVN}}'],
          ['', '', '', '', 'PVN 21%:', '{{PVN_SUMMA}}'],
          ['', '', '', '', 'KOPĀ APMAKSAI:', '{{KOPA_APMAKSAI}}'],
          ['', '', '', '', '', ''],
          ['', '', '', '', '', ''],
          ['', 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta.', '', '', '', ''],
        ]
      }
    });

    // Formatēšana
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: INVOICE_SHEET_ID,
      resource: {
        requests: [
          // DRIFT ARENA virsraksts — oranžs, liels, bold
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 20, bold: true, foregroundColor: orange }, horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat' } },
          // WOLFTRIKE
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 3 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 8, foregroundColor: gray } } }, fields: 'userEnteredFormat' } },
          // Rēķina numurs — labajā pusē, liels
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 14, bold: true }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat' } },
          // Datumi — labajā pusē
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 4, endColumnIndex: 6 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: gray }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat' } },
          // NOSŪTĪTĀJS/SAŅĒMĒJS headers
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 8, bold: true, foregroundColor: gray } } }, fields: 'userEnteredFormat' } },
          // Nosūtītāja nosaukums bold
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 3 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 10, bold: true } } }, fields: 'userEnteredFormat' } },
          // Saņēmēja nosaukums bold
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 3, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 10, bold: true } } }, fields: 'userEnteredFormat' } },
          // Tabulas header — oranžs fons, balts teksts
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 6 },
            cell: { userEnteredFormat: {
              backgroundColor: orange,
              textFormat: { fontSize: 9, bold: true, foregroundColor: white },
              horizontalAlignment: 'CENTER',
              borders: { top: {style:'SOLID',color:orange}, bottom: {style:'SOLID',color:orange}, left: {style:'SOLID',color:orange}, right: {style:'SOLID',color:orange} }
            } }, fields: 'userEnteredFormat' } },
          // Tabulas rindas — oranžas malas
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 14, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 6 },
            cell: { userEnteredFormat: {
              borders: { top: {style:'SOLID',color:orange}, bottom: {style:'SOLID',color:orange}, left: {style:'SOLID',color:orange}, right: {style:'SOLID',color:orange} },
              textFormat: { fontSize: 9 }
            } }, fields: 'userEnteredFormat' } },
          // Summas — labajā pusē, bold
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 4, endColumnIndex: 6 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 13, bold: true, foregroundColor: orange }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat' } },
          // Oranža līnija zem tabulas (row 19)
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 6 },
            cell: { userEnteredFormat: { borders: { top: {style:'SOLID',width:2,color:orange} } } }, fields: 'userEnteredFormat' } },
          // Piezīme apakšā
          { repeatCell: { range: { sheetId: firstSheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 1, endColumnIndex: 6 },
            cell: { userEnteredFormat: { textFormat: { fontSize: 8, italic: true, foregroundColor: gray } } }, fields: 'userEnteredFormat' } },
        ]
      }
    });

    return NextResponse.json({ ok: true, message: 'Šablons izveidots!' });
  } catch (e) {
    console.error('Invoice setup error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
