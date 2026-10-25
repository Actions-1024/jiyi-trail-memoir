import {
  project,
  unproject,
  pointAtFraction,
  routeSlice,
  boundsOf,
  clamp,
} from './geo.js';
import { getTheme } from './themes.js';

const TILE_SIZE = 256;

// A deliberately hand-drawn approximation of the West Lake basin. The demo
// route is real GPS-shaped data; this backdrop is illustrative, not a survey.
const WEST_LAKE = [
  [30.2607, 120.1490], [30.2601, 120.1510], [30.2587, 120.1524], [30.2567, 120.1530],
  [30.2543, 120.1527], [30.2520, 120.1533], [30.2493, 120.1542], [30.2463, 120.1532],
  [30.2435, 120.1515], [30.2407, 120.1505], [30.2380, 120.1490], [30.2350, 120.1470],
  [30.2318, 120.1444], [30.2310, 120.1412], [30.2322, 120.1382], [30.2342, 120.1355],
  [30.2365, 120.1322], [30.2395, 120.1297], [30.2430, 120.1277], [30.2462, 120.1284],
  [30.2490, 120.1303], [30.2515, 120.1322], [30.2534, 120.1342], [30.2552, 120.1372],
  [30.2572, 120.1403], [30.2588, 120.1437], [30.2599, 120.1465], [30.2607, 120.1490],
];

const GUSHAN = [
  [30.2554, 120.1414], [30.2552, 120.1398], [30.2544, 120.1385], [30.2532, 120.1377],
  [30.2520, 120.1378], [30.2513, 120.1388], [30.2518, 120.1400], [30.2528, 120.1410],
  [30.2540, 120.1417], [30.2554, 120.1414],
];

const XIAOYINGZHOU = [
  [30.2402, 120.1442], [30.2396, 120.1452], [30.2387, 120.1451], [30.2382, 120.1442],
  [30.2387, 120.1432], [30.2397, 120.1431], [30.2402, 120.1442],
];

const HUXINTING = [
  [30.2460, 120.1463], [30.2456, 120.1470], [30.2450, 120.1469], [30.2448, 120.1463],
  [30.2452, 120.1457], [30.2458, 120.1458], [30.2460, 120.1463],
];

const PARKS = [
  [
    [30.2598, 120.1260], [30.2560, 120.1250], [30.2520, 120.1270], [30.2495, 120.1300],
    [30.2470, 120.1290], [30.2440, 120.1265], [30.2400, 120.1290], [30.2365, 120.1340],
    [30.2345, 120.1390], [30.2360, 120.1450], [30.2400, 120.1510], [30.2465, 120.1560],
    [30.2540, 120.1580], [30.2590, 120.1560], [30.2630, 120.1510], [30.2640, 120.1400],
    [30.2630, 120.1300], [30.2598, 120.1260],
  ],
  [
    [30.2522, 120.1333], [30.2505, 120.1323], [30.2488, 120.1320], [30.2470, 120.1326],
    [30.2455, 120.1342], [30.2448, 120.1368], [30.2458, 120.1378], [30.2478, 120.1370],
    [30.2492, 120.1352], [30.2510, 120.1342], [30.2522, 120.1333],
  ],
];

const CAUSEWAYS = [
  {
    name: '白堤',
    points: [[30.2596, 120.1496], [30.2585, 120.1463], [30.2572, 120.1432], [30.2558, 120.1410]],
  },
  {
    name: '苏堤',
    points: [[30.2472, 120.1450], [30.2445, 120.1427], [30.2417, 120.1401], [30.2387, 120.1380], [30.2357, 120.1365]],
  },
  {
    name: '杨公堤',
    points: [[30.2530, 120.1326], [30.2495, 120.1321], [30.2455, 120.1328], [30.2412, 120.1342], [30.2363, 120.1362]],
  },
];

const ROADS = [
  {
    name: '北山街',
    major: true,
    points: [
      [30.2618, 120.1530], [30.2612, 120.1480], [30.2606, 120.1430], [30.2601, 120.1380],
      [30.2598, 120.1328], [30.2602, 120.1278], [30.2592, 120.1225],
    ],
  },
  {
    name: '湖滨路',
    major: true,
    points: [
      [30.2598, 120.1550], [30.2560, 120.1558], [30.2520, 120.1560], [30.2480, 120.1558],
      [30.2445, 120.1550], [30.2410, 120.1534], [30.2378, 120.1514],
    ],
  },
  {
    name: '南山路',
    major: true,
    points: [
      [30.2378, 120.1514], [30.2348, 120.1500], [30.2320, 120.1480], [30.2300, 120.1450],
      [30.2288, 120.1410], [30.2285, 120.1360], [30.2300, 120.1310],
    ],
  },
  {
    name: '杨公堤路',
    major: false,
    points: [
      [30.2544, 120.1323], [30.2508, 120.1316], [30.2468, 120.1322], [30.2428, 120.1333],
      [30.2388, 120.1348], [30.2358, 120.1365],
    ],
  },
  {
    name: '灵隐路',
    major: false,
    points: [
      [30.2602, 120.1278], [30.2570, 120.1240], [30.2530, 120.1205], [30.2470, 120.1175],
    ],
  },
];

const LABELS = [
  { text: '西 湖', lat: 30.2444, lng: 120.1420, size: 22, serif: true, alpha: 0.65 },
  { text: '孤山', lat: 30.2530, lng: 120.1392, size: 10, alpha: 0.72 },
  { text: '白堤', lat: 30.2581, lng: 120.1456, size: 10, rotate: -30, alpha: 0.62 },
  { text: '苏堤', lat: 30.2412, lng: 120.1400, size: 10, rotate: -42, alpha: 0.62 },
  { text: '北山街', lat: 30.2608, lng: 120.1348, size: 10, alpha: 0.58 },
  { text: '断桥', lat: 30.2599, lng: 120.1502, size: 10, alpha: 0.68 },
  { text: '西泠桥', lat: 30.2504, lng: 120.1348, size: 10, alpha: 0.62 },
  { text: '曲院风荷', lat: 30.2510, lng: 120.1328, size: 9, alpha: 0.55 },
  { text: '花港观鱼', lat: 30.2368, lng: 120.1424, size: 9, alpha: 0.55 },
  { text: '雷峰塔', lat: 30.2318, lng: 120.1488, size: 9, alpha: 0.58 },
  { text: '湖滨', lat: 30.2506, lng: 120.1547, size: 10, alpha: 0.58 },
];

const tileCache = new Map();
const DEMO_BOUNDS = { minLat: 30.219, maxLat: 30.274, minLng: 120.112, maxLng: 120.169 };

function tileKey(z, x, y) {
  return `${z}/${x}/${y}`;
}

function getTile(z, x, y, themeId, basemap = 'streets') {
  const key = `${basemap}:${themeId}:${tileKey(z, x, y)}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const entry = { image: null, status: 'loading' };
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  const style = themeId === 'night' ? 'dark_all' : 'light_all';
  image.onload = () => {
    entry.status = 'ready';
    entry.image = image;
    tileCache.set(key, entry);
    if (entry.onReady) entry.onReady();
  };
  image.onerror = () => {
    entry.status = 'error';
    tileCache.set(key, entry);
  };
  image.src = basemap === 'satellite'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    : `https://a.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`;
  tileCache.set(key, entry);
  return entry;
}

function clampZoom(z) {
  return clamp(z, 3, 18.5);
}

export class TrailMap {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.options = options;
    this.theme = getTheme(options.theme || 'dawn');
    this.palette = this.theme.map;
    this.interactive = options.interactive ?? false;
    this.resizeObserver = null;
    this.width = 0;
    this.height = 0;
    this.dpr = options.pixelRatio || (options.fixedSize ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.center = { lat: 30.259, lng: 120.142 };
    this.zoom = 15.4;
    this.route = [];
    this.progress = options.progress ?? 1;
    this.current = null;
    this.moments = [];
    this.follow = options.follow ?? false;
    this.showAttribution = options.attribution ?? true;
    this.attributionInset = options.attributionInset ?? 0;
    this.showChrome = options.chrome ?? true;
    this.showStartEnd = options.startEnd ?? true;
    this.showMoments = options.showMoments ?? true;
    this.basemap = options.basemap || 'sketch';
    this.markerScale = options.markerScale ?? 1;
    this.baseView = null;
    this._imageCache = new Map();
    this._tileRepaint = false;
    this._raf = null;
    this._destroyed = false;
    this._pointers = new Map();
    this._gesture = null;
    this._grain = this._makeGrain();
    this._lastFrame = 0;

    if (options.fixedSize) {
      this.width = options.fixedSize.width;
      this.height = options.fixedSize.height;
      canvas.width = this.width * this.dpr;
      canvas.height = this.height * this.dpr;
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    } else {
      this.resize();
      if (options.observe !== false && 'ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement || canvas);
      }
    }

    if (this.interactive) this._bindInput();
  }

  _makeGrain() {
    const size = 140;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(size, size);
    let seed = 77;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) >> 0;
      const v = (seed >>> 16) & 255;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = v > 215 ? 22 : 0;
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  resize() {
    if (this.options.fixedSize || !this.canvas.isConnected) return;
    const parent = this.canvas.parentElement;
    const width = Math.max(1, Math.round(parent?.clientWidth || this.canvas.clientWidth || 360));
    const height = Math.max(1, Math.round(parent?.clientHeight || this.canvas.clientHeight || 640));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.requestDraw();
  }

  setTheme(themeId) {
    this.theme = getTheme(themeId);
    this.palette = this.theme.map;
    this.requestDraw();
  }

  setBasemap(mode) {
    this.basemap = mode;
    this._tilesPainted = 0;
    this.requestDraw();
  }

  setRoute(points, options = {}) {
    this.route = points || [];
    if (options.moments) this.setMoments(options.moments);
    if (options.progress != null) this.progress = options.progress;
    if (options.fit) this.fitToRoute(this.route, options.padding);
    this.requestDraw();
  }

  setProgress(progress) {
    this.progress = clamp(progress, 0, 1);
    this.requestDraw();
    return this.progress;
  }

  setCurrent(position) {
    this.current = position;
    if (this.follow && position) this.center = { lat: position.lat, lng: position.lng };
    this.requestDraw();
  }

  setMoments(moments) {
    this.moments = moments || [];
    for (const moment of this.moments) {
      const src = moment.thumbUrl || moment.thumb || moment.src;
      if (!src || this._imageCache.has(src)) continue;
      const image = new Image();
      image.onload = () => this.requestDraw();
      image.src = src;
      this._imageCache.set(src, image);
    }
    this.requestDraw();
  }

  setFollow(follow) {
    this.follow = follow;
    if (follow && this.current) this.center = { lat: this.current.lat, lng: this.current.lng };
    this.requestDraw();
  }

  setCamera(center, zoom) {
    if (center) this.center = { lat: center.lat, lng: center.lng };
    if (zoom != null) this.zoom = clampZoom(zoom);
    this.requestDraw();
  }

  zoomBy(delta, anchor) {
    const point = anchor || { x: this.width / 2, y: this.height / 2 };
    const before = this.screenToLatLng(point.x, point.y);
    this.zoom = clampZoom(this.zoom + delta);
    const world = project(before.lat, before.lng);
    const scale = TILE_SIZE * Math.pow(2, this.zoom);
    this.center = unproject(
      world.x - (point.x - this.width / 2) / scale,
      world.y - (point.y - this.height / 2) / scale,
    );
    this.follow = false;
    this.requestDraw();
  }

  fitToRoute(points = this.route, padding = { top: 80, right: 28, bottom: 90, left: 28 }) {
    if (!points?.length) return;
    this.route = points;
    const projected = points.map((p) => project(p.lat, p.lng));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of projected) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const dx = Math.max(maxX - minX, 0.0000025);
    const dy = Math.max(maxY - minY, 0.0000025);
    const availW = Math.max(60, this.width - padding.left - padding.right);
    const availH = Math.max(60, this.height - padding.top - padding.bottom);
    const z = Math.log2(Math.min(availW / (dx * TILE_SIZE), availH / (dy * TILE_SIZE)));
    this.zoom = clampZoom(Math.min(z, 17.6));
    const scale = TILE_SIZE * Math.pow(2, this.zoom);
    const desiredX = padding.left + availW / 2;
    const desiredY = padding.top + availH / 2;
    const centerX = (minX + maxX) / 2 + (this.width / 2 - desiredX) / scale;
    const centerY = (minY + maxY) / 2 + (this.height / 2 - desiredY) / scale;
    this.center = unproject(centerX, centerY);
    this.baseView = { center: { ...this.center }, zoom: this.zoom };
    this.follow = false;
    this.requestDraw();
  }

  screenToLatLng(x, y) {
    const scale = TILE_SIZE * Math.pow(2, this.zoom);
    const centerWorld = project(this.center.lat, this.center.lng);
    return unproject(
      centerWorld.x + (x - this.width / 2) / scale,
      centerWorld.y + (y - this.height / 2) / scale,
    );
  }

  latLngToScreen(lat, lng) {
    const scale = TILE_SIZE * Math.pow(2, this.zoom);
    const p = project(lat, lng);
    const c = project(this.center.lat, this.center.lng);
    return { x: (p.x - c.x) * scale + this.width / 2, y: (p.y - c.y) * scale + this.height / 2 };
  }

  metersPerPixel() {
    return (156543.03392 * Math.cos((this.center.lat * Math.PI) / 180)) / Math.pow(2, this.zoom);
  }

  _bindInput() {
    const canvas = this.canvas;
    this._onPointerDown = (event) => {
      canvas.setPointerCapture?.(event.pointerId);
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._pointers.size === 1) {
        this._gesture = {
          type: 'pan',
          startX: event.clientX,
          startY: event.clientY,
          center: { ...this.center },
        };
      } else if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._gesture = {
          type: 'pinch',
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: this.zoom,
          center: { ...this.center },
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      }
    };
    this._onPointerMove = (event) => {
      if (!this._pointers.has(event.pointerId)) return;
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!this._gesture) return;
      if (this._gesture.type === 'pan' && this._pointers.size === 1) {
        const dx = event.clientX - this._gesture.startX;
        const dy = event.clientY - this._gesture.startY;
        if (Math.abs(dx) + Math.abs(dy) < 2) return;
        const scale = TILE_SIZE * Math.pow(2, this.zoom);
        const world = project(this._gesture.center.lat, this._gesture.center.lng);
        this.center = unproject(world.x - dx / scale, world.y - dy / scale);
        this.follow = false;
        this.options.onInteract?.();
        this.requestDraw();
      } else if (this._gesture.type === 'pinch' && this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const nextZoom = clampZoom(this._gesture.zoom + Math.log2(distance / Math.max(1, this._gesture.distance)));
        this.zoom = nextZoom;
        this.follow = false;
        this.options.onInteract?.();
        this.requestDraw();
      }
    };
    this._onPointerUp = (event) => {
      this._pointers.delete(event.pointerId);
      if (this._pointers.size === 0) this._gesture = null;
      else if (this._pointers.size === 1) {
        const [a] = [...this._pointers.values()];
        this._gesture = { type: 'pan', startX: a.x, startY: a.y, center: { ...this.center } };
      }
    };
    this._onWheel = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.zoomBy(event.deltaY > 0 ? -0.3 : 0.3, anchor);
    };
    this._onDblClick = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.zoomBy(0.7, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('dblclick', this._onDblClick);
  }

  requestDraw() {
    if (this._destroyed) return;
    if (this._raf) return;
    this._raf = requestAnimationFrame((time) => {
      this._raf = null;
      this.draw(time);
    });
  }

  startAnimation() {
    if (this._raf || this._destroyed) return;
    let last = 0;
    const loop = (time) => {
      this._raf = requestAnimationFrame(loop);
      if (time - last < 33) return;
      last = time;
      this.draw(time);
    };
    this._raf = requestAnimationFrame(loop);
    this._animated = true;
  }

  stopAnimation() {
    if (this._animated && this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._animated = false;
  }

  _tracePath(ctx, points, smooth = true) {
    if (!points?.length) return false;
    const screen = points.map((p) => this.latLngToScreen(p.lat, p.lng));
    ctx.beginPath();
    if (!smooth || screen.length < 3) {
      ctx.moveTo(screen[0].x, screen[0].y);
      for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y);
      return true;
    }
    ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length - 1; i++) {
      const midX = (screen[i].x + screen[i + 1].x) / 2;
      const midY = (screen[i].y + screen[i + 1].y) / 2;
      ctx.quadraticCurveTo(screen[i].x, screen[i].y, midX, midY);
    }
    const last = screen[screen.length - 1];
    ctx.lineTo(last.x, last.y);
    return true;
  }

  _pathFromLatLngs(ctx, points, close = false) {
    if (!points?.length) return;
    ctx.beginPath();
    points.forEach(([lat, lng], i) => {
      const p = this.latLngToScreen(lat, lng);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (close) ctx.closePath();
  }

  _viewBounds() {
    const a = this.screenToLatLng(0, 0);
    const b = this.screenToLatLng(this.width, this.height);
    return {
      minLat: Math.min(a.lat, b.lat),
      maxLat: Math.max(a.lat, b.lat),
      minLng: Math.min(a.lng, b.lng),
      maxLng: Math.max(a.lng, b.lng),
    };
  }

  draw(time = performance.now()) {
    if (this._destroyed || !this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.palette.land;
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawContours(ctx);
    const demoVisible = this.zoom > 9 && this._intersects(this._viewBounds(), DEMO_BOUNDS);
    if (demoVisible) this._drawWestLake(ctx);
    if (this.basemap === 'streets' || this.basemap === 'satellite') this._drawTiles(ctx);
    if (this._grain) {
      const pattern = ctx.createPattern(this._grain, 'repeat');
      ctx.save();
      ctx.globalAlpha = this.theme.id === 'night' ? 0.22 : 0.3;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
    this._drawRoutes(ctx);
    this._drawMarkers(ctx, time);
    if (this.showChrome) this._drawChrome(ctx);
    this._drawAttribution(ctx);
  }

  _intersects(a, b) {
    return a.minLat < b.maxLat && a.maxLat > b.minLat && a.minLng < b.maxLng && a.maxLng > b.minLng;
  }

  _drawContours(ctx) {
    const p = this.palette;
    ctx.save();
    ctx.strokeStyle = p.contour;
    ctx.lineWidth = 1;
    const step = 46;
    const phase = ((this.center.lat * 800) % step + this.center.lng * 1200) % 40;
    for (let row = -2; row < this.height / step + 2; row++) {
      const baseY = row * step + phase;
      ctx.beginPath();
      for (let x = -20; x <= this.width + 20; x += 16) {
        const y = baseY
          + Math.sin(x / 168 + row * 0.8) * 9
          + Math.sin(x / 61 + row * 1.7) * 3.2;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawWestLake(ctx) {
    const p = this.palette;
    // Soft green basin first.
    ctx.save();
    for (const park of PARKS) {
      this._pathFromLatLngs(ctx, park, true);
      ctx.fillStyle = p.park;
      ctx.fill();
    }
    // Lake.
    this._pathFromLatLngs(ctx, WEST_LAKE, true);
    const top = this.latLngToScreen(30.263, 120.140);
    const bottom = this.latLngToScreen(30.229, 120.140);
    const gradient = ctx.createLinearGradient(0, top.y, 0, bottom.y);
    gradient.addColorStop(0, p.waterDeep);
    gradient.addColorStop(0.45, p.water);
    gradient.addColorStop(1, p.waterDeep);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = p.waterLine;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Islands.
    for (const island of [GUSHAN, XIAOYINGZHOU, HUXINTING]) {
      this._pathFromLatLngs(ctx, island, true);
      ctx.fillStyle = p.parkDeep;
      ctx.fill();
      ctx.strokeStyle = p.waterLine;
      ctx.stroke();
    }
    // Causeways are thin strips of land across the water.
    for (const causeway of CAUSEWAYS) {
      this._tracePath(ctx, causeway.points.map(([lat, lng]) => ({ lat, lng })));
      ctx.strokeStyle = p.roadEdge;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = p.road;
      ctx.lineWidth = 4.2;
      ctx.stroke();
    }
    // Roads.
    for (const road of ROADS) {
      this._tracePath(ctx, road.points.map(([lat, lng]) => ({ lat, lng })));
      ctx.strokeStyle = p.roadEdge;
      ctx.lineWidth = road.major ? 6.5 : 4.6;
      ctx.stroke();
      ctx.strokeStyle = road.major ? p.roadMajor : p.road;
      ctx.lineWidth = road.major ? 4.2 : 2.8;
      ctx.stroke();
    }
    // Park speckles.
    ctx.fillStyle = p.parkDeep;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.399;
      const radius = 0.0005 + (i % 6) * 0.0011;
      const lat = 30.250 + Math.sin(angle) * radius;
      const lng = 120.131 + Math.cos(angle) * radius * 1.3;
      const s = this.latLngToScreen(lat, lng);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.7 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Labels.
    if (this.options.labels !== false && this.width > 260) {
      for (const label of LABELS) {
        const s = this.latLngToScreen(label.lat, label.lng);
        if (s.x < -80 || s.x > this.width + 80 || s.y < -30 || s.y > this.height + 30) continue;
        ctx.save();
        ctx.translate(s.x, s.y);
        if (label.rotate) ctx.rotate((label.rotate * Math.PI) / 180);
        ctx.font = `${label.serif ? 500 : 400} ${label.size}px ${label.serif ? '"Songti SC", "STSong", serif' : '"PingFang SC", "Microsoft YaHei", sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.labelStrong;
        ctx.globalAlpha = label.alpha ?? 0.6;
        ctx.fillText(label.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _drawTiles(ctx) {
    const z = clamp(Math.round(this.zoom), 3, 18);
    const n = Math.pow(2, z);
    const scale = TILE_SIZE * Math.pow(2, this.zoom);
    const centerWorld = project(this.center.lat, this.center.lng);
    const topLeft = {
      x: centerWorld.x - this.width / 2 / scale,
      y: centerWorld.y - this.height / 2 / scale,
    };
    const x0 = Math.floor(topLeft.x * n);
    const y0 = Math.floor(topLeft.y * n);
    const x1 = Math.floor((topLeft.x + this.width / scale) * n);
    const y1 = Math.floor((topLeft.y + this.height / scale) * n);
    let painted = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const entry = getTile(z, tx, ty, this.theme.id, this.basemap);
        if (entry.status !== 'ready') {
          entry.onReady = () => this.requestDraw();
          continue;
        }
        const px = (tx / n - centerWorld.x) * scale + this.width / 2;
        const py = (ty / n - centerWorld.y) * scale + this.height / 2;
        const size = 256 * Math.pow(2, this.zoom - z) + 0.6;
        ctx.globalAlpha = 0.97;
        ctx.drawImage(entry.image, px, py, size, size);
        painted++;
      }
    }
    this._tilesPainted = painted;
    ctx.globalAlpha = 1;
    if (painted && this.basemap !== 'satellite') {
      ctx.fillStyle = this.theme.id === 'night' ? 'rgba(7, 19, 15, 0.5)' : 'rgba(247, 241, 228, 0.2)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (painted && this.basemap === 'satellite') {
      // Keep route lines legible without washing out the imagery.
      ctx.fillStyle = 'rgba(7, 19, 15, 0.08)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  _drawRoutes(ctx) {
    if (!this.route?.length) return;
    const p = this.palette;
    const soft = this.progress < 0.999
      ? this._tracePath(ctx, this.route)
      : false;
    if (soft) {
      ctx.save();
      ctx.strokeStyle = p.routeSoft;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }
    const slice = routeSlice(this.route, this.progress);
    if (slice.length > 1) {
      this._tracePath(ctx, slice);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = p.routeGlow;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = p.routeGlow;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = this.theme.id === 'night' ? 'rgba(10, 20, 16, 0.8)' : 'rgba(255, 252, 243, 0.96)';
      ctx.lineWidth = 8.5;
      ctx.stroke();
      ctx.strokeStyle = p.route;
      ctx.lineWidth = 4.6;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawMarkers(ctx, time) {
    if (!this.route?.length) return;
    const p = this.palette;
    const start = this.latLngToScreen(this.route[0].lat, this.route[0].lng);
    const endPoint = this.route[this.route.length - 1];
    const end = this.latLngToScreen(endPoint.lat, endPoint.lng);
    if (this.showStartEnd) {
      this._drawTerminal(ctx, start, '起', p.marker, p.markerInk);
      if (this.progress > 0.985) this._drawTerminal(ctx, end, '终', p.markerInk, p.marker);
    }
    const current = this.current || pointAtFraction(this.route, this.progress);
    if (current) {
      const s = this.latLngToScreen(current.lat, current.lng);
      const pulse = 0.5 + 0.5 * Math.sin((time || performance.now()) / 450);
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 13 + pulse * 7, 0, Math.PI * 2);
      ctx.fillStyle = p.routeGlow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6.8, 0, Math.PI * 2);
      ctx.fillStyle = p.marker;
      ctx.fill();
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = this.theme.id === 'night' ? '#0D1914' : '#FFFCF4';
      ctx.stroke();
      if (Number.isFinite(current.bearing)) {
        const rad = ((current.bearing - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(rad) * 16, s.y + Math.sin(rad) * 16);
        ctx.lineTo(s.x + Math.cos(rad + 2.5) * 9, s.y + Math.sin(rad + 2.5) * 9);
        ctx.lineTo(s.x + Math.cos(rad - 2.5) * 9, s.y + Math.sin(rad - 2.5) * 9);
        ctx.closePath();
        ctx.fillStyle = p.marker;
        ctx.fill();
      }
      ctx.restore();
    }
    // User-created moments sit above the moving position so they stay visible
    // even when a photo is taken exactly where the walker is standing.
    if (this.showMoments) {
      for (const moment of this.moments) {
        const s = this.latLngToScreen(moment.lat, moment.lng);
        if (s.x < -50 || s.x > this.width + 50 || s.y < -50 || s.y > this.height + 50) continue;
        this._drawMomentPin(ctx, moment, s);
      }
    }
  }

  _drawTerminal(ctx, s, label, fill, ink) {
    ctx.save();
    ctx.shadowColor = 'rgba(20, 35, 28, 0.2)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.theme.id === 'night' ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.9)';
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = '600 9px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, s.x, s.y + 0.5);
    ctx.restore();
  }

  _drawMomentPin(ctx, moment, s) {
    const p = this.palette;
    const scale = this.markerScale;
    const r = 17 * scale;
    const x = s.x;
    const y = s.y - 18 * scale;
    const src = moment.thumbUrl || moment.thumb || moment.src;
    const image = src ? this._imageCache.get(src) : null;
    ctx.save();
    // Stem and shadow.
    ctx.beginPath();
    ctx.moveTo(x, s.y + 1);
    ctx.lineTo(x - 5.5 * scale, y + r - 4);
    ctx.lineTo(x + 5.5 * scale, y + r - 4);
    ctx.closePath();
    ctx.fillStyle = p.markerInk;
    ctx.fill();
    ctx.shadowColor = 'rgba(18, 33, 26, 0.25)';
    ctx.shadowBlur = 8 * scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.markerInk;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (image?.complete && image.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r - 2.2 * scale, 0, Math.PI * 2);
      ctx.clip();
      const ratio = image.naturalWidth / image.naturalHeight;
      const w = (r * 2) * Math.max(1, ratio);
      const h = (r * 2) * Math.max(1, 1 / ratio);
      ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r - 2.4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = moment.type === 'note' ? p.roadMajor : p.park;
      ctx.fill();
      ctx.fillStyle = p.marker;
      ctx.font = `600 ${11 * scale}px "PingFang SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(moment.type === 'note' ? '记' : '·', x, y + 1);
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = p.route;
    ctx.lineWidth = 2.2 * scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.63, y + r * 0.63, 7.3 * scale, 0, Math.PI * 2);
    ctx.fillStyle = p.route;
    ctx.fill();
    ctx.fillStyle = p.markerInk;
    ctx.font = `600 ${8.5 * scale}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(moment.order ?? ''), x + r * 0.63, y + r * 0.63 + 0.4);
    ctx.restore();
  }

  _drawChrome(ctx) {
    const p = this.palette;
    const mpp = this.metersPerPixel();
    const targetPx = 64;
    const raw = mpp * targetPx;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 5, 10].map((n) => n * pow);
    const dist = candidates.find((d) => d >= raw) || candidates[candidates.length - 1];
    const length = dist / mpp;
    const x = 16;
    const y = this.height - 24;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.theme.id === 'night' ? 'rgba(245,242,230,.8)' : 'rgba(25,37,31,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.lineTo(x + length, y - 4);
    ctx.stroke();
    ctx.font = '500 9px "PingFang SC", sans-serif';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(dist >= 1000 ? `${dist / 1000} km` : `${dist} m`, x, y - 5);
    // Compass.
    ctx.translate(this.width - 22, 26);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(4.5, 4);
    ctx.lineTo(0, 1.7);
    ctx.lineTo(-4.5, 4);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.font = '600 8px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', 0, 6);
    ctx.restore();
  }

  _drawAttribution(ctx) {
    if (!this.showAttribution) return;
    const showingTiles = (this.basemap === 'streets' || this.basemap === 'satellite')
      && (this._tilesPainted ?? 0) > 0;
    const text = showingTiles
      ? (this.basemap === 'satellite'
        ? '© Esri, Maxar, Earthstar Geographics'
        : '© OpenStreetMap · © CARTO')
      : '手绘地图 · 仅作轨迹示意';
    ctx.save();
    ctx.font = '400 8.5px "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.theme.id === 'night' ? 'rgba(235,242,230,.45)' : 'rgba(27,42,34,.42)';
    ctx.fillText(text, this.width - 10, this.height - 7 - this.attributionInset);
    ctx.restore();
  }

  destroy() {
    this._destroyed = true;
    this.stopAnimation();
    this.resizeObserver?.disconnect();
    if (this.interactive) {
      const c = this.canvas;
      c.removeEventListener('pointerdown', this._onPointerDown);
      c.removeEventListener('pointermove', this._onPointerMove);
      c.removeEventListener('pointerup', this._onPointerUp);
      c.removeEventListener('pointercancel', this._onPointerUp);
      c.removeEventListener('wheel', this._onWheel);
      c.removeEventListener('dblclick', this._onDblClick);
    }
    this._imageCache.clear();
  }
}

export function mapPaddingForDetail() {
  return { top: 70, right: 22, bottom: 300, left: 22 };
}

export function routeBounds(points) {
  return boundsOf(points || []);
}
