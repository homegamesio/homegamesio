const https = require('https');
const http = require('http');
const fs = require('fs');
const config = require('./config');
const path = require('path');

const HTTPS_PORT = 443;
const HTTP_PORT = 80;

const options = {
    key: fs.readFileSync(config.SSL_KEY_PATH),
    cert: fs.readFileSync(config.SSL_CERT_PATH)
};

const PATH_MAP = {
    "/": { 
        path: "index.html",
        contentType: "text/html"
    },
    "/favicon.ico": {
        path: "favicon.ico",
        contentType: "image/x-icon"
    },
    "/assets/apple-badge.png": {
        path: "assets/apple-badge.png",
        contentType: "image/png"
    },
    "/assets/spotify-badge.png": {
        path: "assets/spotify-badge.png",
        contentType: "image/png"
    }
};

const server = https.createServer(options, (req, res) => {
    let requestPath = req.url;

    const queryParamIndex = requestPath.indexOf("?");

    if (queryParamIndex > 0) {
        requestPath = requestPath.substring(0, queryParamIndex);
    }

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
});

server.listen(HTTPS_PORT);

http.createServer((req, res) => {
    res.writeHead(301, {'Location': 'https://' + req.headers['host'] + req.url });
    res.end();
}).listen(HTTP_PORT);

