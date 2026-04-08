import { jsPDF } from 'jspdf';
import { NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const data = await req.json();
    const doc = new jsPDF('p', 'mm', 'a4');
    const W = 210, M = 15;
    let y = 15;

    // Logo text
    doc.setFontSize(24); doc.setFont('helvetica','bold');
    doc.setTextColor(232,77,14); doc.text('DRIFT ARENA', M, y+8);
    doc.setFontSize(8); doc.setTextColor(100);
    doc.text('WOLFTRIKE', M, y+14);

    // Invoice number
    doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.setTextColor(40); doc.text(data.invNumber || '', W-M, y+8, {align:'right'});
    y += 22;

    // Dates
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80);
    doc.text('Izrakstits: '+(data.date||''), W-M, y, {align:'right'}); y+=5;
    doc.text('Apmaksas termins: '+(data.dueDate||''), W-M, y, {align:'right'}); y+=10;

    // Separator
    doc.setDrawColor(232,77,14); doc.setLineWidth(0.5);
    doc.line(M, y, W-M, y); y+=6;

    // Sender / Receiver headers
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(40);
    doc.text('NOSUTITAJS', M, y);
    doc.text('SANEMEJS', W/2+5, y); y+=5;

    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60);
    const s = data.sender || {};
    const sLines = [
      s.name||'', 'PVN Nr: '+(s.pvn||''), 'Reg. Nr: '+(s.reg||''),
      s.addr||'', (s.bank||'')+'; '+(s.swift||''), 'Konts: '+(s.account||'')
    ];
    const yStart = y;
    sLines.forEach(l => { doc.text(l, M, y); y+=4; });

    // Receiver
    y = yStart;
    const rek = data.rek || {};
    const rLines = [];
    if (rek.name) rLines.push(rek.name);
    if (rek.reg) rLines.push('Reg. Nr: '+rek.reg);
    if (rek.pvn) rLines.push('PVN Nr: '+rek.pvn);
    if (rek.addr) rLines.push(rek.addr);
    if (!rLines.length) rLines.push(data.client || '');
    rLines.forEach(l => { doc.text(l, W/2+5, y); y+=4; });
    y = Math.max(yStart + sLines.length*4, yStart + rLines.length*4) + 8;

    // Table header
    doc.setFillColor(232,77,14); doc.rect(M, y, W-2*M, 8, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(255);
    doc.text('NOSAUKUMS', M+3, y+5.5);
    doc.text('DAUDZ.', 115, y+5.5);
    doc.text('CENA BEZ PVN (EUR)', 135, y+5.5);
    doc.text('SUMMA (EUR)', W-M-3, y+5.5, {align:'right'});
    y += 10;

    let grandTotal = 0;
    doc.setFont('helvetica','normal'); doc.setTextColor(40); doc.setFontSize(9);

    const rides = data.rides || {qty:0, price:0, total:0};
    const drinks = data.drinks || [];
    const isTelpa = data.isTelpa;

    if (isTelpa) {
      const total = rides.total + drinks.reduce((s,d) => s + d.qty*d.price, 0);
      const net = total / 1.21;
      doc.setDrawColor(200); doc.rect(M, y-1, W-2*M, 7, 'S');
      doc.text('Telpu noma', M+3, y+4);
      doc.text('1', 120, y+4);
      doc.text(net.toFixed(2), 155, y+4, {align:'right'});
      doc.text(net.toFixed(2), W-M-3, y+4, {align:'right'});
      y += 8; grandTotal = total;
    } else {
      if (rides.total > 0) {
        const rNet = rides.total / 1.21;
        doc.setDrawColor(200); doc.rect(M, y-1, W-2*M, 7, 'S');
        doc.text('Braucieni', M+3, y+4);
        doc.text(String(rides.qty), 120, y+4);
        doc.text((rides.price/1.21).toFixed(2), 155, y+4, {align:'right'});
        doc.text(rNet.toFixed(2), W-M-3, y+4, {align:'right'});
        y += 8; grandTotal += rides.total;
      }
      drinks.forEach(d => {
        const lineTotal = d.qty * d.price;
        const lineNet = lineTotal / 1.21;
        doc.setDrawColor(200); doc.rect(M, y-1, W-2*M, 7, 'S');
        doc.text(d.name || '', M+3, y+4);
        doc.text(String(d.qty), 120, y+4);
        doc.text((d.price/1.21).toFixed(2), 155, y+4, {align:'right'});
        doc.text(lineNet.toFixed(2), W-M-3, y+4, {align:'right'});
        y += 8; grandTotal += lineTotal;
      });
    }

    y += 4;
    const netGrand = grandTotal / 1.21;
    const vatGrand = grandTotal - netGrand;

    // Totals
    doc.setDrawColor(232,77,14); doc.line(120, y, W-M, y); y+=6;
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('Summa bez PVN:', 120, y); doc.text(netGrand.toFixed(2)+' EUR', W-M-3, y, {align:'right'}); y+=5;
    doc.text('PVN 21%:', 120, y); doc.text(vatGrand.toFixed(2)+' EUR', W-M-3, y, {align:'right'}); y+=5;
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(232,77,14);
    doc.text('KOPA APMAKSAI:', 120, y+1); doc.text(grandTotal.toFixed(2)+' EUR', W-M-3, y+1, {align:'right'});

    // Output as base64
    const pdfBase64 = doc.output('datauristring');

    return NextResponse.json({ ok: true, pdf: pdfBase64 });
  } catch (e) {
    console.error('Invoice PDF error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
