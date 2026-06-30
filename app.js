const http = require('http');
const fs = require('fs');
const path = require('path');

const PATH_MAP = {
    "/": {
        path: "index.html",
        contentType: "text/html"
    },
    "/favicon.ico": {
        path: "favicon.ico",
        contentType: "image/x-icon"
    },
    "/favicon-16x16.png": {
        path: "favicon-16x16.png",
        contentType: "image/png"
    },
     "/favicon-32x32.png": {
        path: "favicon-32x32.png",
        contentType: "image/png"
    },
     "/site.webmanifest": {
        path: "site.webmanifest",
        contentType: "application/manifest+json"
    },
    "/assets/leaflet.js": {
        path: "assets/leaflet.js",
        contentType: "text/javascript"
    },
     "/assets/Leaflet.VectorGrid.bundled.js": {
        path: "assets/Leaflet.VectorGrid.bundled.js",
        contentType: "image/png"
    }, 
    "/assets/apple-badge.png": {
        path: "assets/apple-badge.png",
        contentType: "image/png"
    },
    "/assets/spotify-badge.png": {
        path: "assets/spotify-badge.png",
        contentType: "image/png"
    },
    "/assets/countries.json": {
        path: "assets/countries.json",
        contentType: "application/json"
    },
    "/assets/states.json": {
        path: "assets/states.json",
        contentType: "application/json"
    },
    "/client.js": {
        path: "client.js",
        contentType: "text/javascript"
    },
    "/amateur.ttf": {
        path: "assets/amateur.ttf",
        contentType: "font/ttf"
    },
    "/bundle.js": {
        path: "web/bundle.js",
        contentType: "text/javascript"
    },
    "/client.js": {
        path: "client.js",
        contentType: "text/javascript"
    },
    "/app.css": {
        path: "app.css",
        contentType: "text/css"
    }
};

const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
            let requestPath = req.url;

            const queryParamIndex = requestPath.indexOf("?");

            if (queryParamIndex > 0) {
                requestPath = requestPath.substring(0, queryParamIndex);
            }

            if (req.url.startsWith('/podcast')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'podcast.html'));
                res.end(payload);
            } else if (req.url.startsWith('/map')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'map.html'));
                res.end(payload);
            } else if (req.url.startsWith('/blog')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'blog.html'));
                res.end(payload);
            } else if (req.url.startsWith('/resources')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'resources.html'));
                res.end(payload);
            } else if (req.url.startsWith('/user_guides')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'user_guides.html'));
                res.end(payload);
             } else if (req.url.startsWith('/developer_resources.html')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'developer_resources.html'));
                res.end(payload);
             } else if (req.url.startsWith('/how_it_works')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'how_it_works.html'));
                res.end(payload); 
            } else if (req.url.startsWith('/dev')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                const payload = fs.readFileSync(path.join(__dirname, 'dev.html'));
                res.end(payload);
            } else if (req.url.startsWith('/game')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                const payload = fs.readFileSync(path.join(__dirname, 'game.html'));
                res.end(payload);
            } else if (req.url.startsWith('/self-hosting')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                const payload = fs.readFileSync(path.join(__dirname, 'self-hosting.html'));
                res.end(payload);
            } else if (req.url.startsWith('/catalog')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'catalog.html'));
                res.end(payload);
            } else if (req.url.startsWith('/asset-catalog')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'asset-catalog.html'));
                res.end(payload);
            } else if (req.url.startsWith('/terms')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'terms.html'));
                res.end(payload);
            } else if (req.url.startsWith('/privacy')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'privacy.html'));
                res.end(payload);
            } else if (req.url === '/studio.js') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/javascript');
                const payload = fs.readFileSync(path.join(__dirname, 'studio.js'));
                res.end(payload);
            } else if (req.url === '/socket-worker.js') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/javascript');
                const workerPath = path.join(__dirname, 'node_modules', 'homegames-client', 'src', 'socket-worker.js');
                const payload = fs.readFileSync(workerPath);
                res.end(payload);
            } else if (req.url === '/homegames-client.js') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/javascript');
                const clientPath = path.join(__dirname, 'node_modules', 'homegames-client', 'dist', 'homegames-client.js');
                const payload = fs.readFileSync(clientPath);
                res.end(payload);
            } else if (req.url.startsWith('/view')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'view.html'));
                res.end(payload);
            } else if (req.url.startsWith('/play')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'play.html'));
                res.end(payload);
            } else if (req.url.startsWith('/studio')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'studio.html'));
                res.end(payload);
            } else if (req.url.startsWith('/roadmap')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'roadmap.html'));
                res.end(payload);
            } else if (req.url.startsWith('/about')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'about.html'));
                res.end(payload);
            } else if (req.url === '/reset-password.js') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/javascript');
                const payload = fs.readFileSync(path.join(__dirname, 'reset-password.js'));
                res.end(payload);
            } else if (req.url.startsWith('/reset-password')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'reset-password.html'));
                res.end(payload);
            } else if (req.url.startsWith('/authoring-guide')) {
                // squish.js authoring guide — single source of truth in
                // homegames-common. Served raw so the studio can show/copy it
                // as LLM context.
                try {
                    const docPath = path.join(path.dirname(require.resolve('homegames-common')), 'docs', 'squishjs-game-authoring.md');
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
                    res.end(fs.readFileSync(docPath));
                } catch (e) {
                    res.statusCode = 404;
                    res.end();
                }
            } else if (req.url === '/admin.js') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/javascript');
                const payload = fs.readFileSync(path.join(__dirname, 'admin.js'));
                res.end(payload);
            } else if (req.url.startsWith('/admin')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'admin.html'));
                res.end(payload);
            } else {
                const pathMapping = PATH_MAP[requestPath];
                if (pathMapping) {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", pathMapping.contentType);
                    const payload = fs.readFileSync(path.join(__dirname, pathMapping.path));
                    res.end(payload);
                } else {
                    res.statusCode = 404;
                    res.end();
                }
            }
        
    }
});

server.listen(81);
