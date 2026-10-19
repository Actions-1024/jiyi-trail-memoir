import {
  pointAtFraction,
  statsFor,
  haversine,
  totalDistance,
  clamp,
} from './geo.js';

// A hand-drawn approximation of the Bai Causeway / Gushan / Beishan Road loop.
const CONTROL_POINTS = [
  [30.25955, 120.14955],
  [30.25885, 120.14735],
  [30.25815, 120.14515],
  [30.25745, 120.14325],
  [30.25665, 120.14155],
  [30.25585, 120.14025],
  [30.25505, 120.13915],
  [30.25415, 120.13835],
  [30.25315, 120.13775],
  [30.25215, 120.13735],
  [30.25115, 120.13695],
  [30.25045, 120.13565],
  [30.25015, 120.13435],
  [30.25035, 120.13315],
  [30.25115, 120.13235],
  [30.25215, 120.13255],
  [30.25305, 120.13305],
  [30.25385, 120.13385],
  [30.25465, 120.13485],
  [30.25535, 120.13585],
  [30.25595, 120.13705],
  [30.25655, 120.13835],
  [30.25715, 120.13965],
  [30.25775, 120.14095],
  [30.25835, 120.14235],
  [30.25885, 120.14385],
  [30.25925, 120.14535],
  [30.25955, 120.1469],
  [30.25965, 120.14825],
  [30.25955, 120.14955],
];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function densify(controls, steps = 7) {
  const out = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([
        catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      ]);
    }
  }
  out.push(controls[controls.length - 1].slice());
  return out;
}

function todayAt(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function buildDemoTrip() {
  const rng = seeded(20261018);
  const raw = densify(CONTROL_POINTS, 6);
  const startedAt = todayAt(6, 12);
  const avgSpeed = 4.6 * 1000 / 3600; // metres per second
  let distance = 0;
  let previous = null;
  const points = raw.map(([lat, lng], index) => {
    // A tiny cross-track wobble keeps the line from looking machine-perfect.
    const wobble = (rng() - 0.5) * 0.000018;
    const p = {
      lat: lat + wobble * 0.65,
      lng: lng + wobble,
      alt: 11 + Math.sin(index / 13) * 4 + rng() * 1.4,
      accuracy: 4 + rng() * 2,
    };
    if (previous) distance += haversine(previous, p);
    previous = p;
    p.t = startedAt + Math.round((distance / avgSpeed) * 1000) + index * 150;
    return p;
  });

  // Small pauses around the two photo stops make the elapsed time feel lived-in.
  const momentSpecs = [
    {
      progress: 0.075,
      type: 'photo',
      title: '断桥的清晨',
      text: '六点刚过，湖面还盖着一层薄雾。风把桂花香吹到桥上，整座城市像刚刚醒来。',
      mood: '宁静',
      src: 'assets/demo/lake-dawn.jpg',
      thumb: 'assets/demo/lake-dawn.jpg',
    },
    {
      progress: 0.29,
      type: 'note',
      title: '在孤山停一会儿',
      text: '走到孤山脚下，风从荷叶间穿过来。忽然觉得，慢一点也很好。今天不赶路，只赶一场秋天。',
      mood: '松弛',
      src: 'assets/demo/lake-lotus.jpg',
      thumb: 'assets/demo/lake-lotus.jpg',
    },
    {
      progress: 0.56,
      type: 'photo',
      title: '西泠桥的梧桐',
      text: '桥边的梧桐开始泛黄了。光落在湖面上，一片一片，像有人把碎金撒进了水里。',
      mood: '惊喜',
      src: 'assets/demo/lake-autumn.jpg',
      thumb: 'assets/demo/lake-autumn.jpg',
    },
    {
      progress: 0.81,
      type: 'note',
      title: '第 4 公里',
      text: '腿有点酸，心情却很轻。北山街的梧桐一路往前延伸，我想，下次还要在清晨来。',
      mood: '满足',
      src: 'assets/demo/lake-dusk.jpg',
      thumb: 'assets/demo/lake-dusk.jpg',
    },
  ];

  const total = totalDistance(points);
  const moments = momentSpecs.map((spec, i) => {
    const at = pointAtFraction(points, spec.progress);
    const pauseMs = i < 2 ? 3 * 60_000 : 90_000;
    return {
      id: `demo-moment-${i + 1}`,
      ...spec,
      lat: at.lat,
      lng: at.lng,
      t: at.t + pauseMs,
      distance: total * spec.progress,
      createdAt: at.t + pauseMs,
      demo: true,
    };
  });

  const endedAt = points[points.length - 1].t + 4 * 60_000;
  points[points.length - 1].t = endedAt;
  const stats = statsFor(points, {
    startedAt,
    endedAt,
    movingSec: Math.max(1, (endedAt - startedAt) / 1000 - 9 * 60),
  });
  stats.distance = total;

  return {
    id: 'demo-westlake',
    demo: true,
    title: '西湖晨行',
    subtitle: '断桥 · 白堤 · 孤山 · 北山街',
    locationName: '杭州 · 西湖',
    description: '一个人沿着湖走了一圈，把秋天收进了口袋里。',
    activity: '徒步',
    startedAt,
    endedAt,
    points,
    moments,
    stats,
    cover: 'assets/demo/lake-dawn.jpg',
    theme: 'dawn',
    createdAt: endedAt,
    updatedAt: endedAt,
  };
}

export const DEMO_THEME = 'dawn';

// Used by the no-GPS preview mode: returns a point on a nearby loop that the
// record screen can animate, without pretending it is a real GPS reading.
export function demoPositionAt(trip, progress) {
  const p = pointAtFraction(trip.points, clamp(progress, 0, 1));
  return { ...p, accuracy: null, demo: true };
}
