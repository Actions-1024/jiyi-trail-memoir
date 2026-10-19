import fs from 'node:fs';
import { buildDemoTrip } from '../js/demo.js';

const port = 9223;
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
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('EXCEPTION', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    console.log('CONSOLE', msg.params.type, msg.params.args.map((a) => a.value || a.description).join(' '));
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
async function shot(name) {
  const data = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.mkdirSync('shots', { recursive: true });
  fs.writeFileSync(`shots/${name}.png`, Buffer.from(data.data, 'base64'));
  console.log('SHOT', name);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const trip = buildDemoTrip();
const route = [];
for (let i = 0; i < trip.points.length; i += 6) {
  const p = trip.points[i];
  route.push([Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), Number(p.alt?.toFixed?.(1) || 12)]);
}
const mock = `(() => {
  const route = ${JSON.stringify(route)};
  let index = 0;
  const timers = new Set();
  function emit(success) {
    const p = route[Math.min(index, route.length - 1)];
    index++;
    success({
      coords: { latitude: p[0], longitude: p[1], altitude: p[2], accuracy: 5, altitudeAccuracy: 4, heading: null, speed: 1.3 },
      timestamp: Date.now()
    });
  }
  const geo = {
    watchPosition(success, error, options) {
      const timer = setInterval(() => {
        if (index >= route.length) return;
        emit(success);
      }, 650);
      timers.add(timer);
      setTimeout(() => emit(success), 250);
      return timer;
    },
    clearWatch(timer) { clearInterval(timer); timers.delete(timer); },
    getCurrentPosition(success) { setTimeout(() => emit(success), 100); }
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
})()`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: mock });
const loaded = waitEvent('Page.loadEventFired');
await send('Page.navigate', { url: 'http://127.0.0.1:4173/#/record' });
await loaded.catch(() => {});
await sleep(11500);

console.log('STATE', await evaluate(`JSON.stringify({dist:document.querySelector('[data-distance]')?.textContent,time:document.querySelector('[data-time]')?.textContent,photoBadge:document.querySelector('[data-photo-count]')?.textContent,hidden:document.querySelector('[data-photo-count]')?.hidden})`));
await shot('record-route2');

await evaluate(`document.querySelector('[data-photo]').click()`);
await sleep(700);
const photoResult = await evaluate(`(async () => {
  const input = document.querySelector('[data-gallery-input]');
  if (!input) return 'no input';
  const blob = await fetch('/assets/demo/lake-lotus.jpg').then(r => r.blob());
  const file = new File([blob], 'lake.jpg', { type: 'image/jpeg' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'dispatched';
})()`);
console.log('PHOTO INPUT', photoResult);
await sleep(2800);
console.log('PHOTO EDITOR', await evaluate(`!!document.querySelector('.media-editor')`));
await evaluate(`(() => {
  const t = document.querySelector('[data-caption]');
  if (t) t.value = '试拍的一张照片，风从荷叶间吹过。';
  document.querySelector('[data-save]')?.click();
  return true;
})()`);
await sleep(1400);
console.log('MOMENT COUNT', await evaluate(`document.querySelector('[data-photo-count]')?.textContent`));
await shot('record-photo2');

await evaluate(`document.querySelector('[data-note]').click()`);
await sleep(700);
await evaluate(`(() => {
  const t = document.querySelector('[data-note-text]');
  t.value = '走到这里，风很轻。想把这一刻留得久一点。';
  t.dispatchEvent(new Event('input', {bubbles:true}));
  document.querySelector('[data-mood="平静"]')?.click();
  document.querySelector('[data-save-note]')?.click();
  return true;
})()`);
await sleep(1400);
await shot('record-note2');

await evaluate(`document.querySelector('[data-finish]').click()`);
await sleep(900);
await shot('record-finish2');
console.log('FINISH SHEET', await evaluate(`JSON.stringify({title:document.querySelector('[data-title]')?.value, summary:document.querySelector('.finish-summary')?.innerText})`));
await evaluate(`(() => {
  const t = document.querySelector('[data-title]');
  if (t) t.value = '测试徒步';
  document.querySelector('[data-save]')?.click();
  return true;
})()`);
await sleep(3000);
console.log('ROUTE', await evaluate(`document.body.dataset.route`));
console.log('TITLE', await evaluate(`document.querySelector('.trip-title-block h1')?.textContent`));
console.log('MOMENTS', await evaluate(`document.querySelectorAll('.moment-card').length`));
console.log('TOAST', await evaluate(`document.querySelector('.toast')?.innerText`));
await shot('trip-created2');
ws.close();
