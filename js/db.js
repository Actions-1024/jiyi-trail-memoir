const DB_NAME = 'jiyi-trail-db';
const DB_VERSION = 1;

let dbPromise = null;
const memory = {
  trips: new Map(),
  media: new Map(),
  exports: new Map(),
  settings: new Map(),
};
let useMemory = false;

function openDB() {
  if (useMemory) return Promise.reject(new Error('memory mode'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    // Some private/embedded browsers advertise IndexedDB but never deliver the
    // open event. Fall back to an in-memory store instead of blocking the UI.
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), 2200);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('media')) {
        const media = db.createObjectStore('media', { keyPath: 'id' });
        media.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('exports')) {
        const exports = db.createObjectStore('exports', { keyPath: 'id' });
        exports.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error || new Error('Could not open database'));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('Database is blocked by another tab'));
    };
  }).catch((error) => {
    useMemory = true;
    console.warn('IndexedDB unavailable, using this session only.', error);
    return null;
  });
  return dbPromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  if (!db) return null;
  return db.transaction(name, mode).objectStore(name);
}

export async function saveTrip(trip) {
  const db = await openDB();
  if (!db) {
    memory.trips.set(trip.id, structuredClone(trip));
    return trip;
  }
  const tx = db.transaction('trips', 'readwrite');
  tx.objectStore('trips').put(trip);
  await transactionDone(tx);
  return trip;
}

export async function getTrip(id) {
  const db = await openDB();
  if (!db) return memory.trips.get(id) ?? null;
  const tx = db.transaction('trips', 'readonly');
  return requestResult(tx.objectStore('trips').get(id));
}

export async function listTrips() {
  const db = await openDB();
  if (!db) {
    return [...memory.trips.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const tx = db.transaction('trips', 'readonly');
  const trips = await requestResult(tx.objectStore('trips').getAll());
  return trips.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function deleteTrip(id) {
  const db = await openDB();
  if (!db) {
    memory.trips.delete(id);
    for (const [key, m] of memory.media) if (m.tripId === id) memory.media.delete(key);
    for (const [key, e] of memory.exports) if (e.tripId === id) memory.exports.delete(key);
    return;
  }
  const tx = db.transaction(['trips', 'media', 'exports'], 'readwrite');
  tx.objectStore('trips').delete(id);
  const mediaStore = tx.objectStore('media');
  const mediaKeys = await requestResult(mediaStore.index('tripId').getAllKeys(id));
  mediaKeys.forEach((key) => mediaStore.delete(key));
  const exportStore = tx.objectStore('exports');
  const exportKeys = await requestResult(exportStore.index('tripId').getAllKeys(id));
  exportKeys.forEach((key) => exportStore.delete(key));
  await transactionDone(tx);
}

export async function putMedia({ id, tripId, blob, thumbBlob, type, width, height, duration, name }) {
  const record = {
    id,
    tripId,
    blob,
    thumbBlob: thumbBlob ?? null,
    type,
    width: width ?? null,
    height: height ?? null,
    duration: duration ?? null,
    name: name ?? '',
    createdAt: Date.now(),
  };
  const db = await openDB();
  if (!db) {
    memory.media.set(id, record);
    return record;
  }
  const tx = db.transaction('media', 'readwrite');
  tx.objectStore('media').put(record);
  await transactionDone(tx);
  return record;
}

export async function getMedia(id) {
  const db = await openDB();
  if (!db) return memory.media.get(id) ?? null;
  const tx = db.transaction('media', 'readonly');
  return requestResult(tx.objectStore('media').get(id));
}

export async function deleteMedia(id) {
  const db = await openDB();
  if (!db) {
    memory.media.delete(id);
    return;
  }
  const tx = db.transaction('media', 'readwrite');
  tx.objectStore('media').delete(id);
  await transactionDone(tx);
}

export async function saveExport(record) {
  const db = await openDB();
  if (!db) {
    memory.exports.set(record.id, record);
    return record;
  }
  const tx = db.transaction('exports', 'readwrite');
  tx.objectStore('exports').put(record);
  await transactionDone(tx);
  return record;
}

export async function getLatestExport(tripId) {
  const db = await openDB();
  if (!db) {
    return [...memory.exports.values()]
      .filter((e) => e.tripId === tripId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  }
  const tx = db.transaction('exports', 'readonly');
  const records = await requestResult(tx.objectStore('exports').index('tripId').getAll(tripId));
  return records.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

export async function deleteExport(id) {
  const db = await openDB();
  if (!db) {
    memory.exports.delete(id);
    return;
  }
  const tx = db.transaction('exports', 'readwrite');
  tx.objectStore('exports').delete(id);
  await transactionDone(tx);
}

export async function getSetting(key, fallback = null) {
  const db = await openDB();
  if (!db) {
    const item = memory.settings.get(key);
    return item ? item.value : fallback;
  }
  const tx = db.transaction('settings', 'readonly');
  const item = await requestResult(tx.objectStore('settings').get(key));
  return item ? item.value : fallback;
}

export async function setSetting(key, value) {
  const db = await openDB();
  if (!db) {
    memory.settings.set(key, { key, value });
    return;
  }
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key, value });
  await transactionDone(tx);
}

export async function clearAllData() {
  const db = await openDB();
  if (!db) {
    memory.trips.clear();
    memory.media.clear();
    memory.exports.clear();
    memory.settings.clear();
    return;
  }
  const tx = db.transaction(['trips', 'media', 'exports', 'settings'], 'readwrite');
  tx.objectStore('trips').clear();
  tx.objectStore('media').clear();
  tx.objectStore('exports').clear();
  tx.objectStore('settings').clear();
  await transactionDone(tx);
}

export async function storageInfo() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
