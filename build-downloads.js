const fs = require('fs');
const path = require('path');

// The public deployment serves these objects from S3. This route lets a local
// site exercise the same files, without reading anything outside a build folder.
function serveBuildDownload(req, res, requestPath, directory) {
    if (!requestPath.startsWith('/builds/')) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return true;
    }
    let name;
    try { name = decodeURIComponent(requestPath.slice('/builds/'.length)); } catch (_) { name = ''; }
    const version = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
    const allowed = name === 'manifest.json' || new RegExp(`^homegames(?:-${version})?\\.(zip|dmg)$`).test(name) || new RegExp(`^SHA256SUMS-${version}\\.txt$`).test(name);
    if (!allowed) {
        res.writeHead(404);
        res.end();
        return true;
    }
    const file = path.join(directory, name);
    fs.stat(file, (error, info) => {
        if (error || !info.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('This build is not available on this server.');
            return;
        }
        const contentTypes = { '.json': 'application/json', '.zip': 'application/zip', '.dmg': 'application/x-apple-diskimage', '.txt': 'text/plain; charset=utf-8' };
        const headers = {
            'Content-Type': contentTypes[path.extname(name)],
            'Content-Length': info.size,
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        };
        if (name !== 'manifest.json') headers['Content-Disposition'] = `attachment; filename="${name}"`;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = fs.createReadStream(file);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
    });
    return true;
}

module.exports = serveBuildDownload;
