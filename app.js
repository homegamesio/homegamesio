const https = require('https');
const http = require('http');
const fs = require('fs');
const config = require('./config');

const options = {
  key: fs.readFileSync(config.SSL_KEY_PATH),
  cert: fs.readFileSync(config.SSL_CERT_PATH)
};

const server = https.createServer(options, (req, res) => {
    const index = fs.readFileSync('index.html');
    res.setHeader('Content-Type', 'text/html');
    res.end(index);
});

const HTTPS_PORT = 443;

server.listen(HTTPS_PORT);

const HTTP_PORT = 80;

http.createServer((req, res) => {
    res.writeHead(301, {'Location': 'https://' + req.headers['host'] + req.url });
    res.end();
}).listen(HTTP_PORT);
