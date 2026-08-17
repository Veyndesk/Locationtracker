// Local dev server for when you don't want to install the Vercel CLI.
// Serves public/ and routes /api/geo to the same handler Vercel runs.
// Note: x-vercel-ip-* headers only exist on Vercel, so the IP card will
// report "unavailable" locally — that is expected.
//
//   node dev-server.js   ->   http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROUTES = {
  '/api/geo': require('./api/geo'),
  '/api/ip': require('./api/ip'),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    const handler = ROUTES[url.pathname];
    if (handler) {
      // Minimal shim for the Express-ish helpers the handlers use.
      res.status = (c) => { res.statusCode = c; return res; };
      res.send = (b) => res.end(b);
      return Promise.resolve(handler(req, res)).catch((e) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(e.message || e) }));
      });
    }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(PUBLIC, rel);

    // Keep path traversal out.
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log('http://localhost:' + PORT));
