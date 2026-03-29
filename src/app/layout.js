import { readFileSync } from 'fs';
import { join } from 'path';

export const metadata = {
  title: 'Drift Arena — Rezervācijas',
}

export default function RootLayout({ children }) {
  let headHtml = '';
  try {
    headHtml = readFileSync(join(process.cwd(), 'public', 'head.html'), 'utf-8');
  } catch(e) {}

  return (
    <html lang="lv">
      <head dangerouslySetInnerHTML={{ __html: headHtml }} />
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
