'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const serveBuildDownload = require('./build-downloads');

// Serve exactly the generated release, so local previews exercise what ships.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp',
    '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
    const raw = req.url.split('?')[0];
    if (serveBuildDownload(req, res, raw, process.env.HOMEGAMES_BUILDS_DIR || path.join(__dirname, 'builds'))) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let requestPath;
    try { requestPath = decodeURIComponent(raw); } catch (_) { res.writeHead(404); res.end(); return; }
    if (!requestPath.startsWith('/') || requestPath.includes('\\') || requestPath.includes('\0') || requestPath.split('/').some(part => part === '..' || part.startsWith('.'))) {
        res.writeHead(404); res.end(); return;
    }
    const root = path.resolve(process.env.HOMEGAMES_SITE_DIR || path.join(__dirname, 'web'));
    if (requestPath === '/') requestPath = '/index.html';
    else if (requestPath === '/authoring-guide') requestPath = '/authoring-guide.md';
    else if (!path.extname(requestPath)) requestPath += '.html';
    const file = path.join(root, requestPath);
    fs.stat(file, (error, info) => {
        if (error || !info.isFile()) {
            fs.readFile(path.join(root, '404.html'), (readError, page) => {
                const body = readError ? Buffer.from('Page not found. Visit /catalog.html to find a game.') : page;
                res.writeHead(404, { 'Content-Type': readError ? 'text/plain; charset=utf-8' : TYPES['.html'], 'Content-Length': body.length });
                res.end(req.method === 'HEAD' ? undefined : body);
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
    });
});
if (require.main === module) server.listen(process.env.PORT || 81);
module.exports = server;
