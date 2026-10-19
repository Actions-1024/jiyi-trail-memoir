import './pwa.js';
import { renderHome } from './pages/home.js';
import { renderRecord } from './pages/record.js';
import { renderTrip } from './pages/trip.js';
import { renderExport } from './pages/export.js';
import { renderProfile } from './pages/profile.js';

const routes = [
  { pattern: /^\/?$/, page: renderHome, name: 'home' },
  { pattern: /^\/record\/?$/, page: renderRecord, name: 'record' },
  { pattern: /^\/trip\/([^/]+)\/?$/, page: renderTrip, name: 'trip' },
  { pattern: /^\/export\/([^/]+)\/?$/, page: renderExport, name: 'export' },
  { pattern: /^\/profile\/?$/, page: renderProfile, name: 'profile' },
];

let current = null;
let mounting = false;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function navigate(path, options = {}) {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === next) {
    if (options.force) renderRoute();
    return;
  }
  if (options.replace) history.replaceState(null, '', next);
  else location.hash = next;
}

export function rerender() {
  renderRoute();
}

async function renderRoute() {
  if (mounting) return;
  mounting = true;
  const path = parseHash();
  const match = routes.find((route) => route.pattern.test(path));
  const root = document.getElementById('view');
  if (!match) {
    navigate('/', { replace: true });
    mounting = false;
    return;
  }
  const params = path.match(match.pattern)?.slice(1).map(decodeURIComponent) || [];
  try {
    current?.destroy?.();
    current = null;
    root.className = 'view';
    root.innerHTML = '';
    document.body.dataset.route = match.name;
    const result = await match.page(root, { params, navigate, rerender, path });
    if (result) current = result;
    root.scrollTop = 0;
  } catch (error) {
    console.error(error);
    root.innerHTML = `<div class="fatal-error">
      <span>${'出了点小状况'}</span>
      <h1>这段路暂时走不通</h1>
      <p>${String(error?.message || error)}</p>
      <button class="button button--primary" onclick="location.hash='#/'">回到首页</button>
    </div>`;
  } finally {
    mounting = false;
  }
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) history.replaceState(null, '', '#/');
  renderRoute();
});

window.addEventListener('error', (event) => {
  console.error('Unhandled error', event.error || event.message);
});



// Inside the Android shell assets are already local; a service worker on the
// intercepted appassets origin adds no value and can interfere with updates.
const nativeShell = !!window.JiyiAndroid || location.hostname === 'appassets.androidplatform.net';
if ('serviceWorker' in navigator && !nativeShell && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
