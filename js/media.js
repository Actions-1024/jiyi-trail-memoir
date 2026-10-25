import { getMedia, putMedia } from './db.js';

const objectUrls = new Map();
const mediaCache = new Map();

function uid(prefix = 'm') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.84) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片处理失败'));
    }, type, quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片，请换一张试试'));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari can fail on some orientation/format combinations; fall through.
    }
  }
  const image = await loadImage(file);
  return image;
}

function drawContained(image, maxSide) {
  const iw = image.width || image.naturalWidth;
  const ih = image.height || image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(iw * scale));
  canvas.height = Math.max(1, Math.round(ih * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function preparePhoto(file) {
  let source;
  try {
    source = await decodeImage(file);
  } catch (error) {
    throw new Error(error.message || '图片格式暂不支持');
  }
  const canvas = drawContained(source, 1800);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
  const thumbCanvas = drawContained(source, 520);
  const thumbBlob = await canvasToBlob(thumbCanvas, 'image/jpeg', 0.78);
  source.close?.();
  return {
    type: 'photo',
    blob,
    thumbBlob,
    width: canvas.width,
    height: canvas.height,
    duration: null,
    name: file.name || 'photo.jpg',
  };
}

function waitForEvent(target, event, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('读取视频超时'));
    }, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('无法读取这个视频'));
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

export async function prepareVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForEvent(video, 'loadedmetadata');
    const seekTo = Math.min(Math.max(0.1, video.duration * 0.12), Math.max(0.1, video.duration - 0.1));
    if (Number.isFinite(seekTo) && seekTo > 0) {
      video.currentTime = seekTo;
      await waitForEvent(video, 'seeked', 8000).catch(() => {});
    }
    const canvas = document.createElement('canvas');
    const max = 720;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbBlob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    return {
      type: 'video',
      blob: file,
      thumbBlob,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      name: file.name || 'moment.mp4',
    };
  } catch (error) {
    throw new Error(error.message || '视频读取失败，请尝试更短的视频');
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load?.();
  }
}

export async function processMediaFile(file, tripId) {
  if (!file) throw new Error('没有选择文件');
  if (file.size > 280 * 1024 * 1024) throw new Error('文件超过 280MB，请先压缩一下');
  const prepared = file.type.startsWith('video/')
    ? await prepareVideo(file)
    : await preparePhoto(file);
  const id = uid(prepared.type === 'video' ? 'v' : 'p');
  await putMedia({
    id,
    tripId,
    blob: prepared.blob,
    thumbBlob: prepared.thumbBlob,
    type: prepared.type,
    width: prepared.width,
    height: prepared.height,
    duration: prepared.duration,
    name: prepared.name,
  });
  objectUrls.set(id, {
    src: URL.createObjectURL(prepared.blob),
    thumbUrl: URL.createObjectURL(prepared.thumbBlob),
  });
  return {
    mediaId: id,
    type: prepared.type,
    width: prepared.width,
    height: prepared.height,
    duration: prepared.duration,
    src: objectUrls.get(id).src,
    thumbUrl: objectUrls.get(id).thumbUrl,
  };
}

export async function resolveMedia(mediaId) {
  if (!mediaId) return null;
  if (objectUrls.has(mediaId)) {
    const cached = objectUrls.get(mediaId);
    const record = mediaCache.get(mediaId);
    return {
      src: cached.src,
      thumbUrl: cached.thumbUrl,
      type: record?.type,
      width: record?.width,
      height: record?.height,
      duration: record?.duration,
    };
  }
  const record = await getMedia(mediaId);
  if (!record) return null;
  mediaCache.set(mediaId, record);
  const src = URL.createObjectURL(record.blob);
  const thumbUrl = record.thumbBlob ? URL.createObjectURL(record.thumbBlob) : src;
  objectUrls.set(mediaId, { src, thumbUrl });
  return {
    src,
    thumbUrl,
    type: record.type,
    width: record.width,
    height: record.height,
    duration: record.duration,
  };
}

export async function hydrateTrip(trip) {
  if (!trip) return trip;
  const moments = await Promise.all((trip.moments || []).map(async (moment) => {
    if (moment.mediaId) {
      const media = await resolveMedia(moment.mediaId);
      if (media) {
        return {
          ...moment,
          type: moment.type === 'note' ? 'note' : media.type,
          src: media.src,
          thumbUrl: media.thumbUrl,
          videoSrc: media.type === 'video' ? media.src : null,
          mediaWidth: media.width,
          mediaHeight: media.height,
          mediaDuration: media.duration,
        };
      }
    }
    return {
      ...moment,
      thumbUrl: moment.thumbUrl || moment.thumb || moment.src || null,
    };
  }));
  let cover = trip.cover || null;
  if (trip.coverMediaId) {
    const media = await resolveMedia(trip.coverMediaId);
    if (media) cover = media.thumbUrl;
  }
  if (!cover) cover = moments.find((m) => m.thumbUrl)?.thumbUrl || null;
  return { ...trip, moments, cover };
}

export function releaseMediaUrls() {
  for (const { src, thumbUrl } of objectUrls.values()) {
    URL.revokeObjectURL(src);
    if (thumbUrl !== src) URL.revokeObjectURL(thumbUrl);
  }
  objectUrls.clear();
  mediaCache.clear();
}

export function releaseTripUrls(trip) {
  // Object URLs are cached globally for the session. They are intentionally
  // kept alive while navigating between the trip and the exporter.
  return trip;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function videoPosterFromSrc(src, time = 0.12) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  await waitForEvent(video, 'loadeddata');
  if (Number.isFinite(video.duration) && time < video.duration) {
    video.currentTime = time;
    await waitForEvent(video, 'seeked', 6000).catch(() => {});
  }
  return video;
}

function nativeVideoBridge() {
  const bridge = window.JiyiAndroid;
  if (!bridge || typeof bridge.beginSave !== 'function') return null;
  return bridge;
}

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

// Saves a large Blob through the Android shell in small Base64 chunks. Sending
// a 15 MB video as one JS-bridge string would be fragile and memory hungry.
async function saveBlobViaNative(blob, filename, share = false) {
  const bridge = nativeVideoBridge();
  if (!bridge) return '';
  const mime = blob.type || 'video/webm';
  try { bridge.setShareAfterSave?.(share); } catch { /* bridge optional */ }
  if (!bridge.beginSave(filename, mime)) return '';
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 96 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
      if (!bridge.appendSave(bytesToBase64(chunk))) {
        throw new Error('写入视频失败');
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return bridge.finishSave() || '';
  } catch (error) {
    console.warn('Native video save failed', error);
    try { bridge.toast?.('视频保存失败，请重试'); } catch { /* bridge optional */ }
    return '';
  }
}

export async function downloadBlob(blob, filename) {
  const bridge = nativeVideoBridge();
  if (bridge) {
    try { bridge.toast?.('正在保存视频…'); } catch { /* bridge optional */ }
    const result = await saveBlobViaNative(blob, filename, false);
    if (result) return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
  return true;
}

export async function shareBlobFile(blob, filename, title, text) {
  const bridge = nativeVideoBridge();
  if (bridge && typeof bridge.shareLast === 'function') {
    try { bridge.toast?.('正在准备分享…'); } catch { /* bridge optional */ }
    const result = await saveBlobViaNative(blob, filename, true);
    // Native converts WebM to MP4 and opens the share sheet only after the
    // conversion has finished, so the shared file is gallery-friendly.
    if (result) return true;
  }
  if (!navigator.canShare) return false;
  const file = new File([blob], filename, { type: blob.type || 'video/webm' });
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (error) {
    if (error?.name === 'AbortError') return true;
    return false;
  }
}
