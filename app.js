const http = require('http');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync('index.html');

const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(index);
});

const PORT = 80;

server.listen(PORT);
