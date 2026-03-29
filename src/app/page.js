import { readFileSync } from 'fs';
import { join } from 'path';

export default function Page() {
  const html = readFileSync(join(process.cwd(), 'public', 'app.html'), 'utf-8');
  const body = html
    .replace(/^[\s\S]*?<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '');
  return <div dangerouslySetInnerHTML={{ __html: body }} />;
}
