import { TrailMap } from './map.js';
import { buildTimeline, timelineSnapshot } from './timeline.js';
import { getTheme } from './themes.js';
import { AmbientScore } from './audio.js';
import { fixWebmDuration } from './webm.js';
import {
  pointAtFraction,
  clamp,
  smoothstep,
  easeOutCubic,
  durationClock,
  formatClock,
  formatDate,
} from './geo.js';

const W = 720;
const H = 1280;
const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';

function setFont(ctx, size, weight = 500, serif = false) {
  ctx.font = `${weight} ${size}px ${serif ? SERIF : SANS}`;
}

function roundedPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSpacedText(ctx, text, x, y, spacing, options = {}) {
  const { align = 'left', color = ctx.fillStyle } = options;
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, chars.length - 1);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const oldAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  chars.forEach((char, i) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[i] + spacing;
  });
  ctx.textAlign = oldAlign;
  return total;
}

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  if (!text) return [];
  const paragraphs = String(text).replace(/\r/g, '').split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) break;
    if (!paragraph) {
      lines.push('');
      continue;
    }
    const noLineStart = '，。！？、；：,.!?;:)]}」』】》〉…';
    const noLineEnd = '（《「『【([{';
    let line = '';
    for (const char of [...paragraph]) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        if (noLineStart.includes(char)) {
          lines.push(test.trimEnd());
          line = '';
        } else if (noLineEnd.includes(line[line.length - 1])) {
          lines.push(line.slice(0, -1).trimEnd());
          line = line[line.length - 1] + char;
        } else {
          lines.push(line.trimEnd());
          line = char;
        }
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (lines.length < maxLines && line) lines.push(line.trimEnd());
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) {
    const original = [...String(text).replace(/\s+/g, '')].join('');
    const rendered = lines.join('').replace(/\s+/g, '');
    if (rendered.length < original.length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function drawLines(ctx, lines, x, y, lineHeight, options = {}) {
  const { align = 'left', color = ctx.fillStyle } = options;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    if (line) ctx.fillText(line, x, y + i * lineHeight);
  });
}

function coverRect(ctx, source, sw, sh, x, y, w, h) {
  if (!source || !sw || !sh) return false;
  const sourceRatio = sw / sh;
  const targetRatio = w / h;
  let sx = 0;
  let sy = 0;
  let cutW = sw;
  let cutH = sh;
  if (sourceRatio > targetRatio) {
    cutW = sh * targetRatio;
    sx = (sw - cutW) / 2;
  } else {
    cutH = sw / targetRatio;
    sy = (sh - cutH) / 2;
  }
  ctx.drawImage(source, sx, sy, cutW, cutH, x, y, w, h);
  return true;
}

function drawPinGlyph(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.1);
  ctx.beginPath();
  ctx.arc(x, y - size * 0.16, size * 0.3, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(x, y + size * 0.52);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - size * 0.16, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function formatDay(value) {
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function mediaKind(moment) {
  if (!moment) return null;
  if (moment.type === 'video' || moment.mediaType === 'video') return 'video';
  if (moment.src) return 'photo';
  return null;
}

export class VlogComposer {
  constructor({ canvas, trip, themeId }) {
    this.canvas = canvas;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.trip = trip;
    this.themeId = themeId || trip.theme || 'dawn';
    this.theme = getTheme(this.themeId);
    this.timeline = buildTimeline(trip.points, trip.moments || []);
    this.moments = this.timeline.moments;
    this.images = new Map();
    this.imagePromises = new Map();
    this.videos = new Map();
    this.activeVideoId = null;
    this.time = 0;
    this.grain = this._makeGrain();
    this._filterSupported = true;

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = W;
    this.mapCanvas.height = H;
    this.map = new TrailMap(this.mapCanvas, {
      fixedSize: { width: W, height: H },
      theme: this.themeId,
      pixelRatio: 1,
      interactive: false,
      attribution: false,
      chrome: false,
      startEnd: true,
      moments: true,
      labels: true,
    });
    this.map.setRoute(trip.points, { progress: 0.01, moments: this.moments, fit: false });
    this.map.fitToRoute(trip.points, { top: 280, right: 70, bottom: 430, left: 70 });
    this.baseCenter = { ...this.map.center };
    this.baseZoom = this.map.zoom;
    this._testFilter();
    this.renderAt(0);
  }

  get duration() {
    return this.timeline.totalDuration;
  }

  _testFilter() {
    try {
      this.ctx.filter = 'blur(1px)';
      this._filterSupported = this.ctx.filter !== 'none';
      this.ctx.filter = 'none';
    } catch {
      this._filterSupported = false;
    }
  }

  _makeGrain() {
    const size = 180;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const data = ctx.createImageData(size, size);
    let seed = 9;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = (seed >>> 17) & 255;
      data.data[i] = value;
      data.data[i + 1] = value;
      data.data[i + 2] = value;
      data.data[i + 3] = value > 225 ? 26 : 0;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  setTheme(themeId) {
    this.themeId = themeId;
    this.theme = getTheme(themeId);
    this.map.setTheme(themeId);
    this.renderAt(this.time);
  }

  async _loadImage(src) {
    if (!src) return null;
    if (this.images.has(src)) return this.images.get(src);
    if (!this.imagePromises.has(src)) {
      this.imagePromises.set(src, new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      }));
    }
    const image = await this.imagePromises.get(src);
    if (image) this.images.set(src, image);
    return image;
  }

  async _loadVideo(moment) {
    const src = moment.videoSrc || (moment.type === 'video' ? moment.src : null) || (moment.mediaType === 'video' ? moment.src : null);
    if (!src) return null;
    if (this.videos.has(moment.id)) return this.videos.get(moment.id);
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    video.loop = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    const loaded = new Promise((resolve) => {
      const done = () => {
        video.play().catch(() => {});
        resolve(video);
      };
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('error', () => resolve(null), { once: true });
      setTimeout(() => resolve(video.readyState >= 2 ? video : null), 20_000);
    });
    // Blob URLs from IndexedDB are already same-origin; setting crossOrigin
    // after src (as the old code did) can make Safari/WebView refuse to decode.
    video.src = src;
    video.load();
    const result = await loaded;
    if (result) this.videos.set(moment.id, result);
    return result;
  }

  async prepare() {
    try {
      await document.fonts?.ready;
    } catch {
      // System fonts are enough.
    }
    const srcs = new Set();
    if (this.trip.cover) srcs.add(this.trip.cover);
    for (const moment of this.moments) {
      if (moment.src) srcs.add(moment.src);
      if (moment.thumbUrl) srcs.add(moment.thumbUrl);
    }
    await Promise.all([...srcs].map((src) => this._loadImage(src)));
    await Promise.all(this.moments.map((moment) => this._loadVideo(moment)));
    this.renderAt(0);
  }

  _getImageForMoment(moment) {
    return this.images.get(moment.src) || this.images.get(moment.thumbUrl) || null;
  }

  _backgroundSource(moment) {
    const video = this.videos.get(moment.id);
    if (video && video.readyState >= 2) return { source: video, w: video.videoWidth, h: video.videoHeight };
    const image = this._getImageForMoment(moment);
    if (image) return { source: image, w: image.naturalWidth, h: image.naturalHeight };
    return null;
  }

  _syncVideos(snap) {
    const active = snap.phase.kind === 'moment' && mediaKind(snap.moment) === 'video'
      ? snap.moment
      : null;
    const activeId = active?.id || null;
    if (activeId !== this.activeVideoId) {
      if (this.activeVideoId) {
        const previous = this.videos.get(this.activeVideoId);
        if (previous) {
          previous.pause();
          try { previous.currentTime = 0; } catch { /* ignored */ }
        }
      }
      this.activeVideoId = activeId;
      if (active) {
        const video = this.videos.get(active.id);
        if (video) {
          try {
            video.currentTime = 0;
            video.play().catch(() => {});
          } catch {
            // Poster still appears.
          }
        }
      }
    } else if (active) {
      const video = this.videos.get(active.id);
      if (video && video.paused && snap.local < 1) video.play().catch(() => {});
    }
  }

  _syncMap(snap) {
    const p = snap.progress;
    this.map.center = { ...this.baseCenter };
    this.map.zoom = this.baseZoom;
    let progress = p;
    let zoom = this.baseZoom;
    if (snap.phase.kind === 'intro') {
      progress = 0.018 + 0.055 * easeOutCubic(snap.u);
      this.map.current = pointAtFraction(this.trip.points, progress);
      this.map.moments = [];
    } else if (snap.phase.kind === 'outro') {
      progress = 1;
      zoom = this.baseZoom - 0.08;
      this.map.current = pointAtFraction(this.trip.points, 1);
      this.map.moments = this.moments;
    } else if (snap.phase.kind === 'moment') {
      progress = snap.moment.progress;
      const amount = smoothstep(0, 0.55, snap.local)
        * (1 - smoothstep(Math.max(0.6, snap.phase.duration - 0.6), snap.phase.duration, snap.local));
      const pos = pointAtFraction(this.trip.points, progress);
      this.map.center = {
        lat: this.baseCenter.lat + (pos.lat - this.baseCenter.lat) * amount * 0.6,
        lng: this.baseCenter.lng + (pos.lng - this.baseCenter.lng) * amount * 0.6,
      };
      zoom = this.baseZoom + 0.7 * amount;
      this.map.current = pos;
      this.map.moments = this.moments.filter((m) => m.progress <= progress + 0.002);
    } else {
      this.map.current = pointAtFraction(this.trip.points, progress);
      this.map.moments = this.moments.filter((m) => m.progress <= progress + 0.002);
    }
    this.map.progress = clamp(progress, 0, 1);
    this.map.zoom = zoom;
  }

  renderAt(time) {
    this.time = clamp(time, 0, this.duration);
    const snap = timelineSnapshot(this.timeline, this.time, this.trip.points);
    this._syncVideos(snap);
    this._syncMap(snap);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.map.draw(this.time * 1000);
    ctx.drawImage(this.mapCanvas, 0, 0);
    if (snap.phase.kind === 'intro') this._drawIntro(ctx, snap);
    else if (snap.phase.kind === 'travel') this._drawTravel(ctx, snap);
    else if (snap.phase.kind === 'moment') this._drawMoment(ctx, snap);
    else this._drawOutro(ctx, snap);
    this._drawFilm(ctx);
    if (snap.phase.kind === 'travel' || snap.phase.kind === 'moment') this._drawWatermark(ctx);
    this._drawProgress(ctx, snap.phase.kind);
    return snap;
  }

  _drawIntro(ctx, snap) {
    const local = snap.local;
    const fadeIn = smoothstep(0, 0.75, local);
    const fadeOut = 1 - smoothstep(this.timeline.intro - 0.55, this.timeline.intro, local);
    const alpha = fadeIn * fadeOut;
    const titleIn = easeOutCubic(clamp((local - 0.35) / 1.25, 0, 1));
    const statsIn = easeOutCubic(clamp((local - 0.9) / 1.2, 0, 1));

    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(7, 17, 13, 0.58)');
    shade.addColorStop(0.28, 'rgba(7, 17, 13, 0.05)');
    shade.addColorStop(0.52, 'rgba(7, 17, 13, 0.08)');
    shade.addColorStop(0.76, 'rgba(7, 16, 12, 0.78)');
    shade.addColorStop(1, 'rgba(7, 16, 12, 0.96)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = alpha;
    // Brand.
    setFont(ctx, 38, 600, true);
    ctx.fillStyle = '#FFFDF7';
    ctx.textAlign = 'left';
    ctx.fillText('迹忆', 54, 94);
    setFont(ctx, 10, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.55)';
    drawSpacedText(ctx, 'TRAIL MEMOIR', 54, 121, 3.6);
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(54, 143);
    ctx.lineTo(142, 143);
    ctx.stroke();

    // Date / place.
    setFont(ctx, 13, 500);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 253, 247, 0.72)';
    ctx.fillText(formatDay(this.trip.startedAt), W - 54, 90);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.45)';
    ctx.fillText(this.trip.locationName || '一段旅程', W - 54, 116);

    // Title block.
    const baseY = 895;
    ctx.save();
    ctx.globalAlpha = alpha * titleIn;
    ctx.translate(0, (1 - titleIn) * 42);
    ctx.fillStyle = 'rgba(214, 232, 201, 0.74)';
    setFont(ctx, 11, 600);
    drawSpacedText(ctx, 'A WALK TO REMEMBER', 56, baseY - 66, 3.1);
    ctx.fillStyle = '#FFFDF7';
    setFont(ctx, 62, 600);
    ctx.textAlign = 'left';
    const titleLines = wrapLines(ctx, this.trip.title, 590, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, 54, baseY + i * 78));
    const afterTitle = baseY + (titleLines.length - 1) * 78;
    ctx.fillStyle = 'rgba(255, 253, 247, 0.7)';
    setFont(ctx, 18, 400);
    ctx.fillText(this.trip.subtitle || '一步一步，走进风景里。', 56, afterTitle + 50);
    ctx.restore();

    // Stats.
    ctx.save();
    ctx.globalAlpha = alpha * statsIn;
    ctx.translate(0, (1 - statsIn) * 26);
    const stats = this.trip.stats || {};
    const cells = [
      { value: ((stats.distance || 0) / 1000).toFixed(2), unit: 'KM', label: '距离' },
      { value: durationClock(stats.duration || 0), unit: '', label: '用时' },
      { value: String(this.moments.length), unit: '', label: '瞬间' },
    ];
    cells.forEach((cell, i) => {
      const x = 54 + i * 214;
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255, 253, 247, 0.16)';
        ctx.beginPath();
        ctx.moveTo(x - 28, 1114);
        ctx.lineTo(x - 28, 1186);
        ctx.stroke();
      }
      ctx.fillStyle = '#FFFDF7';
      setFont(ctx, 36, 500);
      ctx.textAlign = 'left';
      ctx.fillText(cell.value, x, 1150);
      if (cell.unit) {
        const width = ctx.measureText(cell.value).width;
        setFont(ctx, 10, 500);
        ctx.fillStyle = 'rgba(255, 253, 247, 0.5)';
        ctx.fillText(cell.unit, x + width + 6, 1148);
      }
      ctx.fillStyle = 'rgba(255, 253, 247, 0.42)';
      setFont(ctx, 10, 400);
      ctx.fillText(cell.label, x, 1176);
    });
    ctx.restore();

    // Footer.
    setFont(ctx, 9, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.34)';
    drawSpacedText(ctx, 'MADE OF MOMENTS', 54, 1230, 2.4);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.moments.length} MOMENTS · ${formatDay(this.trip.startedAt)}`, W - 54, 1230);
    ctx.restore();
  }

  _drawTravel(ctx, snap) {
    const progress = snap.progress;
    const stats = this.trip.stats || {};
    const topShade = ctx.createLinearGradient(0, 0, 0, 270);
    topShade.addColorStop(0, 'rgba(6, 15, 11, 0.62)');
    topShade.addColorStop(1, 'rgba(6, 15, 11, 0)');
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, W, 270);
    const bottomShade = ctx.createLinearGradient(0, H - 260, 0, H);
    bottomShade.addColorStop(0, 'rgba(6, 15, 11, 0)');
    bottomShade.addColorStop(1, 'rgba(6, 15, 11, 0.6)');
    ctx.fillStyle = bottomShade;
    ctx.fillRect(0, H - 260, W, 260);
    ctx.fillStyle = 'rgba(7, 15, 11, 0.08)';
    ctx.fillRect(0, 0, W, H);

    // Brand.
    ctx.save();
    ctx.fillStyle = 'rgba(255, 253, 247, 0.92)';
    setFont(ctx, 22, 600, true);
    ctx.fillText('迹忆', 54, 66);
    setFont(ctx, 8, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.5)';
    drawSpacedText(ctx, 'TRAIL MEMOIR', 54, 84, 2.6);

    // Distance achieved.
    ctx.textAlign = 'right';
    setFont(ctx, 24, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.94)';
    ctx.fillText(`${((stats.distance || 0) * progress / 1000).toFixed(2)}`, W - 54, 65);
    setFont(ctx, 9, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.48)';
    ctx.fillText('KM · 已走过', W - 54, 84);

    // Progress line.
    const x0 = 54;
    const x1 = W - 54;
    const y = 118;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.18)';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225, 239, 205, 0.92)';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + (x1 - x0) * progress, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * progress, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#E1EFCD';
    ctx.fill();
    ctx.restore();

    // Bottom text.
    ctx.save();
    const nextMoment = this.moments.find((moment) => moment.progress > progress + 0.001);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.52)';
    setFont(ctx, 10, 500);
    drawSpacedText(ctx, 'ON THE WAY', 54, H - 92, 3);
    setFont(ctx, 17, 400);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.82)';
    ctx.fillText(nextMoment ? `下一处风景 · ${nextMoment.title || '继续向前'}` : '沿着自己的节奏，继续向前。', 54, H - 62);
    ctx.textAlign = 'right';
    setFont(ctx, 11, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.5)';
    ctx.fillText(`${Math.round(progress * 100)}%`, W - 54, H - 62);
    ctx.restore();
  }

  _drawMoment(ctx, snap) {
    const moment = snap.moment;
    const local = snap.local;
    const fadeIn = smoothstep(0, 0.42, local);
    const fadeOut = 1 - smoothstep(snap.phase.duration - 0.42, snap.phase.duration, local);
    const alpha = fadeIn * fadeOut;
    if (!moment) return;
    const kind = mediaKind(moment);
    const bg = this._backgroundSource(moment);

    // Tinted, blurred memory wash under the map.
    if (bg) {
      ctx.save();
      if (this._filterSupported) ctx.filter = 'blur(28px) saturate(0.8)';
      ctx.globalAlpha = 0.26;
      coverRect(ctx, bg.source, bg.w, bg.h, -40, -40, W + 80, H + 80);
      ctx.restore();
    }
    const dim = ctx.createLinearGradient(0, 0, 0, H);
    dim.addColorStop(0, 'rgba(8, 16, 12, 0.78)');
    dim.addColorStop(0.45, 'rgba(8, 16, 12, 0.62)');
    dim.addColorStop(1, 'rgba(8, 16, 12, 0.9)');
    ctx.fillStyle = dim;
    ctx.fillRect(0, 0, W, H);

    const isNote = moment.type === 'note';
    const index = String(moment.order || 1).padStart(2, '0');
    const total = String(this.moments.length).padStart(2, '0');

    // Header.
    ctx.save();
    ctx.globalAlpha = alpha;
    setFont(ctx, 10, 600);
    ctx.fillStyle = 'rgba(225, 239, 205, 0.8)';
    const momentLabelWidth = drawSpacedText(ctx, 'MOMENT', 58, 76, 3.4);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.9)';
    ctx.fillText(index, 58 + momentLabelWidth + 10, 76);
    const indexWidth = ctx.measureText(index).width;
    ctx.fillStyle = 'rgba(255, 253, 247, 0.34)';
    setFont(ctx, 10, 500);
    ctx.fillText(` / ${total}`, 58 + momentLabelWidth + 10 + indexWidth + 4, 76);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 253, 247, 0.58)';
    setFont(ctx, 11, 500);
    ctx.fillText(moment.t ? formatClock(moment.t) : '', W - 58, 76);
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(58, 100);
    ctx.lineTo(W - 58, 100);
    ctx.stroke();
    ctx.restore();

    // Active map pin ring.
    if (bg) {
      const p = this.map.latLngToScreen(moment.lat, moment.lng);
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = 'rgba(225, 239, 205, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34 + Math.sin(snap.time * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    const lift = (1 - fadeIn) * 42;
    ctx.translate(0, lift);
    if (isNote) this._drawNoteCard(ctx, moment, index, total);
    else this._drawPhotoCard(ctx, moment, index, total, kind);
    ctx.restore();

    // Location footer.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, (1 - fadeIn) * 22);
    drawPinGlyph(ctx, 64, 1054, 15, 'rgba(225, 239, 205, 0.8)');
    setFont(ctx, 12, 400);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.66)';
    ctx.textAlign = 'left';
    ctx.fillText(this.trip.locationName || '旅途中', 82, 1059);
    if (moment.distance) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 253, 247, 0.4)';
      ctx.fillText(`${(moment.distance / 1000).toFixed(2)} KM`, W - 58, 1059);
    }
    ctx.restore();
  }

  _drawPhotoCard(ctx, moment, index, total, kind) {
    const x = 58;
    const y = 158;
    const w = W - 116;
    const h = 704;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 24;
    roundedPath(ctx, x, y, w, h, 28);
    ctx.fillStyle = 'rgba(24, 36, 30, 0.9)';
    ctx.fill();
    ctx.restore();

    const bg = this._backgroundSource(moment);
    ctx.save();
    roundedPath(ctx, x, y, w, h, 28);
    ctx.clip();
    if (bg) {
      coverRect(ctx, bg.source, bg.w, bg.h, x, y, w, h);
    } else {
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, '#526b58');
      gradient.addColorStop(1, '#263c32');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);
    }
    const shade = ctx.createLinearGradient(0, y + h * 0.32, 0, y + h);
    shade.addColorStop(0, 'rgba(6, 14, 10, 0)');
    shade.addColorStop(0.58, 'rgba(6, 14, 10, 0.25)');
    shade.addColorStop(1, 'rgba(6, 14, 10, 0.86)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, w, h);
    // Caption.
    const text = moment.text || '';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 253, 247, 0.96)';
    setFont(ctx, 28, 600);
    const titleLines = wrapLines(ctx, moment.title || (kind === 'video' ? '一段画面' : '沿途的风景'), w - 68, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, x + 34, y + h - 116 + i * 36));
    if (text) {
      setFont(ctx, 18, 400);
      ctx.fillStyle = 'rgba(255, 253, 247, 0.67)';
      const textLines = wrapLines(ctx, text, w - 68, 2);
      const base = y + h - 116 + titleLines.length * 36 + 4;
      textLines.forEach((line, i) => ctx.fillText(line, x + 34, base + i * 28));
    }
    ctx.restore();

    // Card border.
    ctx.save();
    roundedPath(ctx, x, y, w, h, 28);
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  _drawNoteCard(ctx, moment, index, total) {
    const hasImage = !!moment.src;
    const x = 58;
    const y = 164;
    const w = W - 116;
    const h = 704;
    const radius = 28;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 22;
    roundedPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = this.theme.card;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedPath(ctx, x, y, w, h, radius);
    ctx.clip();
    let textTop = y + 128;
    if (hasImage) {
      const image = this._getImageForMoment(moment);
      if (image) {
        coverRect(ctx, image, image.naturalWidth, image.naturalHeight, x, y, w, 264);
        const shade = ctx.createLinearGradient(0, y + 160, 0, y + 264);
        shade.addColorStop(0, 'rgba(10, 18, 14, 0)');
        shade.addColorStop(1, 'rgba(10, 18, 14, 0.38)');
        ctx.fillStyle = shade;
        ctx.fillRect(x, y + 150, w, 114);
      } else {
        ctx.fillStyle = this.theme.accentSoft;
        ctx.fillRect(x, y, w, 264);
      }
      textTop = y + 330;
    }

    // Mood + number.
    ctx.textAlign = 'left';
    if (moment.mood) {
      const label = `# ${moment.mood}`;
      setFont(ctx, 11, 500);
      const width = ctx.measureText(label).width + 24;
      roundedPath(ctx, x + 36, y + 34 + (hasImage ? 280 : 0), width, 30, 15);
      ctx.fillStyle = this.theme.accentSoft;
      ctx.fill();
      ctx.fillStyle = this.theme.accent;
      ctx.fillText(label, x + 48, y + 54 + (hasImage ? 280 : 0));
    }
    setFont(ctx, 10, 600);
    ctx.fillStyle = this.theme.muted;
    ctx.textAlign = 'right';
    drawSpacedText(ctx, `${index} / ${total}`, x + w - 36, y + 54 + (hasImage ? 280 : 0), 1.8, { align: 'right' });

    // Quote mark.
    if (!hasImage) {
      setFont(ctx, 128, 500, true);
      ctx.fillStyle = this.theme.accent;
      ctx.globalAlpha = 0.2;
      ctx.textAlign = 'left';
      ctx.fillText('“', x + 30, y + 218);
      ctx.globalAlpha = 1;
    }

    // Body text, sized for the length.
    const text = moment.text || '在这里，停了一会儿，把风景和心情一起记下来。';
    const availableHeight = hasImage ? 255 : 390;
    let fontSize = text.length > 190 ? 22 : text.length > 110 ? 25 : 28;
    let lineHeight = fontSize * 1.72;
    let maxLines = Math.floor(availableHeight / lineHeight);
    setFont(ctx, fontSize, 400, true);
    let lines = wrapLines(ctx, text, w - 82, maxLines);
    while (lines.length > maxLines && fontSize > 19) {
      fontSize -= 1;
      lineHeight = fontSize * 1.72;
      maxLines = Math.floor(availableHeight / lineHeight);
      setFont(ctx, fontSize, 400, true);
      lines = wrapLines(ctx, text, w - 82, maxLines);
    }
    ctx.fillStyle = this.theme.ink;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => ctx.fillText(line, x + 42, textTop + 34 + i * lineHeight));

    // Signature.
    setFont(ctx, 11, 400);
    ctx.fillStyle = this.theme.muted;
    ctx.fillText(`— 记于 ${moment.t ? formatClock(moment.t) : '此刻'}`, x + 42, y + h - 48);
    ctx.restore();

    // Accent edge.
    ctx.save();
    roundedPath(ctx, x, y, w, h, radius);
    ctx.strokeStyle = this.theme.id === 'night' ? 'rgba(255, 253, 247, 0.14)' : 'rgba(24, 37, 31, 0.08)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  _drawOutro(ctx, snap) {
    const local = snap.local;
    const alpha = smoothstep(0, 1.1, local);
    const stats = this.trip.stats || {};
    const theme = this.theme;

    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Decorative contour rings.
    ctx.save();
    ctx.strokeStyle = theme.id === 'night' ? 'rgba(200, 227, 141, 0.07)' : 'rgba(24, 37, 31, 0.055)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.72, H * 0.3, 220 + i * 58, 140 + i * 42, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, (1 - alpha) * 26);

    // Mark.
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(W / 2, 192, 34, 0, Math.PI * 2);
    ctx.fill();
    setFont(ctx, 30, 600, true);
    ctx.fillStyle = theme.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('迹', W / 2, 193);
    ctx.textBaseline = 'alphabetic';

    setFont(ctx, 9, 600);
    ctx.fillStyle = theme.muted;
    drawSpacedText(ctx, 'TRAIL MEMOIR', W / 2, 258, 4, { align: 'center' });

    // Title.
    setFont(ctx, 50, 600);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'center';
    const titleLines = wrapLines(ctx, this.trip.title, 590, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, W / 2, 370 + i * 60));

    const titleBottom = 370 + (titleLines.length - 1) * 60;
    setFont(ctx, 14, 400);
    ctx.fillStyle = theme.muted;
    ctx.fillText(`${formatDate(this.trip.startedAt)} · ${this.trip.locationName || '一段旅程'}`, W / 2, titleBottom + 46);

    // Divider.
    ctx.strokeStyle = theme.id === 'night' ? 'rgba(255, 253, 247, 0.14)' : 'rgba(24, 37, 31, 0.12)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 26, titleBottom + 84);
    ctx.lineTo(W / 2 + 26, titleBottom + 84);
    ctx.stroke();

    // Stats.
    const cells = [
      { value: ((stats.distance || 0) / 1000).toFixed(2), label: '公里' },
      { value: durationClock(stats.duration || 0), label: '用时' },
      { value: String(this.moments.length), label: '个瞬间' },
    ];
    cells.forEach((cell, i) => {
      const cx = W / 2 + (i - 1) * 194;
      setFont(ctx, 34, 500);
      ctx.fillStyle = theme.ink;
      ctx.fillText(cell.value, cx, 700);
      setFont(ctx, 10, 400);
      ctx.fillStyle = theme.muted;
      ctx.fillText(cell.label, cx, 726);
    });

    // Quote.
    setFont(ctx, 27, 400, true);
    ctx.fillStyle = theme.inkSoft;
    const quote = this.trip.description || '把走过的路，剪成一段回忆。';
    const quoteLines = wrapLines(ctx, quote, 540, 3);
    quoteLines.forEach((line, i) => ctx.fillText(line, W / 2, 846 + i * 44));

    // Closing.
    setFont(ctx, 11, 500);
    ctx.fillStyle = theme.muted;
    drawSpacedText(ctx, 'THE END · KEEP WALKING', W / 2, 1132, 3, { align: 'center' });

    ctx.strokeStyle = theme.id === 'night' ? 'rgba(255, 253, 247, 0.12)' : 'rgba(24, 37, 31, 0.1)';
    ctx.beginPath();
    ctx.moveTo(54, 1182);
    ctx.lineTo(W - 54, 1182);
    ctx.stroke();

    setFont(ctx, 16, 600, true);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.fillText('迹忆', 54, 1222);
    setFont(ctx, 9, 400);
    ctx.fillStyle = theme.muted;
    drawSpacedText(ctx, '把走过的路，剪成一段回忆', 104, 1221, 1.4);
    ctx.textAlign = 'right';
    setFont(ctx, 9, 500);
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatDay(this.trip.startedAt), W - 54, 1221);
    ctx.restore();
  }

  _drawFilm(ctx) {
    const pattern = ctx.createPattern(this.grain, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const vignette = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.26, W / 2, H * 0.48, H * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(4, 10, 7, 0.26)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  _drawProgress(ctx, phaseKind) {
    const progress = clamp(this.time / this.duration, 0, 1);
    const y = H - 26;
    const light = phaseKind === 'outro' && this.theme.id !== 'night';
    ctx.save();
    ctx.strokeStyle = light ? 'rgba(24, 37, 31, 0.14)' : 'rgba(255, 253, 247, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(54, y);
    ctx.lineTo(W - 54, y);
    ctx.stroke();
    ctx.strokeStyle = light ? this.theme.accent : 'rgba(225, 239, 205, 0.85)';
    ctx.beginPath();
    ctx.moveTo(54, y);
    ctx.lineTo(54 + (W - 108) * progress, y);
    ctx.stroke();
    ctx.restore();
  }

  _drawWatermark(ctx) {
    ctx.save();
    ctx.textAlign = 'right';
    setFont(ctx, 9, 500);
    ctx.fillStyle = 'rgba(255, 253, 247, 0.42)';
    ctx.fillText('迹忆 · TRAIL MEMOIR', W - 54, H - 44);
    ctx.restore();
  }

  dispose() {
    for (const video of this.videos.values()) {
      try { video?.pause(); } catch { /* ignored */ }
    }
    this.map.destroy();
    this.videos.clear();
    this.images.clear();
  }
}

export function pickMimeType(withAudio = false) {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = withAudio
    ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ]
    : [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];
  return candidates.find((type) => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  }) || null;
}

export function extensionForMime(mime) {
  return mime?.includes('mp4') ? 'mp4' : 'webm';
}

export function safeFilename(value) {
  return String(value || 'journey').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 42);
}

export async function exportVlog({ composer, music = true, musicStyle = 'dawn', onProgress = () => {}, signal }) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持视频导出，请使用 Chrome / Edge 或系统相册打开');
  }
  if (!composer.canvas.captureStream) {
    throw new Error('当前浏览器不支持画布录制，请使用 Chrome / Edge 再试');
  }
  await composer.prepare();
  composer.renderAt(0);

  let score = null;
  const stream = composer.canvas.captureStream(30);
  if (music && AmbientScore.isSupported()) {
    try {
      score = new AmbientScore();
      const audioStream = await score.start(composer.duration + 0.5, musicStyle);
      audioStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
    } catch (error) {
      console.warn('Ambient audio unavailable', error);
      score = null;
    }
  }

  const mimeType = pickMimeType(!!score);
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    await score?.stop();
    throw new Error('没有找到可用的视频编码格式，请换用 Chrome / Edge 打开');
  }

  const options = { mimeType, videoBitsPerSecond: 6_000_000 };
  if (score) options.audioBitsPerSecond = 128_000;
  let recorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      await score?.stop();
      throw new Error('视频录制初始化失败，请尝试关闭配乐或换一个浏览器');
    }
  }

  try { window.JiyiAndroid?.setKeepScreenOn?.(true); } catch { /* native bridge optional */ }
  const chunks = [];
  const result = await new Promise((resolve, reject) => {
    let finished = false;
    let aborted = false;
    let raf = null;
    let wakeLock = null;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignored */ }
      });
      signal?.removeEventListener('abort', abort);
      wakeLock?.release?.().catch(() => {});
      try { window.JiyiAndroid?.setKeepScreenOn?.(false); } catch { /* native bridge optional */ }
    };

    const finish = async () => {
      if (finished) return;
      finished = true;
      composer.renderAt(composer.duration);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // onstop may still fire.
      }
      setTimeout(async () => {
        cleanup();
        await score?.stop();
        if (aborted) {
          reject(new DOMException('Export cancelled', 'AbortError'));
          return;
        }
        const rawBlob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!rawBlob.size) {
          reject(new Error('视频生成失败，没有录到画面'));
          return;
        }
        const blob = extensionForMime(mimeType) === 'webm'
          ? await fixWebmDuration(rawBlob, composer.duration)
          : rawBlob;
        resolve({ blob, mimeType, extension: extensionForMime(mimeType), duration: composer.duration });
      }, 400);
    };

    const abort = () => {
      aborted = true;
      finish();
    };

    signal?.addEventListener('abort', abort, { once: true });
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      finished = true;
      cleanup();
      score?.stop();
      reject(new Error('录制过程中出现错误，请重试'));
    };
    recorder.onstop = () => {};

    try {
      recorder.start(800);
    } catch (error) {
      cleanup();
      score?.stop();
      reject(new Error('无法开始录制，请重试'));
      return;
    }

    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then((lock) => { wakeLock = lock; }).catch(() => {});
    }

    const startedAt = performance.now();
    let lastDraw = -100;
    const tick = (now) => {
      if (finished) return;
      const elapsed = Math.min(composer.duration + 0.12, (now - startedAt) / 1000);
      if (now - lastDraw >= 30) {
        composer.renderAt(Math.min(elapsed, composer.duration));
        onProgress(Math.min(1, elapsed / composer.duration), elapsed);
        lastDraw = now;
      }
      if (elapsed >= composer.duration + 0.1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  return result;
}
