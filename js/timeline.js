import {
  cumulativeDistances,
  nearestPointIndex,
  pointAtFraction,
  clamp,
  easeInOutCubic,
} from './geo.js';

const INTRO = 3.7;
const OUTRO = 4.4;
const BASE_TRAVEL = 10.5;
const TRAVEL_PER_MOMENT = 0.65;
const HOLD_PHOTO = 3.25;
const HOLD_NOTE = 3.6;

export function momentProgress(points, moment) {
  if (Number.isFinite(moment.progress)) return clamp(moment.progress, 0, 1);
  if (!points?.length) return 0;
  const index = nearestPointIndex(points, moment);
  if (index < 0) return 0;
  const cum = cumulativeDistances(points);
  const total = cum[cum.length - 1];
  return total ? clamp(cum[index] / total, 0, 1) : 0;
}

export function buildTimeline(points, rawMoments = [], options = {}) {
  const moments = rawMoments
    .map((m) => ({ ...m, progress: momentProgress(points, m) }))
    .sort((a, b) => a.progress - b.progress)
    .map((m, i) => ({ ...m, order: i + 1 }));

  const intro = options.intro ?? INTRO;
  const outro = options.outro ?? OUTRO;
  const travelTotal = options.travel
    ?? Math.min(18, BASE_TRAVEL + moments.length * TRAVEL_PER_MOMENT);
  const holds = moments.map((m) => (
    m.type === 'note' ? (options.holdNote ?? HOLD_NOTE) : (options.holdPhoto ?? HOLD_PHOTO)
  ));
  const total = intro + travelTotal + holds.reduce((sum, n) => sum + n, 0) + outro;

  const phases = [];
  let cursor = 0;
  phases.push({ kind: 'intro', start: 0, end: intro, duration: intro, progress: 0 });
  cursor = intro;

  const stops = moments.map((m, i) => ({ moment: m, hold: holds[i] }));
  const segments = [];
  let from = 0;
  for (const stop of stops) {
    segments.push({ from, to: stop.moment.progress, moment: stop.moment, hold: stop.hold });
    from = stop.moment.progress;
  }
  segments.push({ from, to: 1, moment: null, hold: 0 });

  const gaps = segments.map((s) => Math.max(0.015, s.to - s.from));
  const gapTotal = gaps.reduce((sum, g) => sum + g, 0);
  segments.forEach((segment, i) => {
    const travel = travelTotal * (gaps[i] / gapTotal);
    phases.push({
      kind: 'travel',
      start: cursor,
      end: cursor + travel,
      duration: travel,
      from: segment.from,
      to: segment.to,
      moment: segment.moment,
    });
    cursor += travel;
    if (segment.moment) {
      phases.push({
        kind: 'moment',
        start: cursor,
        end: cursor + segment.hold,
        duration: segment.hold,
        progress: segment.moment.progress,
        moment: segment.moment,
      });
      cursor += segment.hold;
    }
  });

  phases.push({
    kind: 'outro',
    start: cursor,
    end: cursor + outro,
    duration: outro,
    progress: 1,
  });

  return {
    phases,
    moments,
    totalDuration: total,
    intro,
    outro,
    travelTotal,
    holdTotal: holds.reduce((sum, n) => sum + n, 0),
  };
}

export function sampleTimeline(timeline, time) {
  const t = clamp(time, 0, timeline.totalDuration);
  let phase = timeline.phases[0];
  for (const candidate of timeline.phases) {
    if (t >= candidate.start && t < candidate.end) {
      phase = candidate;
      break;
    }
    if (t >= candidate.end) phase = candidate;
  }
  const local = clamp(t - phase.start, 0, phase.duration);
  const u = phase.duration > 0 ? local / phase.duration : 1;
  let progress = phase.progress ?? 0;
  if (phase.kind === 'travel') {
    progress = phase.from + (phase.to - phase.from) * u;
  }
  return {
    time: t,
    phase,
    local,
    u,
    progress,
    moment: phase.moment ?? null,
  };
}

export function describeMomentWindow(timeline, index) {
  const moment = timeline.moments[index];
  if (!moment) return null;
  const phase = timeline.phases.find((p) => p.kind === 'moment' && p.moment.id === moment.id);
  if (!phase) return null;
  return { start: phase.start, end: phase.end, moment };
}

export function timelineSnapshot(timeline, time, points) {
  const snap = sampleTimeline(timeline, time);
  snap.position = pointAtFraction(points, snap.progress);
  if (snap.phase.kind === 'intro') snap.phaseProgress = easeInOutCubic(snap.u);
  return snap;
}

export function formatTimelineDuration(seconds) {
  return `${Math.ceil(seconds)} 秒`;
}
