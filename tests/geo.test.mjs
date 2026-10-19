import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversine,
  totalDistance,
  pointAtFraction,
  routeSlice,
  cumulativeDistances,
  statsFor,
  durationClock,
  paceLabel,
  project,
  unproject,
} from '../js/geo.js';

test('haversine returns a realistic metre distance', () => {
  const d = haversine({ lat: 30, lng: 120 }, { lat: 30.001, lng: 120 });
  assert.ok(d > 110 && d < 112.5, String(d));
});

test('total distance accumulates segment lengths', () => {
  const points = [
    { lat: 30, lng: 120 },
    { lat: 30.001, lng: 120 },
    { lat: 30.001, lng: 120.001 },
  ];
  assert.ok(totalDistance(points) > 200);
  assert.equal(cumulativeDistances(points).length, 3);
});

test('pointAtFraction interpolates the midpoint', () => {
  const points = [
    { lat: 30, lng: 120, t: 0 },
    { lat: 30.002, lng: 120, t: 1000 },
  ];
  const mid = pointAtFraction(points, 0.5);
  assert.ok(Math.abs(mid.lat - 30.001) < 0.00001);
  assert.ok(Math.abs(mid.fraction - 0.5) < 0.00001);
  assert.ok(Number.isFinite(mid.bearing));
});

test('routeSlice ends at the requested fraction', () => {
  const points = [
    { lat: 30, lng: 120 },
    { lat: 30.001, lng: 120 },
    { lat: 30.002, lng: 120 },
    { lat: 30.003, lng: 120 },
  ];
  const slice = routeSlice(points, 0.5);
  assert.ok(slice.length >= 2);
  assert.ok(slice[slice.length - 1].lat < 30.002);
});

test('stats compute distance, duration, pace and elevation gain', () => {
  const points = [
    { lat: 30, lng: 120, alt: 10, t: 0 },
    { lat: 30.001, lng: 120, alt: 20, t: 60_000 },
    { lat: 30.002, lng: 120, alt: 24, t: 120_000 },
  ];
  const stats = statsFor(points, { startedAt: 0, endedAt: 120_000 });
  assert.ok(stats.distance > 200);
  assert.equal(stats.duration, 120);
  assert.ok(stats.pace > 0);
  assert.ok(stats.elevationGain >= 14);
});

test('display formatters are stable', () => {
  assert.equal(durationClock(65), '01:05');
  assert.equal(durationClock(3665), '1:01:05');
  assert.equal(paceLabel(305), '5\'05"');
});

test('web mercator projection round-trips', () => {
  const p = project(30.25, 120.15);
  const q = unproject(p.x, p.y);
  assert.ok(Math.abs(q.lat - 30.25) < 1e-9);
  assert.ok(Math.abs(q.lng - 120.15) < 1e-9);
});
