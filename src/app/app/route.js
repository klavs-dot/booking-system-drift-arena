import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'app.html'), 'utf-8');
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
// forced redeploy Sun Mar 29 13:46:59 UTC 2026
