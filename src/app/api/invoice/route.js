import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const data = await req.json();
    const s = data.sender || {};
    const rek = data.rek || {};
    const rides = data.rides || { qty: 0, price: 0, total: 0 };
    const drinks = data.drinks || [];
    const isTelpa = data.isTelpa;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));

    const W = 515; // usable width
    const M = 40;
    let y = 40;

    // --- Logo ---
    try {
      const logoPath = path.join(process.cwd(), 'public', 'da_logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, M, y, { width: 80 });
      }
    } catch (e) {}

    // --- Invoice number ---
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#333')
       .text(data.invNumber || '', M, y + 5, { align: 'right', width: W });
    doc.fontSize(9).font('Helvetica').fillColor('#666')
       .text('Izrakstits: ' + (data.date || ''), M, y + 28, { align: 'right', width: W })
       .text('Apmaksas termins: ' + (data.dueDate || ''), M, y + 40, { align: 'right', width: W });

    y += 60;

    // --- Orange line ---
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor('#E84D0E').lineWidth(1.5).stroke();
    y += 12;

    // --- Sender / Receiver ---
    const colW = W / 2;
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#999')
       .text('NOSUTITAJS', M, y)
       .text('SANEMEJS', M + colW + 10, y);
    y += 12;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333')
       .text(s.name || '', M, y);
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    const sLines = [
      'PVN Nr: ' + (s.pvn || ''), 'Reg. Nr: ' + (s.reg || ''),
      s.addr || '', (s.bank || '') + '; ' + (s.swift || ''),
      'Konts: ' + (s.account || '')
    ];
    let sy = y + 14;
    sLines.forEach(l => { doc.text(l, M, sy); sy += 11; });

    // Receiver
    const recLines = [];
    if (rek.name) recLines.push(rek.name);
    if (rek.reg) recLines.push('Reg. Nr: ' + rek.reg);
    if (rek.pvn) recLines.push('PVN Nr: ' + rek.pvn);
    if (rek.addr) recLines.push(rek.addr);
    if (!recLines.length) recLines.push(data.client || '');

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333')
       .text(recLines[0] || '', M + colW + 10, y);
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    let ry = y + 14;
    recLines.slice(1).forEach(l => { doc.text(l, M + colW + 10, ry); ry += 11; });

    y = Math.max(sy, ry) + 14;

    // --- Table ---
    const cols = [M, M + 240, M + 320, M + 420, M + W];
    const colWidths = [240, 80, 100, W - 420];

    // Header
    doc.rect(M, y, W, 22).fill('#E84D0E');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFF')
       .text('NOSAUKUMS', cols[0] + 6, y + 7)
       .text('DAUDZ. (GAB.)', cols[1] + 4, y + 7)
       .text('CENA BEZ PVN', cols[2] + 4, y + 7)
       .text('SUMMA', cols[3] + 4, y + 7, { width: colWidths[3] - 8, align: 'right' });
    y += 24;

    let grandTotal = 0;
    doc.font('Helvetica').fontSize(9).fillColor('#333');

    function addRow(name, qty, priceWithVat) {
      const lineTotal = qty * priceWithVat;
      const net = lineTotal / 1.21;
      const unitNet = priceWithVat / 1.21;
      doc.rect(M, y - 2, W, 20).strokeColor('#E84D0E').lineWidth(0.3).stroke();
      doc.text(name, cols[0] + 6, y + 3)
         .text(String(qty), cols[1] + 4, y + 3, { width: 70, align: 'center' })
         .text(unitNet.toFixed(2), cols[2] + 4, y + 3, { width: 90, align: 'right' })
         .text(net.toFixed(2), cols[3] + 4, y + 3, { width: colWidths[3] - 8, align: 'right' });
      y += 22;
      grandTotal += lineTotal;
    }

    if (isTelpa) {
      const total = rides.total + drinks.reduce((sum, d) => sum + d.qty * d.price, 0);
      addRow('Telpu noma', 1, total);
    } else {
      if (rides.total > 0) addRow('Braucieni', rides.qty, rides.price);
      drinks.forEach(d => { if (d.price > 0) addRow(d.name || 'Dzeriens', d.qty, d.price); });
    }

    // Empty row if only 1 item
    if (grandTotal > 0) {
      doc.rect(M, y - 2, W, 20).strokeColor('#E84D0E').lineWidth(0.3).stroke();
      y += 22;
    }

    y += 8;

    // --- Totals ---
    const netGrand = grandTotal / 1.21;
    const vatGrand = grandTotal - netGrand;
    const tx = M + 300;

    doc.moveTo(tx, y).lineTo(M + W, y).strokeColor('#E84D0E').lineWidth(0.5).stroke();
    y += 8;

    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('Summa bez PVN:', tx, y);
    doc.text(netGrand.toFixed(2) + ' EUR', tx, y, { width: W - 300, align: 'right' });
    y += 14;
    doc.text('PVN 21%:', tx, y);
    doc.text(vatGrand.toFixed(2) + ' EUR', tx, y, { width: W - 300, align: 'right' });
    y += 6;

    doc.moveTo(tx, y).lineTo(M + W, y).strokeColor('#E84D0E').lineWidth(1).stroke();
    y += 8;

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#E84D0E');
    doc.text('KOPA APMAKSAI:', tx, y);
    doc.text(grandTotal.toFixed(2) + ' EUR', tx, y, { width: W - 300, align: 'right' });

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        const buf = Buffer.concat(chunks);
        const b64 = 'data:application/pdf;base64,' + buf.toString('base64');
        resolve(NextResponse.json({ ok: true, pdf: b64 }));
      });
    });

  } catch (e) {
    console.error('Invoice error:', e.message, e.stack);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
