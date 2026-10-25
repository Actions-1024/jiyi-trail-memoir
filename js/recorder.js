import { haversine } from './geo.js';

const DRAFT_KEY = 'jiyi:active-draft:v1';

function geolocationError(error) {
  const messages = {
    1: '需要位置权限才能记录轨迹。请在浏览器设置中允许定位。',
    2: '暂时没有获取到位置信号，请到开阔处再试。',
    3: '定位超时，请检查 GPS 或网络后重试。',
  };
  return new Error(messages[error?.code] || '定位失败，请稍后重试');
}

export class TrackRecorder {
  constructor(options = {}) {
    this.onLive = options.onLive || (() => {});
    this.onPoint = options.onPoint || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.points = options.points ? [...options.points] : [];
    this.startedAt = options.startedAt ?? null;
    this.pausedMs = options.pausedMs ?? 0;
    this.pausedAt = null;
    this.state = 'idle';
    this.lastRaw = null;
    this.lastPoint = this.points[this.points.length - 1] || null;
    this.watchId = null;
    this.wakeLock = null;
    this.firstFixAt = null;
    this._tick = null;
    this._nativeTimer = null;
    this._nativeTimeout = null;
    this._nativeLastTime = 0;
    this._nativeLastError = '';
    this._backgroundTimer = null;
    this._backgroundLastTime = 0;
    this._backgroundLastError = '';
  }

  _hasNativeLocation() {
    return typeof window !== 'undefined'
      && !!window.JiyiAndroid
      && typeof window.JiyiAndroid.startLocationUpdates === 'function'
      && typeof window.JiyiAndroid.getLocationJson === 'function';
  }

  _hasBackgroundTracking() {
    return typeof window !== 'undefined'
      && !!window.JiyiAndroid
      && typeof window.JiyiAndroid.startBackgroundTracking === 'function'
      && typeof window.JiyiAndroid.getTrackPointsSince === 'function';
  }

  get isRecording() {
    return this.state === 'recording';
  }

  get isPaused() {
    return this.state === 'paused';
  }

  elapsedMs() {
    if (!this.startedAt) return 0;
    const end = this.pausedAt ?? Date.now();
    return Math.max(0, end - this.startedAt - this.pausedMs);
  }

  async start() {
    const hasBackground = this._hasBackgroundTracking();
    if (!hasBackground && !this._hasNativeLocation() && !('geolocation' in navigator)) {
      throw new Error('当前设备不支持定位，请检查系统权限');
    }
    const freshTrack = this.points.length === 0;
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (!this.startedAt) this.startedAt = Date.now();
    this.state = 'locating';
    this.onStatus('locating');
    this.firstFixAt = null;
    await this._requestWakeLock();
    if (hasBackground) this._startBackgroundTracking(freshTrack);
    else if (this._hasNativeLocation()) this._startNativeWatch();
    else this._watch();
    return this;
  }

  _watch() {
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this._handlePosition(position),
      (error) => {
        if (this.state === 'locating') {
          this.onError(geolocationError(error));
          this.onStatus('error');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20_000,
      },
    );
  }

  _startBackgroundTracking(clearExisting) {
    clearInterval(this._backgroundTimer);
    this._backgroundTimer = null;
    this._backgroundLastTime = this.lastPoint?.t || 0;
    this._backgroundLastError = '';
    try {
      window.JiyiAndroid.startBackgroundTracking(!!clearExisting);
    } catch {
      this._startNativeWatch();
      return;
    }
    this._nativeLastError = '';
    this._backgroundTimer = setInterval(() => this._pollBackgroundTracking(), 900);
    this._clearNativeTimeout();
    this._nativeTimeout = setTimeout(() => {
      if (this.state === 'locating' && this.points.length === 0) {
        this.onError(new Error('定位超时，请到开阔处或检查系统 GPS / 网络定位'));
        this.onStatus('error');
      }
    }, 25_000);
    setTimeout(() => this._pollBackgroundTracking(), 250);
  }

  _pollBackgroundTracking() {
    if (!this._hasBackgroundTracking()) return;
    if (this.state === 'paused' || this.state === 'stopped' || this.state === 'idle') return;
    try {
      const bridge = window.JiyiAndroid;
      const error = bridge.getBackgroundLocationError?.() || '';
      if (error) {
        if (error !== this._backgroundLastError) {
          this._backgroundLastError = error;
          this.onError(new Error(error));
          this.onStatus('error');
        }
        return;
      }
      this._backgroundLastError = '';
      const since = Math.max(0, this._backgroundLastTime - 1500);
      const json = bridge.getTrackPointsSince?.(since) || '[]';
      const fixes = JSON.parse(json);
      if (!Array.isArray(fixes) || !fixes.length) return;
      for (const fix of fixes) {
        if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) continue;
        const time = Number(fix.time) || 0;
        if (time && time <= this._backgroundLastTime) continue;
        if (time) this._backgroundLastTime = time;
        this._handlePosition({
          coords: {
            latitude: fix.lat,
            longitude: fix.lng,
            altitude: Number.isFinite(fix.alt) ? fix.alt : null,
            accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
            speed: Number.isFinite(fix.speed) ? fix.speed : null,
            heading: Number.isFinite(fix.heading) ? fix.heading : null,
          },
          timestamp: time || Date.now(),
        }, time || Date.now());
      }
    } catch (error) {
      // A malformed bridge response should not kill the polling loop.
    }
  }

  _stopBackgroundWatch() {
    clearInterval(this._backgroundTimer);
    this._backgroundTimer = null;
    if (this._hasBackgroundTracking()) {
      try { window.JiyiAndroid.stopBackgroundTracking?.(); } catch { /* optional */ }
    }
  }

  _startNativeWatch() {
    this._stopNativeWatch();
    try {
      window.JiyiAndroid.startLocationUpdates();
    } catch (error) {
      this._watch();
      return;
    }
    this._nativeLastTime = 0;
    this._nativeLastError = '';
    this._nativeTimer = setInterval(() => this._pollNativeLocation(), 900);
    this._nativeTimeout = setTimeout(() => {
      if (this.state === 'locating' && this.points.length === 0) {
        this.onError(new Error('定位超时，请到开阔处或检查系统 GPS / 网络定位'));
        this.onStatus('error');
      }
    }, 25_000);
    setTimeout(() => this._pollNativeLocation(), 250);
  }

  _pollNativeLocation() {
    if (!this._hasNativeLocation()) return;
    if (this.state === 'paused' || this.state === 'stopped' || this.state === 'idle') return;
    try {
      const error = window.JiyiAndroid.getLocationError?.() || '';
      if (error) {
        if (error !== this._nativeLastError) {
          this._nativeLastError = error;
          this.onError(new Error(error));
          this.onStatus('error');
        }
        return;
      }
      this._nativeLastError = '';
      const json = window.JiyiAndroid.getLocationJson?.() || '';
      if (!json) return;
      const fix = JSON.parse(json);
      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return;
      const fixTime = Number(fix.time) || 0;
      if (fixTime && fixTime === this._nativeLastTime) return;
      this._nativeLastTime = fixTime;
      this._handlePosition({
        coords: {
          latitude: fix.lat,
          longitude: fix.lng,
          altitude: Number.isFinite(fix.alt) ? fix.alt : null,
          accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
          speed: Number.isFinite(fix.speed) ? fix.speed : null,
          heading: Number.isFinite(fix.heading) ? fix.heading : null,
        },
        timestamp: fixTime || Date.now(),
      }, fixTime || Date.now());
    } catch (error) {
      // A malformed bridge response should not kill the polling loop.
    }
  }

  _stopNativeWatch() {
    if (this._nativeTimer) {
      clearInterval(this._nativeTimer);
      this._nativeTimer = null;
    }
    clearTimeout(this._nativeTimeout);
    this._nativeTimeout = null;
    if (this._hasNativeLocation()) {
      try { window.JiyiAndroid.stopLocationUpdates?.(); } catch { /* optional */ }
    }
  }

  _clearNativeTimeout() {
    clearTimeout(this._nativeTimeout);
    this._nativeTimeout = null;
  }

  _handlePosition(position, timestamp = Date.now()) {
    if (this.state === 'paused' || this.state === 'idle' || this.state === 'stopped') return;
    const { latitude, longitude, altitude, accuracy, speed, heading } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const now = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
    const raw = {
      lat: latitude,
      lng: longitude,
      alt: Number.isFinite(altitude) ? altitude : null,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      speed: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? heading : null,
      t: now,
    };
    this.lastRaw = raw;
    this.onLive(raw, false);
    if (this.state === 'locating') {
      this.state = 'recording';
      this.firstFixAt = now;
      this._clearNativeTimeout();
      this.onStatus('recording');
    }
    if (!this.lastPoint) {
      this._accept(raw, true);
      return;
    }
    const dist = haversine(this.lastPoint, raw);
    const dt = Math.max(0.001, (now - this.lastPoint.t) / 1000);
    // Reject teleporting fixes, but allow a genuine fast downhill move.
    if (dist / dt > 15 && dist > 30) return;
    if (raw.accuracy != null && raw.accuracy > 120 && dist < 30) return;
    if (dist >= 4 || now - this.lastPoint.t >= 5000) {
      this._accept(raw, false);
    }
  }

  _accept(raw, first) {
    const point = {
      lat: raw.lat,
      lng: raw.lng,
      alt: raw.alt,
      accuracy: raw.accuracy,
      t: raw.t,
    };
    this.points.push(point);
    this.lastPoint = point;
    this.onPoint(point, first);
    this.onLive(raw, true);
    this._saveDraftSoon();
  }

  pause() {
    if (this.state !== 'recording') return;
    this.pausedAt = Date.now();
    this.state = 'paused';
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this._stopBackgroundWatch();
    this._stopNativeWatch();
    this._releaseWakeLock();
    this.onStatus('paused');
    this._saveDraft();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.pausedMs += Date.now() - (this.pausedAt ?? Date.now());
    this.pausedAt = null;
    this.state = 'recording';
    this.lastPoint = this.points[this.points.length - 1] || null;
    this.onStatus('recording');
    this._requestWakeLock();
    if (this._hasBackgroundTracking()) this._startBackgroundTracking(false);
    else if (this._hasNativeLocation()) this._startNativeWatch();
    else this._watch();
    this._saveDraft();
  }

  stop() {
    this.state = 'stopped';
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this._stopBackgroundWatch();
    this._stopNativeWatch();
    this._releaseWakeLock();
    clearTimeout(this._tick);
    this.onStatus('stopped');
    clearDraft();
  }

  abandon() {
    this.state = 'stopped';
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this._stopBackgroundWatch();
    this._stopNativeWatch();
    this._releaseWakeLock();
    clearTimeout(this._tick);
    if (this.startedAt && this.points.length > 0) this._saveDraft();
    this.onStatus('stopped');
  }

  async _requestWakeLock() {
    try { window.JiyiAndroid?.setKeepScreenOn?.(true); } catch { /* native bridge optional */ }
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Battery saver or an unsupported browser can decline this; not fatal.
    }
  }

  async _releaseWakeLock() {
    try { window.JiyiAndroid?.setKeepScreenOn?.(false); } catch { /* native bridge optional */ }
    try {
      await this.wakeLock?.release();
    } catch {
      // Already released.
    }
    this.wakeLock = null;
  }

  _draftPayload() {
    let previous = null;
    try {
      previous = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch {
      previous = null;
    }
    return {
      version: 1,
      startedAt: this.startedAt,
      pausedMs: this.pausedMs,
      points: this.points,
      moments: previous?.moments || [],
      title: previous?.title || '',
      savedAt: Date.now(),
    };
  }

  _saveDraftSoon() {
    clearTimeout(this._tick);
    this._tick = setTimeout(() => this._saveDraft(), 1200);
  }

  _saveDraft() {
    if (!this.startedAt || this.points.length === 0) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this._draftPayload()));
    } catch {
      // Storage quota can be tight in private browsing; recording continues.
    }
  }
}

export function getDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.points?.length) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveDraftState(state) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, ...state, savedAt: Date.now() }));
  } catch {
    // Ignore quota errors.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
