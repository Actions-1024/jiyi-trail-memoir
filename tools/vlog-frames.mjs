import fs from 'node:fs';

const port = 9223;
const url = 'http://127.0.0.1:4173/#/export/demo-westlake';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page');
      if (page) return page;
    } catch { /* starting */ }
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
let id = 0;
const pending = new Map();
const events = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    return;
  }
  (events.get(msg.method) || []).forEach((fn) => fn(msg.params));
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
function waitEvent(name, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const fn = (params) => {
      clearTimeout(timer);
      events.set(name, (events.get(name) || []).filter((x) => x !== fn));
      resolve(params);
    };
    events.set(name, [...(events.get(name) || []), fn]);
    const timer = setTimeout(() => reject(new Error(`timeout ${name}`)), timeout);
  });
}
async function evaluate(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setGeolocationOverride', { latitude: 30.25955, longitude: 120.14955, accuracy: 8 });
await send('Browser.grantPermissions', { origin: 'http://127.0.0.1:4173', permissions: ['geolocation'] }).catch(() => {});
const loaded = waitEvent('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded.catch(() => {});
await sleep(5500);

console.log('starting export');
const result = await evaluate(`(async () => {
  const g = document.querySelector('[data-generate]');
  document.querySelector('[data-music]')?.click();
  g.click();
  const t0 = Date.now();
  while (Date.now() - t0 < 65000) {
    await new Promise(r => setTimeout(r, 1000));
    const v = document.querySelector('.vlog-result__video');
    if (v) {
      if (!Number.isFinite(v.duration)) {
        await new Promise(r => { v.addEventListener('loadedmetadata', r, {once:true}); setTimeout(r, 1500); });
      }
      return { ok: true, ms: Date.now() - t0, duration: v.duration, seekable: v.seekable.length ? v.seekable.end(0) : null, w: v.videoWidth, h: v.videoHeight };
    }
    const e = document.querySelector('.toast--error')?.innerText;
    if (e) return { ok: false, err: e };
  }
  return { ok: false, err: 'timeout' };
})()`);
console.log('export', JSON.stringify(result));
if (!result.ok) process.exit(1);
await sleep(1000);

await evaluate(`(() => {
  const v = document.querySelector('.vlog-result__video');
  v.pause();
  v.controls = false;
  v.style.borderRadius = '0';
  v.style.width = '268px';
  v.style.maxHeight = 'none';
  v.style.aspectRatio = '9 / 16';
  const sheet = v.closest('.sheet');
  if (sheet) { sheet.style.maxHeight = '100%'; sheet.style.height = '100%'; sheet.style.background = '#0b1713'; }
  const header = document.querySelector('.sheet__header'); if (header) header.style.display = 'none';
  const actions = document.querySelector('.vlog-result__actions'); if (actions) actions.style.display = 'none';
  document.querySelector('.vlog-result__regen')?.style.setProperty('display','none');
  document.querySelector('.vlog-result__tip')?.style.setProperty('display','none');
  document.getElementById('toast-root').innerHTML = '';
  return true;
})()`);

fs.mkdirSync('shots/frames', { recursive: true });
const times = [5.5, 12.0, 19.0, 26.0, 32.0];
for (const t of times) {
  const info = await evaluate(`(async () => {
    const v = document.querySelector('.vlog-result__video');
    v.pause();
    if (Math.abs(v.currentTime - ${t}) > 0.05) {
      await new Promise((resolve) => {
        const done = () => resolve();
        v.addEventListener('seeked', done, { once: true });
        v.currentTime = ${t};
        setTimeout(resolve, 2500);
      });
    }
    await new Promise(r => setTimeout(r, 250));
    return { time: v.currentTime, duration: v.duration };
  })()`);
  const rect = await evaluate(`(() => { const v = document.querySelector('.vlog-result__video'); const r = v.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 },
  });
  const file = `shots/frames/moment-${t}.png`;
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('FRAME', file, JSON.stringify(info));
}
ws.close();
