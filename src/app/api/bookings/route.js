import { getAllBookings, saveBooking, updateBooking, deleteBooking, setStatus } from '@/lib/sheets';
import { NextResponse } from 'next/server';

// Vercel max timeout
export const maxDuration = 30;

export async function GET() {
  try {
    const bookings = await getAllBookings();
    return NextResponse.json({ ok: true, bookings });
  } catch (e) {
    console.error('GET error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { _action, ...data } = body;

    if (_action === 'save') {
      return NextResponse.json(await saveBooking(data));
    }
    if (_action === 'update') {
      const { id, ...rest } = data;
      return NextResponse.json(await updateBooking(id, rest));
    }
    if (_action === 'delete') {
      return NextResponse.json(await deleteBooking(data.id, data.clientName, data.reason));
    }
    if (_action === 'status') {
      return NextResponse.json(await setStatus(data.id, data.status));
    }
    if (_action === 'occupancy') {
      const bookings = await getAllBookings();
      const result = calcOccupancy(bookings, data.date, data.from, data.to, data.excludeId);
      return NextResponse.json({ ok: true, result });
    }
    if (_action === 'alternatives') {
      const bookings = await getAllBookings();
      const result = calcAlternatives(bookings, data.date, parseInt(data.people), data.excludeId);
      return NextResponse.json({ ok: true, result });
    }
    if (_action === 'workhours') {
      const result = calcWorkHours(data.date);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('POST error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

function toMin(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}
function p2(n) { return String(n).padStart(2,'0'); }

const WORK_HOURS = {
  1:{open:'11:00',close:'22:00'},2:{open:'11:00',close:'22:00'},
  3:{open:'11:00',close:'22:00'},4:{open:'11:00',close:'22:00'},
  5:{open:'11:00',close:'23:00'},6:{open:'10:00',close:'23:00'},
  0:{open:'10:00',close:'22:00'},
};

function calcWorkHours(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dow = new Date(y,m-1,d).getDay();
  return WORK_HOURS[dow] || {open:'11:00',close:'22:00'};
}

function calcOccupancy(bookings, dateStr, from, to, excludeId) {
  const rel = bookings.filter(b =>
    b.date===dateStr && b.status!=='Atcelta' &&
    String(b.id)!==String(excludeId||'') &&
    toMin(b.timeFrom)<toMin(to) && toMin(b.timeTo)>toMin(from)
  );
  if (!rel.length) return 0;
  if (rel.some(b=>b.closed)) return 9999;
  const pts = new Set([toMin(from),toMin(to)]);
  rel.forEach(b=>{pts.add(toMin(b.timeFrom));pts.add(toMin(b.timeTo));});
  const sorted=[...pts].sort((a,b)=>a-b);
  let max=0;
  for(let i=0;i<sorted.length-1;i++){
    const mid=(sorted[i]+sorted[i+1])/2;
    const occ=rel.filter(b=>toMin(b.timeFrom)<=mid&&toMin(b.timeTo)>mid).reduce((s,b)=>s+b.people,0);
    if(occ>max)max=occ;
  }
  return max;
}

function calcAlternatives(bookings, dateStr, neededPeople, excludeId) {
  const CAP=90;
  const wh=calcWorkHours(dateStr);
  const openMin=toMin(wh.open),closeMin=toMin(wh.close);
  const results=[];
  for(let start=openMin;start<=closeMin-60;start+=15){
    const end=start+3*60;
    if(end>closeMin)break;
    const from=p2(Math.floor(start/60))+':'+p2(start%60);
    const to=p2(Math.floor(end/60))+':'+p2(end%60);
    const occ=calcOccupancy(bookings,dateStr,from,to,excludeId);
    if(CAP-occ>=neededPeople){
      results.push({from,to,occupied:occ,free:CAP-occ});
      if(results.length>=6)break;
    }
  }
  return results;
}
