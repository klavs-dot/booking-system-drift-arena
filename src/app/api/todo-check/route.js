import { NextResponse } from 'next/server';

const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1214033665232695';

export const maxDuration = 15;

export async function GET() {
  if (!ASANA_PAT) {
    return NextResponse.json({ ok: false, todayCount: 0, error: 'ASANA_PAT nav iestatīts' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch(
      `https://app.asana.com/api/1.0/tasks?project=${PROJECT_GID}&opt_fields=name,due_on,completed&limit=100`,
      { headers: { 'Authorization': `Bearer ${ASANA_PAT}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ ok: false, todayCount: 0, error: 'Asana API kļūda: ' + res.status });
    }

    const data = await res.json();
    const tasks = data.data || [];

    // Filtrēt: due_on ir šodien vai agrāk un nav pabeigti
    const todayTasks = tasks.filter(t => !t.completed && t.due_on && t.due_on <= today);

    return NextResponse.json({
      ok: true,
      todayCount: todayTasks.length,
      tasks: todayTasks.map(t => ({ name: t.name, due_on: t.due_on }))
    });
  } catch (e) {
    return NextResponse.json({ ok: false, todayCount: 0, error: e.message });
  }
}
