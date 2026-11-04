import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('app/src/main/assets/www');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url || '/', `http://127.0.0.1:${PORT}`);
        const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const path = normalize(join(ROOT, relative));
        if (!path.startsWith(ROOT)) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }
        const body = await readFile(path);
        response.writeHead(200, {
            'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        response.end(body);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Nilx Drive preview: http://127.0.0.1:${PORT}/index.html`);
});
