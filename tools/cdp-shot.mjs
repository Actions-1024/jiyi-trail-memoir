import fs from 'node:fs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg('url', 'http://127.0.0.1:4173/');
const out = arg('out', 'shots/shot.png');
const width = Number(arg('width', '390'));
const height = Number(arg('height', '844'));
const wait = Number(arg('wait', '2500'));
const evalFile = arg('eval-file', '');
const evalScript = evalFile ? fs.readFileSync(evalFile, 'utf8') : arg('eval', '');
const port = Number(arg('port', '9223'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((item) => item.type === 'page');
      if (page) return page;
    } catch {
      // Chrome still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome debugging endpoint not available');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let messageId = 0;
const pending = new Map();
const listeners = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
    return;
  }
  const handlers = listeners.get(message.method) || [];
  handlers.forEach((handler) => handler(message.params));
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitEvent(method, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const handler = (params) => {
      clearTimeout(timer);
      listeners.set(method, (listeners.get(method) || []).filter((h) => h !== handler));
      resolve(params);
    };
    listeners.set(method, [...(listeners.get(method) || []), handler]);
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), timeout);
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: width,
  screenHeight: height,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setGeolocationOverride', {
  latitude: 30.25955,
  longitude: 120.14955,
  accuracy: 8,
});
await send('Browser.grantPermissions', {
  origin: new URL(url).origin,
  permissions: ['geolocation'],
}).catch(() => {});

const loaded = waitEvent('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded.catch(() => {});
await sleep(wait);

if (evalScript) {
  const result = await send('Runtime.evaluate', {
    expression: evalScript,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  console.log('EVAL', JSON.stringify(result.result?.value ?? result.exceptionDetails ?? null));
  await sleep(1200);
}

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
fs.mkdirSync(out.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`SHOT ${out} ${width}x${height}`);

const state = await send('Runtime.evaluate', {
  expression: `JSON.stringify({innerWidth:innerWidth,innerHeight:innerHeight,dpr:devicePixelRatio,route:document.body.dataset.route,hasScreen:!!document.querySelector('.screen'),title:document.title,scrollH:document.querySelector('.screen')?.scrollHeight})`,
  returnByValue: true,
});
console.log('STATE', state.result.value);
ws.close();
