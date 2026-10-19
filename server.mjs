import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  let target = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  fs.readFile(target, (error, data) => {
    if (error) {
      if (!path.extname(target)) {
        fs.readFile(path.join(root, 'index.html'), (fallbackError, fallback) => {
          if (fallbackError) res.writeHead(404).end('Not found');
          else res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-cache' }).end(fallback);
        });
        return;
      }
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  const virtualAdapter = /vmware|virtualbox|vEthernet|hyper-v|loopback|bluetooth|wsl/i;
  const lanAddresses = Object.entries(os.networkInterfaces())
    .filter(([name]) => !virtualAdapter.test(name))
    .flatMap(([name, items]) => (items || []).map((item) => ({ name, item })))
    .filter(({ item }) => item.family === 'IPv4' && !item.internal)
    .map(({ name, item }) => ({ name, address: item.address }))
    .filter(({ address }) => !address.startsWith('169.254.'));

  console.log('');
  console.log('  迹忆 · Trail Memoir 已启动');
  console.log(`  本机：  http://127.0.0.1:${port}`);
  for (const { name, address } of lanAddresses) {
    console.log(`  手机：  http://${address}:${port}   [${name}]`);
  }
  console.log('          （手机与电脑需连接同一个 Wi-Fi）');
  console.log('');
  console.log('  注意：127.0.0.1 在手机上指向手机自己，不能用于访问电脑。');
  console.log('  手机若打不开：允许 Node.js 通过 Windows 防火墙，或查看 README 的「手机访问」章节。');
  console.log('  真实 GPS 记录需要 HTTPS 或 localhost；HTTP 局域网地址只能先查看界面和示例。');
  console.log('');
});
