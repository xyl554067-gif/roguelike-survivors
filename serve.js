#!/usr/bin/env node
/* 零依赖静态服务器：node serve.js [port] */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/index.html';
  const target = path.join(ROOT, path.normalize(pathname));
  // 防目录穿越
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(target, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`\n  夜刃求生 · 开发服务器已启动`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
  console.log(`  按 Ctrl+C 停止\n`);
});
