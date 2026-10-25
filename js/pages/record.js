import { TrailMap } from '../map.js';
import { TrackRecorder, getDraft, saveDraftState, clearDraft } from '../recorder.js';
import { saveTrip, requestPersistence } from '../db.js';
import { processMediaFile, formatBytes, isVideoFile } from '../media.js';
import {
  statsFor,
  totalDistance,
  durationClock,
  paceLabel,
  formatClock,
} from '../geo.js';
import {
  $,
  escapeHTML,
  toast,
  openSheet,
  closeSheet,
  confirmSheet,
  setButtonLoading,
  haptic,
  openMediaPreview,
} from '../ui.js';
import { icon } from '../icons.js';

const DEMO_AREA = { minLat: 30.219, maxLat: 30.274, minLng: 120.112, maxLng: 120.169 };

function uid(prefix = 'trip') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function suggestTitle() {
  const hour = new Date().getHours();
  if (hour < 7) return '清晨漫步';
  if (hour < 11) return '上午走走';
  if (hour < 14) return '午间散步';
  if (hour < 18) return '午后漫步';
  if (hour < 21) return '傍晚散步';
  return '夜色漫游';
}

function suggestedTheme() {
  const hour = new Date().getHours();
  if (hour >= 19 || hour < 5) return 'night';
  if (hour >= 16) return 'amber';
  return 'dawn';
}

function inDemoArea(p) {
  return p && p.lat >= DEMO_AREA.minLat && p.lat <= DEMO_AREA.maxLat
    && p.lng >= DEMO_AREA.minLng && p.lng <= DEMO_AREA.maxLng;
}

function locationNameFor(p) {
  return inDemoArea(p) ? '杭州 · 西湖' : '我的旅程';
}

function coordLabel(p) {
  if (!p) return '';
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export async function renderRecord(root, ctx) {
  const resumeFlag = sessionStorage.getItem('jiyi:resume-draft') === '1';
  sessionStorage.removeItem('jiyi:resume-draft');
  const draft = resumeFlag ? getDraft() : null;
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  const needsHttps = !window.isSecureContext && !localHosts.includes(location.hostname);
  const originLabel = location.origin;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const tripId = uid('trip');
  const state = {
    points: draft?.points ? [...draft.points] : [],
    moments: draft?.moments ? [...draft.moments] : [],
    startedAt: draft?.startedAt ?? null,
    pausedMs: draft?.pausedMs ?? 0,
    title: draft?.title || suggestTitle(),
    finished: false,
    basemap: 'streets',
    follow: true,
  };

  root.innerHTML = `<div class="screen screen--map record-screen">
    <div class="record-map"><canvas id="record-canvas"></canvas></div>
    <div class="record-vignette record-vignette--top"></div>
    <div class="record-vignette record-vignette--bottom"></div>

    <header class="record-top">
      <button class="map-button" type="button" data-exit aria-label="结束记录">${icon('back', 20)}</button>
      <div class="record-pill" data-pill>
        <span class="record-pill__dot"></span>
        <strong data-record-state>定位中</strong>
        <span class="record-pill__divider"></span>
        <span class="record-pill__time" data-timer>00:00</span>
      </div>
      <button class="map-button" type="button" data-layer aria-label="切换地图">${icon('layers', 19)}</button>
    </header>

    <div class="record-hud">
      <div class="record-hud__main">
        <div class="record-metric">
          <strong data-distance>0.00</strong>
          <span>公里</span>
        </div>
        <div class="record-metric">
          <strong data-time>00:00</strong>
          <span>用时</span>
        </div>
        <div class="record-metric">
          <strong data-pace>--'--"</strong>
          <span>配速 / km</span>
        </div>
      </div>
      <div class="record-hud__foot">
        <span class="gps-status" data-gps><i></i>正在搜索 GPS</span>
        <span class="record-hud__hint">照片会落在此刻的位置</span>
      </div>
    </div>

    <div class="record-tip" data-tip>
      <span>${icon('pin', 13)} 到达喜欢的地方，点「照片」或「此刻」留下记录</span>
    </div>

    <button class="recenter-button" type="button" data-recenter hidden>
      ${icon('locate', 18)}<span>回到当前位置</span>
    </button>

    <div class="record-controls">
      <button class="finish-chip" type="button" data-finish>
        <span class="finish-chip__dot"></span>结束旅程
      </button>
      <div class="record-dock">
        <button class="record-action" type="button" data-photo>
          <span class="record-action__icon">${icon('camera', 23)}</span>
          <span class="record-action__label">照片</span>
          <span class="record-action__count" data-photo-count hidden>0</span>
        </button>
        <button class="record-main" type="button" data-pause aria-label="暂停记录">
          <span class="record-main__ring"></span>
          <span class="record-main__icon">${icon('pause', 25)}</span>
        </button>
        <button class="record-action" type="button" data-note>
          <span class="record-action__icon">${icon('note', 22)}</span>
          <span class="record-action__label">此刻</span>
        </button>
      </div>
    </div>

    <div class="locating-layer" data-locating>
      <div class="locating-card">
        <div class="locating-radar">
          <span class="locating-radar__ring"></span>
          <span class="locating-radar__ring"></span>
          <span class="locating-radar__dot">${icon('locate', 22)}</span>
        </div>
        <p class="eyebrow">GPS · 准备出发</p>
        <h2 data-locating-title>${needsHttps ? '手机定位需要 HTTPS' : '正在寻找你的位置'}</h2>
        <p class="locating-card__copy" data-locating-copy>${needsHttps
          ? '当前是 HTTP 局域网地址，浏览器会阻止定位。<br>可以先用示例体验，或按下方说明开启 HTTPS。'
          : '走到开阔一点的地方，等待几秒钟。<br>定位成功后，轨迹会自动开始记录。'}</p>
        ${needsHttps ? `<div class="locating-warning">${icon('lock', 13)} ${escapeHTML(originLabel)} 不是安全地址</div>` : ''}
        <div class="locating-card__actions">
          <button class="button button--primary button--small" type="button" data-retry hidden>重新定位</button>
          <button class="text-link" type="button" data-gps-help>${needsHttps ? '如何开启手机定位' : '为什么找不到位置？'}</button>
          <a class="text-link" href="#/trip/demo-westlake">先看看示例旅程 ${icon('arrowRight', 14)}</a>
        </div>
        <p class="locating-card__note">${icon('lock', 12)} 轨迹只保存在你的设备上</p>
      </div>
    </div>
  </div>`;

  const canvas = $('#record-canvas', root);
  const map = new TrailMap(canvas, {
    interactive: true,
    follow: true,
    theme: 'dawn',
    attribution: true,
    attributionInset: 168,
    basemap: 'streets',
    chrome: false,
    startEnd: true,
    moments: true,
    onInteract: () => {
      state.follow = false;
      recenter.hidden = false;
    },
    onMomentTap: (moment) => {
      const isVideo = moment.type === 'video' || moment.mediaType === 'video';
      const src = isVideo ? (moment.videoSrc || moment.src) : moment.src;
      if (src) openMediaPreview(src, isVideo ? 'video' : 'photo', moment.title || moment.text || '', moment.frames || []);
    },
  });
  map.setRoute(state.points, { progress: 1, moments: state.moments });
  map.startAnimation();

  const recenter = $('[data-recenter]', root);
  const locating = $('[data-locating]', root);
  const pill = $('[data-pill]', root);
  const recordState = $('[data-record-state]', root);
  const timerEl = $('[data-timer]', root);
  const timeEl = $('[data-time]', root);
  const distanceEl = $('[data-distance]', root);
  const paceEl = $('[data-pace]', root);
  const gpsEl = $('[data-gps]', root);
  const tipEl = $('[data-tip]', root);
  const pauseBtn = $('[data-pause]', root);
  const photoBtn = $('[data-photo]', root);
  const noteBtn = $('[data-note]', root);
  const finishBtn = $('[data-finish]', root);
  const photoCount = $('[data-photo-count]', root);

  let finished = false;
  let wasRecordingBeforeFinish = false;
  let recordingStarted = false;
  let tickTimer = null;
  let lastAccuracy = null;

  const recorder = new TrackRecorder({
    points: state.points,
    startedAt: state.startedAt,
    pausedMs: state.pausedMs,
    onLive: (position, accepted) => {
      if (!state.follow) map.setCurrent({ ...position });
      else {
        if (accepted || !map.current) {
          map.setCurrent({ ...position });
        } else {
          map.current = { ...position };
        }
      }
      if (position.accuracy != null) {
        lastAccuracy = position.accuracy;
        updateAccuracy(position.accuracy);
      }
    },
    onPoint: (point, first) => {
      if (first || state.points.length === 0) {
        state.startedAt = recorder.startedAt;
        map.setCamera({ lat: point.lat, lng: point.lng }, 15.8);
        map.setFollow(true);
        state.follow = true;
        map.setRoute(state.points, { progress: 1, moments: state.moments });
        map.setCurrent({ ...point });
        recordingStarted = true;
        locating.classList.add('is-hidden');
        toast('已开始记录，去发现沿途的风景吧', { type: 'success' });
        haptic([8, 40, 8]);
      } else {
        state.points.push(point);
        map.setRoute(state.points, { progress: 1, moments: state.moments });
        map.setCurrent({ ...point });
      }
      if (first && !state.points.includes(point)) state.points.push(point);
      updateStats();
      syncDraft();
    },
    onStatus: (status) => {
      if (status === 'locating') {
        recordState.textContent = '定位中';
        pill.classList.add('is-locating');
        locating.classList.remove('is-hidden');
      } else if (status === 'recording') {
        recordState.textContent = '记录中';
        pill.classList.remove('is-paused', 'is-locating');
        pauseBtn.innerHTML = `<span class="record-main__ring"></span><span class="record-main__icon">${icon('pause', 25)}</span>`;
        pauseBtn.setAttribute('aria-label', '暂停记录');
        locating.classList.add('is-hidden');
      } else if (status === 'paused') {
        recordState.textContent = '已暂停';
        pill.classList.add('is-paused');
        pauseBtn.innerHTML = `<span class="record-main__ring"></span><span class="record-main__icon">${icon('play', 25)}</span>`;
        pauseBtn.setAttribute('aria-label', '继续记录');
        toast('已暂停记录');
      }
    },
    onError: (error) => {
      showLocationError(error.message);
    },
  });

  if (state.points.length > 1) {
    recorder.startedAt = state.startedAt;
    map.setRoute(state.points, { progress: 1, moments: state.moments });
    if (state.points.length > 1) map.fitToRoute(state.points, { top: 190, right: 44, bottom: 230, left: 44 });
    locating.classList.add('is-hidden');
    recordingStarted = true;
    updateStats();
    toast('已恢复上次未完成的旅程', { type: 'success' });
  }

  function updateStats() {
    const distance = totalDistance(state.points);
    const elapsed = recorder.elapsedMs() / 1000;
    distanceEl.textContent = (distance / 1000).toFixed(2);
    timerEl.textContent = durationClock(elapsed);
    timeEl.textContent = durationClock(elapsed);
    paceEl.textContent = distance > 15 ? paceLabel(elapsed / (distance / 1000)) : '--\'--"';
    if (state.moments.length) {
      photoCount.hidden = false;
      photoCount.textContent = state.moments.length;
    }
  }

  function updateAccuracy(accuracy) {
    gpsEl.classList.remove('is-weak', 'is-ok');
    if (accuracy <= 20) {
      gpsEl.innerHTML = '<i></i>GPS 信号良好';
      gpsEl.classList.add('is-ok');
    } else if (accuracy <= 60) {
      gpsEl.innerHTML = '<i></i>GPS 信号一般';
    } else {
      gpsEl.innerHTML = '<i></i>GPS 信号较弱';
      gpsEl.classList.add('is-weak');
    }
  }

  function showLocationError(message) {
    locating.classList.remove('is-hidden');
    if (needsHttps) {
      $('[data-locating-title]', locating).textContent = '当前地址无法使用 GPS';
      $('[data-locating-copy]', locating).innerHTML = `手机浏览器只允许 <strong>HTTPS</strong> 或 <strong>localhost</strong> 获取位置。<br>你现在打开的是 ${escapeHTML(originLabel)}，可以先看示例，或点击下方了解解决方法。`;
      $('[data-retry]', locating).hidden = true;
    } else {
      $('[data-locating-title]', locating).textContent = '还没有找到你的位置';
      $('[data-locating-copy]', locating).innerHTML = `${escapeHTML(message)}<br>请检查定位权限、精确位置和 GPS 信号。`;
      $('[data-retry]', locating).hidden = false;
    }
    gpsEl.innerHTML = '<i></i>GPS 未连接';
    gpsEl.classList.add('is-weak');
  }

  function openGpsHelp() {
    const content = needsHttps
      ? `<div class="gps-help">
          <div class="gps-help__notice">${icon('lock', 15)} 浏览器把 HTTP 页面视为“不安全来源”，即使允许了权限，也会拒绝 GPS。</div>
          ${isIOS ? `<p class="gps-help__ios">iPhone / iPad 的 Safari 没有“忽略 HTTP 限制”的开关，必须使用 HTTPS 地址。</p>` : `<h3>Android Chrome 临时方案</h3>
          <ol>
            <li>在手机 Chrome 地址栏打开 <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
            <li>把选项设为 <strong>Enabled</strong></li>
            <li>在下方文本框填入 <code>${escapeHTML(originLabel)}</code></li>
            <li>重启 Chrome，重新打开应用并允许位置权限</li>
          </ol>`}
          <h3>推荐：使用 HTTPS</h3>
          <p>把项目部署到 Vercel、Netlify、GitHub Pages 等静态托管，用 HTTPS 地址在手机上打开。定位、相机和视频导出都会正常。</p>
          <h3>Android USB 调试</h3>
          <p>连接 USB 并开启调试后，在电脑执行 <code>adb reverse tcp:4173 tcp:4173</code>，手机访问 <code>http://localhost:4173</code>。localhost 属于安全上下文。</p>
          <p class="gps-help__foot">${icon('info', 12)} 当前只影响“真实记录”；示例旅程、轨迹浏览和 Vlog 导出仍可使用。</p>
        </div>`
      : `<div class="gps-help">
          <div class="gps-help__notice">${icon('info', 15)} 当前地址已是安全上下文，定位失败通常与权限或信号有关。</div>
          <h3>检查手机设置</h3>
          <ol>
            <li>在浏览器站点设置中允许“位置”，并开启“精确位置”。</li>
            <li>到室外或窗边，关闭省电模式，等待 10–30 秒。</li>
            <li>确认系统定位服务已开启，其他地图 App 能正常定位。</li>
            <li>仍然失败时，刷新页面或重新允许定位权限后再试。</li>
          </ol>
          <p class="gps-help__foot">${icon('lock', 12)} 位置只在你的设备上处理，不会上传。</p>
        </div>`;
    openSheet({
      title: needsHttps ? '手机定位需要 HTTPS' : '为什么找不到位置？',
      subtitle: originLabel,
      content,
    });
  }

  function syncDraft() {
    if (!state.startedAt) return;
    saveDraftState({
      startedAt: state.startedAt,
      pausedMs: recorder.pausedMs,
      points: state.points,
      moments: state.moments,
      title: state.title,
    });
  }

  function currentCapture() {
    const live = recorder.lastRaw || state.points[state.points.length - 1];
    if (!live) return null;
    return {
      lat: live.lat,
      lng: live.lng,
      accuracy: live.accuracy ?? null,
      t: Date.now(),
    };
  }

  function momentLocationText(capture) {
    const name = inDemoArea(capture) ? '杭州 · 西湖' : '当前位置';
    return `${name} · ${formatClock(capture.t)}`;
  }

  function addMoment(moment) {
    moment.id = uid('moment');
    moment.order = state.moments.length + 1;
    moment.distance = totalDistance(state.points);
    state.moments.push(moment);
    state.moments.sort((a, b) => a.t - b.t);
    state.moments.forEach((m, i) => { m.order = i + 1; });
    map.setMoments(state.moments);
    syncDraft();
    updateStats();
    haptic(12);
    toast(`第 ${moment.order} 个瞬间，已标记在轨迹上`, { type: 'success' });
  }

  function openMomentCreator(mode) {
    if (!currentCapture()) {
      toast('还没定位成功，稍等一下再记录吧');
      if (locating.classList.contains('is-hidden')) locating.classList.remove('is-hidden');
      return;
    }
    const capture = currentCapture();
    const context = {
      capture,
      mode,
      media: null,
      mood: '',
      text: '',
      closed: false,
    };

    const handle = openSheet({
      title: mode === 'note' ? '留住此刻的心情' : '记录这一刻',
      subtitle: momentLocationText(capture),
      className: 'moment-sheet',
      content: '<div data-moment-body></div>',
      onMount: (sheet) => {
        renderMediaPicker(sheet.body.querySelector('[data-moment-body]'), context, handleClose);
      },
      onClose: () => { context.closed = true; },
    });

    function handleClose() {
      handle?.close();
    }
  }

  function renderMediaPicker(container, context, close) {
    container.innerHTML = `
      <div class="capture-options">
        <button class="capture-option capture-option--primary" type="button" data-camera>
          <span class="capture-option__icon">${icon('camera', 25)}</span>
          <span class="capture-option__text"><strong>拍摄照片</strong><small>打开相机，定格眼前的风景</small></span>
          <span class="capture-option__chev">${icon('chevron', 18)}</span>
        </button>
        <button class="capture-option" type="button" data-camera-video>
          <span class="capture-option__icon">${icon('video', 24)}</span>
          <span class="capture-option__text"><strong>录制视频</strong><small>直接用相机录一段现场画面</small></span>
          <span class="capture-option__chev">${icon('chevron', 18)}</span>
        </button>
        <button class="capture-option" type="button" data-gallery>
          <span class="capture-option__icon">${icon('image', 24)}</span>
          <span class="capture-option__text"><strong>照片或视频</strong><small>从相册里选一段刚拍下的画面</small></span>
          <span class="capture-option__chev">${icon('chevron', 18)}</span>
        </button>
        <button class="capture-option capture-option--note" type="button" data-write>
          <span class="capture-option__icon">${icon('note', 22)}</span>
          <span class="capture-option__text"><strong>只写文字</strong><small>把此刻的心情留在这里</small></span>
          <span class="capture-option__chev">${icon('chevron', 18)}</span>
        </button>
      </div>
      <p class="capture-footnote">${icon('pin', 12)} 会自动记录当前位置与时间</p>
      <input type="file" accept="image/*" capture="environment" data-camera-input hidden>
      <input type="file" accept="video/*" capture="environment" data-camera-video-input hidden>
      <input type="file" accept="image/*,video/*" data-gallery-input hidden>
    `;
    const cameraInput = container.querySelector('[data-camera-input]');
    const cameraVideoInput = container.querySelector('[data-camera-video-input]');
    const galleryInput = container.querySelector('[data-gallery-input]');
    container.querySelector('[data-camera]').addEventListener('click', () => cameraInput.click());
    container.querySelector('[data-camera-video]').addEventListener('click', () => cameraVideoInput.click());
    container.querySelector('[data-gallery]').addEventListener('click', () => galleryInput.click());
    container.querySelector('[data-write]').addEventListener('click', () => {
      close();
      setTimeout(() => openNoteEditor(), 180);
    });
    cameraInput.addEventListener('change', () => handleFile(cameraInput.files?.[0], container, context, close));
    cameraVideoInput.addEventListener('change', () => handleFile(cameraVideoInput.files?.[0], container, context, close));
    galleryInput.addEventListener('change', () => handleFile(galleryInput.files?.[0], container, context, close));
  }

  async function handleFile(file, container, context, close) {
    if (!file) return;
    const allowed = file.type.startsWith('image/') || isVideoFile(file);
    if (!allowed) {
      toast('请选择照片或视频文件', { type: 'error' });
      return;
    }
    if (file.size > 280 * 1024 * 1024) {
      toast('文件太大，请选择 280MB 以内的视频', { type: 'error' });
      return;
    }
    container.innerHTML = `<div class="processing">
      <span class="processing__spinner"></span>
      <strong>正在整理这段画面…</strong>
      <small>${escapeHTML(file.type.startsWith('video/') ? '视频会保留在设备上，并提取一帧封面' : '正在压缩照片')}</small>
      <span class="processing__size">${formatBytes(file.size)}</span>
    </div>`;
    try {
      const media = await processMediaFile(file, tripId);
      context.media = media;
      if (context.mode === 'note') {
        close();
        setTimeout(() => openNoteEditor(media), 160);
      } else {
        renderMediaEditor(container, context, close);
      }
    } catch (error) {
      console.error(error);
      toast(error.message || '文件处理失败', { type: 'error', duration: 3200 });
      renderMediaPicker(container, context, close);
    }
  }

  function renderMediaEditor(container, context, close) {
    const media = context.media;
    container.innerHTML = `
      <div class="media-editor">
        <div class="media-editor__preview">
          ${media.type === 'video'
            ? `<video src="${media.src}" controls playsinline muted></video>`
            : `<img src="${media.src}" alt="刚刚拍摄的画面" />`}
          <span class="media-editor__badge">${media.type === 'video' ? icon('video', 12) + ' 视频' : icon('camera', 12) + ' 照片'}</span>
        </div>
        <div class="media-editor__meta">
          ${icon('pin', 13)}
          <span>${escapeHTML(momentLocationText(context.capture))}</span>
          <span class="dot"></span>
          <span>${coordLabel(context.capture)}</span>
        </div>
        <textarea class="textarea" data-caption maxlength="160" placeholder="此刻，想记住什么？（可选）"></textarea>
        <div class="editor-actions">
          <button class="button button--ghost button--small" type="button" data-reselect>重新选择</button>
          <button class="button button--primary" type="button" data-save>保存这一刻</button>
        </div>
      </div>`;
    container.querySelector('[data-reselect]').addEventListener('click', () => {
      close();
      setTimeout(() => openMomentCreator('photo'), 160);
    });
    container.querySelector('[data-save]').addEventListener('click', () => {
      const text = container.querySelector('[data-caption]').value.trim();
      addMoment({
        type: media.type,
        text,
        title: text ? text.slice(0, 18) : (media.type === 'video' ? '一段画面' : '沿途的风景'),
        lat: context.capture.lat,
        lng: context.capture.lng,
        t: context.capture.t,
        accuracy: context.capture.accuracy,
        mediaId: media.mediaId,
        src: media.src,
        thumbUrl: media.thumbUrl,
        videoSrc: media.type === 'video' ? media.src : null,
        mediaWidth: media.width,
        mediaHeight: media.height,
        mediaDuration: media.duration,
        frames: media.frames || [],
      });
      close();
    });
  }

  function openNoteEditor(media = null) {
    if (!currentCapture()) {
      toast('还没定位成功，稍等一下再记录吧');
      return;
    }
    const capture = currentCapture();
    const context = { capture, media, mood: '', mode: 'note' };
    let handle;
    handle = openSheet({
      title: '此刻，你在想什么？',
      subtitle: `${momentLocationText(capture)} · 写下这一刻`,
      className: 'note-sheet',
      content: `
        <div class="note-editor">
          <div class="note-editor__prompt">“</div>
          <textarea class="note-textarea" data-note-text maxlength="400" placeholder="风从哪里来，光落在哪里，此刻的心情……"></textarea>
          <div class="mood-row" data-moods>
            ${['平静', '开心', '松弛', '惊叹', '疲惫', '满足'].map((m) => `<button type="button" class="mood-chip" data-mood="${m}">${m}</button>`).join('')}
          </div>
          <div class="note-attach" data-attach-area>
            ${media ? mediaPreviewMarkup(media) : emptyAttachMarkup()}
          </div>
          <div class="moment-location">${icon('pin', 13)} ${escapeHTML(momentLocationText(capture))} · ${coordLabel(capture)}</div>
          <button class="button button--primary button--full" type="button" data-save-note>保存此刻</button>
          <input type="file" accept="image/*" capture="environment" data-note-camera hidden>
          <input type="file" accept="image/*,video/*" data-note-gallery hidden>
        </div>`,
      onMount: (sheet) => {
        const textarea = sheet.body.querySelector('[data-note-text]');
        const area = sheet.body.querySelector('[data-attach-area]');
        const cameraInput = sheet.body.querySelector('[data-note-camera]');
        const galleryInput = sheet.body.querySelector('[data-note-gallery]');
        sheet.body.querySelectorAll('[data-mood]').forEach((button) => {
          button.addEventListener('click', () => {
            const wasActive = button.classList.contains('is-active');
            sheet.body.querySelectorAll('[data-mood]').forEach((b) => b.classList.remove('is-active'));
            if (!wasActive) {
              button.classList.add('is-active');
              context.mood = button.dataset.mood;
            } else {
              context.mood = '';
            }
          });
        });
        cameraInput?.addEventListener('change', async () => {
          const file = cameraInput.files?.[0];
          if (file) await attachMedia(file, sheet.body, context);
          cameraInput.value = '';
        });
        galleryInput?.addEventListener('change', async () => {
          const file = galleryInput.files?.[0];
          if (file) await attachMedia(file, sheet.body, context);
          galleryInput.value = '';
        });
        // Delegated so the attach buttons keep working after a picture is
        // added, removed, and added again.
        sheet.body.addEventListener('click', (event) => {
          if (event.target.closest('[data-attach-photo]')) {
            cameraInput?.click();
            return;
          }
          if (event.target.closest('[data-attach-video]')) {
            galleryInput?.click();
            return;
          }
          if (event.target.closest('[data-remove-attach]')) {
            context.media = null;
            area.innerHTML = emptyAttachMarkup();
          }
        });
        sheet.body.querySelector('[data-save-note]').addEventListener('click', () => {
          const text = textarea.value.trim();
          if (!text && !context.media) {
            toast('写一点什么，或者加一张照片吧');
            textarea.focus();
            return;
          }
          addMoment({
            type: 'note',
            text,
            title: text ? text.slice(0, 22) : '留一段心情',
            mood: context.mood,
            lat: capture.lat,
            lng: capture.lng,
            t: capture.t,
            accuracy: capture.accuracy,
            mediaId: context.media?.mediaId || null,
            src: context.media?.src || null,
            thumbUrl: context.media?.thumbUrl || null,
            videoSrc: context.media?.type === 'video' ? context.media.src : null,
            mediaWidth: context.media?.width || null,
            mediaHeight: context.media?.height || null,
            mediaDuration: context.media?.duration || null,
            mediaType: context.media?.type || null,
            frames: context.media?.frames || [],
          });
          handle?.close();
        });
      },
    });
  }

  function mediaPreviewMarkup(media) {
    return `<div class="note-attach__preview">
      ${media.type === 'video' ? `<video src="${media.src}" muted playsinline></video>` : `<img src="${media.src}" alt="附加照片" />`}
      <span class="note-attach__badge">${media.type === 'video' ? '视频' : '照片'}已添加</span>
      <button type="button" class="note-attach__remove" data-remove-attach aria-label="移除">${icon('close', 13)}</button>
    </div>`;
  }

  function emptyAttachMarkup() {
    return `<div class="note-attach__empty">
      <span>想让画面一起出现？</span>
      <button type="button" class="text-link" data-attach-photo>${icon('camera', 13)} 照片</button>
      <button type="button" class="text-link" data-attach-video>${icon('video', 13)} 视频</button>
    </div>`;
  }

  async function attachMedia(file, body, context) {
    const allowed = file.type.startsWith('image/') || isVideoFile(file);
    if (!allowed || file.size > 280 * 1024 * 1024) {
      toast('请选择 280MB 以内的照片或视频', { type: 'error' });
      return;
    }
    const area = body.querySelector('[data-attach-area]');
    area.innerHTML = `<div class="note-attach__processing"><span class="spinner"></span> 正在处理画面…</div>`;
    try {
      const media = await processMediaFile(file, tripId);
      context.media = media;
      area.innerHTML = mediaPreviewMarkup(media);
    } catch (error) {
      toast(error.message || '画面处理失败', { type: 'error' });
      area.innerHTML = emptyAttachMarkup();
    }
  }

  function openFinishSheet() {
    if (state.points.length < 1) {
      confirmSheet({
        title: '还没有记录到轨迹',
        message: '定位可能还在搜索中。你可以回到地图继续等待，或者结束这次记录。',
        confirmText: '结束记录',
        cancelText: '继续等待',
      }).then((yes) => {
        if (yes) {
          recorder.stop();
          clearDraft();
          ctx.navigate('/');
        }
      });
      return;
    }
    wasRecordingBeforeFinish = recorder.isRecording;
    if (wasRecordingBeforeFinish) recorder.pause();
    updateStats();
    const stats = statsFor(state.points, {
      startedAt: recorder.startedAt || state.startedAt,
      endedAt: Date.now(),
      movingSec: recorder.elapsedMs() / 1000,
    });
    const defaultTitle = state.title || suggestTitle();
    let saved = false;
    const handle = openSheet({
      title: '要结束这段旅程了吗？',
      subtitle: '轨迹与沿途瞬间会一起保存下来',
      className: 'finish-sheet',
      content: `
        <div class="finish-summary">
          <div><strong>${(stats.distance / 1000).toFixed(2)}</strong><span>公里</span></div>
          <div><strong>${escapeHTML(durationClock(stats.duration))}</strong><span>用时</span></div>
          <div><strong>${state.moments.length}</strong><span>个瞬间</span></div>
        </div>
        <label class="field finish-title">
          <span class="field__label">给这段旅程起个名字 <span class="field__hint">最多 24 个字</span></span>
          <input class="input" data-title maxlength="24" value="${escapeHTML(defaultTitle)}" />
        </label>
        <p class="finish-note">${icon('sparkles', 13)} 保存后，可以用地图轨迹和这些瞬间生成一支运动 Vlog。</p>
        <div class="sheet-actions">
          <button class="button button--ghost" type="button" data-discard>放弃</button>
          <button class="button button--primary" type="button" data-save>保存旅程</button>
        </div>
        <button class="finish-generate" type="button" data-save-generate>保存并直接生成 Vlog ${icon('arrowRight', 14)}</button>`,
      onMount: (sheet) => {
        const titleInput = sheet.body.querySelector('[data-title]');
        setTimeout(() => titleInput?.select(), 250);
        sheet.body.querySelector('[data-save]').addEventListener('click', (event) => {
          saved = true;
          persistTrip(titleInput.value.trim() || defaultTitle, false, event.currentTarget);
        });
        sheet.body.querySelector('[data-save-generate]').addEventListener('click', (event) => {
          saved = true;
          persistTrip(titleInput.value.trim() || defaultTitle, true, event.currentTarget);
        });
        sheet.body.querySelector('[data-discard]').addEventListener('click', async () => {
          const yes = await confirmSheet({
            title: '放弃这段旅程？',
            message: '这次的轨迹和沿途记录将被删除，无法恢复。',
            confirmText: '放弃',
            cancelText: '再想想',
            danger: true,
          });
          if (yes) {
            saved = true;
            recorder.stop();
            clearDraft();
            handle?.close();
            ctx.navigate('/');
          }
        });
      },
      onClose: () => {
        if (!saved && !finished && wasRecordingBeforeFinish) {
          recorder.resume();
          wasRecordingBeforeFinish = false;
        }
      },
    });
  }

  async function persistTrip(title, generate, button) {
    setButtonLoading(button, true, generate ? '准备 Vlog' : '保存中');
    try {
      const endedAt = Date.now();
      if (state.points.length === 0) throw new Error('还没有轨迹点');
      state.points[state.points.length - 1].t = Math.max(endedAt, state.points[state.points.length - 1].t);
      const stats = statsFor(state.points, {
        startedAt: recorder.startedAt || state.startedAt,
        endedAt,
        movingSec: Math.max(1, recorder.elapsedMs() / 1000),
      });
      const mediaMoment = state.moments.find((m) => m.mediaId);
      const persistentMoments = state.moments.map((moment) => {
        const copy = { ...moment };
        delete copy.src;
        delete copy.thumbUrl;
        delete copy.videoSrc;
        return copy;
      });
      const trip = {
        id: tripId,
        title,
        subtitle: state.moments.length ? `${state.moments.length} 个沿途瞬间 · ${locationNameFor(state.points[0])}` : locationNameFor(state.points[0]),
        locationName: locationNameFor(state.points[0]),
        description: state.moments.find((m) => m.text)?.text || '一段用脚步写下的旅程。',
        activity: '徒步',
        startedAt: recorder.startedAt || state.startedAt,
        endedAt,
        points: state.points,
        moments: persistentMoments,
        stats,
        cover: null,
        coverMediaId: mediaMoment?.mediaId || null,
        theme: suggestedTheme(),
        createdAt: endedAt,
        updatedAt: endedAt,
      };
      await saveTrip(trip);
      await requestPersistence();
      finished = true;
      recorder.stop();
      clearDraft();
      closeSheet();
      haptic([10, 50, 14]);
      setTimeout(() => {
        map.destroy();
        ctx.navigate(generate ? `/export/${trip.id}` : `/trip/${trip.id}`);
      }, 200);
    } catch (error) {
      console.error(error);
      setButtonLoading(button, false);
      toast(error.message || '保存失败，请稍后再试', { type: 'error', duration: 3200 });
    }
  }

  function requestExit() {
    if (finished) return;
    if (state.points.length < 1) {
      recorder.stop();
      clearDraft();
      map.destroy();
      ctx.navigate('/');
      return;
    }
    wasRecordingBeforeFinish = recorder.isRecording;
    if (wasRecordingBeforeFinish) recorder.pause();
    let leave = false;
    const handle = openSheet({
      title: '先回到哪一段路？',
      subtitle: '这次旅程还没有结束',
      content: `
        <div class="exit-options">
          <button class="exit-option" type="button" data-continue>
            <span class="exit-option__icon">${icon('footprints', 22)}</span>
            <span><strong>继续记录</strong><small>回到地图，接着走</small></span>
            ${icon('chevron', 18)}
          </button>
          <button class="exit-option" type="button" data-save>
            <span class="exit-option__icon">${icon('check', 21)}</span>
            <span><strong>结束并保存</strong><small>保留轨迹与 ${state.moments.length} 个瞬间</small></span>
            ${icon('chevron', 18)}
          </button>
          <button class="exit-option exit-option--danger" type="button" data-discard>
            <span class="exit-option__icon">${icon('trash', 20)}</span>
            <span><strong>放弃这次记录</strong><small>不会保存任何内容</small></span>
            ${icon('chevron', 18)}
          </button>
        </div>`,
      onMount: (sheet) => {
        sheet.body.querySelector('[data-continue]').addEventListener('click', () => {
          leave = true;
          handle?.close();
          if (wasRecordingBeforeFinish) recorder.resume();
          wasRecordingBeforeFinish = false;
        });
        sheet.body.querySelector('[data-save]').addEventListener('click', () => {
          leave = true;
          handle?.close();
          setTimeout(openFinishSheet, 180);
          if (wasRecordingBeforeFinish) recorder.resume();
          wasRecordingBeforeFinish = false;
        });
        sheet.body.querySelector('[data-discard]').addEventListener('click', async () => {
          const yes = await confirmSheet({
            title: '真的放弃吗？',
            message: '轨迹和沿途记录会一起删除。',
            confirmText: '放弃记录',
            cancelText: '继续旅程',
            danger: true,
          });
          if (yes) {
            leave = true;
            finished = true;
            recorder.stop();
            clearDraft();
            map.destroy();
            handle?.close();
            ctx.navigate('/');
          }
        });
      },
      onClose: () => {
        if (!leave && !finished && wasRecordingBeforeFinish) {
          recorder.resume();
          wasRecordingBeforeFinish = false;
        }
      },
    });
  }

  // Events.
  $('[data-exit]', root).addEventListener('click', requestExit);
  $('[data-layer]', root).addEventListener('click', () => {
    state.basemap = state.basemap === 'sketch'
      ? 'streets'
      : state.basemap === 'streets' ? 'satellite' : 'sketch';
    map.setBasemap(state.basemap);
    toast(
      state.basemap === 'streets'
        ? '正在加载标准地图 · 无网络时自动显示手绘轨迹'
        : state.basemap === 'satellite'
          ? '正在加载卫星地图 · 需要网络'
          : '已切换手绘轨迹图',
    );
  });
  photoBtn.addEventListener('click', () => openMomentCreator('photo'));
  noteBtn.addEventListener('click', () => openNoteEditor());
  finishBtn.addEventListener('click', openFinishSheet);
  pauseBtn.addEventListener('click', () => {
    if (!recordingStarted) {
      toast('定位成功后会自动开始记录');
      return;
    }
    if (recorder.isPaused) {
      recorder.resume();
      updateStats();
    } else {
      recorder.pause();
      updateStats();
    }
  });
  recenter.addEventListener('click', () => {
    state.follow = true;
    map.setFollow(true);
    if (recorder.lastRaw) map.setCamera(recorder.lastRaw, 15.8);
    map.setCurrent(recorder.lastRaw || state.points[state.points.length - 1]);
    recenter.hidden = true;
  });
  $('[data-retry]', locating).addEventListener('click', () => {
    $('[data-retry]', locating).hidden = true;
    $('[data-locating-title]', locating).textContent = '正在寻找你的位置';
    $('[data-locating-copy]', locating).innerHTML = '走到开阔一点的地方，等待几秒钟。<br>定位成功后，轨迹会自动开始记录。';
    recorder.start().catch((error) => showLocationError(error.message));
  });
  $('[data-gps-help]', locating).addEventListener('click', openGpsHelp);

  if (state.points.length > 1) {
    // Resuming a draft should not start a second concurrent watcher.
    recorder.start().catch((error) => showLocationError(error.message));
  } else {
    recorder.start().catch((error) => showLocationError(error.message));
  }

  if (needsHttps) {
    setTimeout(() => {
      if (!recordingStarted) showLocationError('当前页面不是安全上下文');
    }, 1800);
  }

  tickTimer = setInterval(updateStats, 1000);
  setTimeout(() => tipEl.classList.add('is-hidden'), 6500);

  const onBeforeUnload = (event) => {
    if (!finished && state.points.length > 0) {
      syncDraft();
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    destroy() {
      finished = true;
      clearInterval(tickTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (recorder.state !== 'stopped') recorder.abandon();
      map.destroy();
    },
  };
}
