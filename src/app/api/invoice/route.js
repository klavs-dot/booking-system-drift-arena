import { NextResponse } from 'next/server';
import PdfPrinter from 'pdfmake';
import path from 'path';
import fs from 'fs';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const data = await req.json();

    const fontsDir = path.join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto');
    const fonts = {
      Roboto: {
        normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
      }
    };
    const printer = new PdfPrinter(fonts);

    const s = data.sender || {};
    const rek = data.rek || {};
    const rides = data.rides || { qty: 0, price: 0, total: 0 };
    const drinks = data.drinks || [];
    const isTelpa = data.isTelpa;

    const recLines = [];
    if (rek.name) recLines.push(rek.name);
    if (rek.reg) recLines.push('Reģ. Nr: ' + rek.reg);
    if (rek.pvn) recLines.push('PVN Nr: ' + rek.pvn);
    if (rek.addr) recLines.push(rek.addr);
    if (!recLines.length) recLines.push(data.client || '');

    const tableBody = [
      [
        { text: 'NOSAUKUMS', style: 'thdr' },
        { text: 'DAUDZ. (GAB.)', style: 'thdr', alignment: 'center' },
        { text: 'CENA BEZ PVN (EUR)', style: 'thdr', alignment: 'right' },
        { text: 'SUMMA', style: 'thdr', alignment: 'right' },
      ]
    ];

    let grandTotal = 0;

    if (isTelpa) {
      const total = rides.total + drinks.reduce((sum, d) => sum + d.qty * d.price, 0);
      const net = total / 1.21;
      tableBody.push([
        'Telpu noma',
        { text: '1', alignment: 'center' },
        { text: net.toFixed(2), alignment: 'right' },
        { text: net.toFixed(2), alignment: 'right' },
      ]);
      grandTotal = total;
    } else {
      if (rides.total > 0) {
        const rNet = rides.total / 1.21;
        tableBody.push([
          'Braucieni',
          { text: String(rides.qty), alignment: 'center' },
          { text: (rides.price / 1.21).toFixed(2), alignment: 'right' },
          { text: rNet.toFixed(2), alignment: 'right' },
        ]);
        grandTotal += rides.total;
      }
      drinks.forEach(d => {
        const lineTotal = d.qty * d.price;
        const lineNet = lineTotal / 1.21;
        tableBody.push([
          d.name || '',
          { text: String(d.qty), alignment: 'center' },
          { text: (d.price / 1.21).toFixed(2), alignment: 'right' },
          { text: lineNet.toFixed(2), alignment: 'right' },
        ]);
        grandTotal += lineTotal;
      });
    }

    if (tableBody.length < 3) {
      tableBody.push(['', '', '', '']);
    }

    const netGrand = grandTotal / 1.21;
    const vatGrand = grandTotal - netGrand;

    let logoContent = null;
    try {
      const logoPath = path.join(process.cwd(), 'public', 'da_logo.png');
      if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        logoContent = 'data:image/png;base64,' + logoData.toString('base64');
      }
    } catch (e) { /* nav logo */ }

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#333' },
      styles: {
        thdr: { bold: true, fontSize: 8, color: '#FFFFFF' },
      },
      content: [
        {
          columns: [
            logoContent
              ? { image: logoContent, width: 80 }
              : { text: 'DRIFT ARENA', fontSize: 22, bold: true, color: '#E84D0E' },
            {
              stack: [
                { text: data.invNumber || '', fontSize: 16, bold: true, color: '#333', alignment: 'right' },
                { text: 'Izrakstīts: ' + (data.date || ''), fontSize: 9, color: '#666', alignment: 'right', margin: [0, 4, 0, 0] },
                { text: 'Apmaksas termiņš: ' + (data.dueDate || ''), fontSize: 9, color: '#666', alignment: 'right' },
              ]
            }
          ]
        },
        { text: ' ', fontSize: 8 },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#E84D0E' }] },
        { text: ' ', fontSize: 8 },
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'NOSŪTĪTĀJS', fontSize: 8, bold: true, color: '#999', margin: [0, 0, 0, 4] },
                { text: s.name || '', fontSize: 10, bold: true },
                'PVN Nr: ' + (s.pvn || ''),
                'Reģ. Nr: ' + (s.reg || ''),
                s.addr || '',
                (s.bank || '') + '; ' + (s.swift || ''),
                'Konts: ' + (s.account || ''),
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'SAŅĒMĒJS', fontSize: 8, bold: true, color: '#999', margin: [0, 0, 0, 4] },
                ...recLines.map((l, i) => i === 0 ? { text: l, fontSize: 10, bold: true } : l)
              ]
            }
          ]
        },
        { text: ' ', fontSize: 12 },
        {
          table: {
            headerRows: 1,
            widths: ['*', 70, 110, 80],
            body: tableBody,
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#E84D0E',
            vLineColor: () => '#E84D0E',
            fillColor: (i) => i === 0 ? '#E84D0E' : null,
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          }
        },
        { text: ' ', fontSize: 10 },
        {
          columns: [
            { text: '', width: '*' },
            {
              width: 220,
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5, lineColor: '#E84D0E' }] },
                { text: ' ', fontSize: 4 },
                {
                  columns: [
                    { text: 'Summa bez PVN:', width: 130, fontSize: 10 },
                    { text: netGrand.toFixed(2) + ' EUR', alignment: 'right', fontSize: 10 }
                  ]
                },
                {
                  columns: [
                    { text: 'PVN 21%:', width: 130, fontSize: 10 },
                    { text: vatGrand.toFixed(2) + ' EUR', alignment: 'right', fontSize: 10 }
                  ]
                },
                { text: ' ', fontSize: 6 },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: '#E84D0E' }] },
                { text: ' ', fontSize: 4 },
                {
                  columns: [
                    { text: 'KOPĀ APMAKSAI:', width: 130, fontSize: 13, bold: true, color: '#E84D0E' },
                    { text: grandTotal.toFixed(2) + ' EUR', alignment: 'right', fontSize: 13, bold: true, color: '#E84D0E' }
                  ]
                },
              ]
            }
          ]
        }
      ]
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    return new Promise((resolve) => {
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const pdfBase64 = 'data:application/pdf;base64,' + pdfBuffer.toString('base64');
        resolve(NextResponse.json({ ok: true, pdf: pdfBase64 }));
      });
      pdfDoc.on('error', err => {
        resolve(NextResponse.json({ ok: false, error: err.message }, { status: 500 }));
      });
      pdfDoc.end();
    });

  } catch (e) {
    console.error('Invoice PDF error:', e.message, e.stack);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
