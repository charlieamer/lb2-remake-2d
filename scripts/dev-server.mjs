import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const types = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'], ['.map', 'application/json']]);
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const safePath = normalize(url.pathname).replace(/^\.\.(\/|$)/, '');
  const filePath = join(root, safePath === '/' ? 'index.html' : safePath);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': types.get(extname(filePath)) ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(4173, '0.0.0.0', () => console.log('http://localhost:4173'));
