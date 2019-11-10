const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    const index = fs.readFileSync('index.html');
    res.setHeader('Content-Type', 'text/html');
    res.end(index);
});

const PORT = 80;

server.listen(PORT);
