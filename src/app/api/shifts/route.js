import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const CALENDAR_ID = '7b244147892dc7548045ddee9b08b17b01e2de283f7c4b007feda17c3915a6b2@group.calendar.google.com';

function getAuth() {
  let credentials = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT nav iestatīts');
  const creds = JSON.parse(credentials);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

export async function GET() {
  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // Šodienas sākums un beigas Rīgas laikā
    const now = new Date();
    const rigaOffset = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Riga' }));
    const startOfDay = new Date(rigaOffset);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(rigaOffset);
    endOfDay.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (res.data.items || []).map(e => ({
      title: e.summary || '',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
    }));

    return NextResponse.json({ ok: true, events });
  } catch (e) {
    console.error('Shifts API error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
