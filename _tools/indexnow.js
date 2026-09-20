#!/usr/bin/env node
/* Ping IndexNow so Bing, Yandex, Seznam and Naver re-crawl within minutes
   instead of days. Run after deploying:  node _tools/indexnow.js
   Pass URLs to submit only those, otherwise it submits everything in sitemap.xml.

   The key is verified by hosting <key>.txt at the site root - that file must
   stay in the repo or every submission is rejected. */
const fs = require('fs'), path = require('path'), https = require('https');
const root = path.join(__dirname, '..');
const HOST = 'www.gccpros.com';

const keyFile = fs.readdirSync(root).find(f => /^[0-9a-f]{8,128}\.txt$/i.test(f));
if (!keyFile) { console.error('No IndexNow key file found in the site root.'); process.exit(1); }
const key = keyFile.replace(/\.txt$/i, '');
const onDisk = fs.readFileSync(path.join(root, keyFile), 'utf8').trim();
if (onDisk !== key) { console.error('Key file contents do not match its filename.'); process.exit(1); }

let urls = process.argv.slice(2);
if (!urls.length) {
  urls = [...fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}
if (!urls.length) { console.error('Nothing to submit.'); process.exit(1); }

const body = JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls });
const req = https.request({
  hostname: 'api.indexnow.org', path: '/indexnow', method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
}, res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const ok = res.statusCode === 200 || res.statusCode === 202;
    console.log(`IndexNow ${res.statusCode} ${ok ? 'accepted' : 'REJECTED'} - ${urls.length} URL(s)`);
    if (d.trim()) console.log(d.trim());
    if (!ok) process.exit(1);
  });
});
req.on('error', e => { console.error('IndexNow request failed:', e.message); process.exit(1); });
req.write(body); req.end();
