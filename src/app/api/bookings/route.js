import { getAllBookings, saveBooking, updateBooking, deleteBooking, setStatus } from '@/lib/sheets';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const bookings = await getAllBookings();
    return NextResponse.json({ ok: true, bookings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body   = await req.json();
    const result = await saveBooking(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const body   = await req.json();
    const { id, status, ...data } = body;
    const result = status
      ? await setStatus(id, status)
      : await updateBooking(id, data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { id } = await req.json();
    const result = await deleteBooking(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
