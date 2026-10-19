import { getTrip, listTrips } from './db.js';
import { buildDemoTrip } from './demo.js';
import { hydrateTrip } from './media.js';

export const DEMO_ID = 'demo-westlake';

export async function loadTrip(id) {
  if (!id) return null;
  if (id === DEMO_ID) return hydrateTrip(buildDemoTrip());
  const trip = await getTrip(id);
  if (!trip) return null;
  return hydrateTrip(trip);
}

export async function loadTrips() {
  const trips = await listTrips();
  return Promise.all(trips.map((trip) => hydrateTrip(trip)));
}

export async function loadHomeData() {
  const demo = await hydrateTrip(buildDemoTrip());
  const trips = await loadTrips();
  return { demo, trips };
}

export function totalStats(trips) {
  return trips.reduce((acc, trip) => {
    acc.distance += trip.stats?.distance || 0;
    acc.duration += trip.stats?.duration || 0;
    acc.moments += trip.moments?.length || 0;
    return acc;
  }, { distance: 0, duration: 0, moments: 0 });
}
