const EARTH_RADIUS = 6_371_008.8;
const DEG = Math.PI / 180;

export function haversine(a, b) {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a, b) {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

export function project(lat, lng) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(clamped * DEG);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function unproject(x, y) {
  const n = Math.PI - 2 * Math.PI * y;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: x * 360 - 180,
  };
}

export function cumulativeDistances(points) {
  const out = new Array(points.length);
  out[0] = 0;
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + haversine(points[i - 1], points[i]);
  }
  return out;
}

export function totalDistance(points) {
  if (!points || points.length < 2) return 0;
  const cum = cumulativeDistances(points);
  return cum[cum.length - 1];
}

export function pointAtFraction(points, fraction) {
  if (!points?.length) return null;
  if (points.length === 1) return { ...points[0], bearing: 0, fraction: 0 };
  const cum = cumulativeDistances(points);
  const total = cum[cum.length - 1];
  if (total === 0) return { ...points[0], bearing: 0, fraction: 0 };
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid;
    else hi = mid;
  }
  const segment = cum[hi] - cum[lo] || 1;
  const t = Math.max(0, Math.min(1, (target - cum[lo]) / segment));
  const a = points[lo];
  const b = points[hi];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    alt: (a.alt ?? 0) + ((b.alt ?? 0) - (a.alt ?? 0)) * t,
    t: (a.t ?? 0) + ((b.t ?? 0) - (a.t ?? 0)) * t,
    bearing: bearing(a, b),
    index: lo,
    fraction: target / total,
  };
}

export function routeSlice(points, fraction) {
  if (!points?.length) return [];
  if (fraction >= 1) return points.slice();
  const cum = cumulativeDistances(points);
  const total = cum[cum.length - 1];
  if (total === 0) return points.slice(0, Math.max(1, Math.ceil(fraction * points.length)));
  const target = Math.max(0, fraction) * total;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (cum[i] < target) {
      out.push(points[i]);
    } else {
      const segment = cum[i] - cum[i - 1] || 1;
      const t = (target - cum[i - 1]) / segment;
      out.push({
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
        t: (points[i - 1].t ?? 0) + ((points[i].t ?? 0) - (points[i - 1].t ?? 0)) * t,
      });
      break;
    }
  }
  return out;
}

export function nearestPointIndex(points, target) {
  let best = -1;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const d = haversine(p, target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function progressForPosition(points, position) {
  if (!points?.length) return 0;
  const index = nearestPointIndex(points, position);
  if (index < 0) return 0;
  const cum = cumulativeDistances(points);
  return cum[cum.length - 1] ? cum[index] / cum[cum.length - 1] : 0;
}

export function elevationGain(points, threshold = 1.5) {
  let gain = 0;
  let anchor = points?.[0]?.alt;
  if (anchor == null) return 0;
  for (const p of points) {
    if (p.alt == null || !Number.isFinite(p.alt)) continue;
    const diff = p.alt - anchor;
    if (diff > threshold) {
      gain += diff;
      anchor = p.alt;
    } else if (diff < -threshold) {
      anchor = p.alt;
    }
  }
  return Math.max(0, Math.round(gain));
}

export function statsFor(points, meta = {}) {
  const distance = totalDistance(points);
  const startedAt = meta.startedAt ?? points?.[0]?.t ?? Date.now();
  const endedAt = meta.endedAt ?? points?.[points.length - 1]?.t ?? startedAt;
  const duration = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const movingSec = meta.movingSec ?? duration;
  const speed = movingSec > 0 ? (distance / movingSec) * 3.6 : 0;
  const pace = distance > 5 ? movingSec / (distance / 1000) : 0;
  const altitudes = (points || []).map((p) => p.alt).filter(Number.isFinite);
  return {
    distance,
    duration,
    movingSec,
    speed,
    pace,
    elevationGain: elevationGain(points || []),
    minAlt: altitudes.length ? Math.min(...altitudes) : null,
    maxAlt: altitudes.length ? Math.max(...altitudes) : null,
    pointCount: points?.length ?? 0,
    startedAt,
    endedAt,
  };
}

export function boundsOf(points) {
  if (!points?.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function centerOf(points) {
  const b = boundsOf(points);
  if (!b) return null;
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

export function distanceLabel(meters, digits = 2) {
  if (!Number.isFinite(meters)) return '0.00';
  if (meters < 1000) return `${Math.max(0, meters).toFixed(0)} m`;
  return `${(meters / 1000).toFixed(digits)} km`;
}

export function distanceValue(meters) {
  if (meters < 1000) return Math.round(meters).toString();
  return (meters / 1000).toFixed(2);
}

export function distanceUnit(meters) {
  return meters < 1000 ? '米' : '公里';
}

export function durationClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function durationHuman(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

export function paceLabel(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--'--\"";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export function speedLabel(kmh) {
  if (!Number.isFinite(kmh) || kmh <= 0) return '0.0';
  return kmh.toFixed(1);
}

export function formatClock(value) {
  const d = new Date(value);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(value) {
  const d = new Date(value);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateShort(value) {
  const d = new Date(value);
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '.');
}

export function formatWeekday(value) {
  return new Date(value).toLocaleDateString('zh-CN', { weekday: 'long' });
}

export function formatRelativeDate(value) {
  const d = new Date(value);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((start - day) / 86_400_000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff > 1 && diff < 7) return `${diff} 天前`;
  return formatDate(value);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInCubic(t) {
  return t * t * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
