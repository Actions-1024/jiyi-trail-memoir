import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, sampleTimeline, timelineSnapshot } from '../js/timeline.js';
import { buildDemoTrip } from '../js/demo.js';

test('demo trip has a plausible loop and four moments', () => {
  const trip = buildDemoTrip();
  assert.ok(trip.points.length > 100);
  assert.equal(trip.moments.length, 4);
  assert.ok(trip.stats.distance > 3000, String(trip.stats.distance));
  assert.ok(trip.stats.duration > 45 * 60);
  assert.ok(trip.moments.every((m) => m.progress > 0 && m.progress < 1));
  assert.ok(trip.moments[0].progress < trip.moments[3].progress);
});

test('timeline phases are contiguous and fully cover the duration', () => {
  const trip = buildDemoTrip();
  const timeline = buildTimeline(trip.points, trip.moments);
  assert.ok(timeline.totalDuration > 20);
  assert.equal(timeline.phases[0].kind, 'intro');
  assert.equal(timeline.phases.at(-1).kind, 'outro');
  for (let i = 1; i < timeline.phases.length; i++) {
    assert.ok(Math.abs(timeline.phases[i].start - timeline.phases[i - 1].end) < 1e-6);
  }
  const last = timeline.phases.at(-1);
  assert.ok(Math.abs(last.end - timeline.totalDuration) < 1e-6);
  assert.equal(timeline.phases.filter((p) => p.kind === 'moment').length, 4);
});

test('sampling reports the right phase and monotonic route progress', () => {
  const trip = buildDemoTrip();
  const timeline = buildTimeline(trip.points, trip.moments);
  const intro = sampleTimeline(timeline, 0.1);
  assert.equal(intro.phase.kind, 'intro');
  assert.equal(intro.progress, 0);

  let previous = -1;
  for (let t = 0; t <= timeline.totalDuration; t += 0.25) {
    const snap = timelineSnapshot(timeline, t, trip.points);
    assert.ok(snap.progress >= previous - 1e-9);
    assert.ok(snap.position);
    previous = snap.progress;
  }

  const momentPhase = timeline.phases.find((p) => p.kind === 'moment');
  const momentSnap = sampleTimeline(timeline, momentPhase.start + 0.5);
  assert.equal(momentSnap.phase.kind, 'moment');
  assert.equal(momentSnap.moment.id, momentPhase.moment.id);
  assert.ok(Math.abs(momentSnap.progress - momentPhase.progress) < 1e-9);
});

test('a journey without moments still produces a valid film', () => {
  const trip = buildDemoTrip();
  const timeline = buildTimeline(trip.points, []);
  assert.ok(timeline.totalDuration > 15);
  assert.equal(timeline.phases.filter((p) => p.kind === 'moment').length, 0);
  assert.equal(timeline.phases.filter((p) => p.kind === 'travel').length, 1);
});
