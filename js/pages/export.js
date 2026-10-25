import { loadTrip } from '../data.js';
import { getLatestExport, saveExport, deleteExport } from '../db.js';
import { hydrateTrip } from '../media.js';
import { VlogComposer, exportVlog, pickMimeType, safeFilename } from '../vlog.js';
import { THEME_LIST, getTheme } from '../themes.js';
import { downloadBlob, shareBlobFile, formatBytes } from '../media.js';
import { AmbientScore } from '../audio.js';
import { icon } from '../icons.js';
import { escapeHTML, toast, openSheet } from '../ui.js';
import { formatDate, durationClock } from '../geo.js';

function renderOverlay(composer, onCancel) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="render-overlay">
    <div class="render-visual">
      <div class="render-orbit render-orbit--one"></div>
      <div class="render-orbit render-orbit--two"></div>
      <div class="render-core">${icon('sparkles', 30)}</div>
    </div>
    <p class="eyebrow">RENDERING YOUR FILM</p>
    <h2>正在剪一支片子</h2>
    <p class="render-copy" data-render-copy>把走过的路和沿途的光，慢慢拼在一起。</p>
    <div class="render-progress"><span data-render-bar></span></div>
    <div class="render-meta">
      <span data-render-time>00:00</span>
      <span>约 ${Math.ceil(composer.duration)} 秒</span>
    </div>
    <button class="render-cancel" type="button" data-render-cancel>取消生成</button>
  </div>`;
  document.body.classList.add('sheet-open');
  root.classList.add('is-open');
  requestAnimationFrame(() => root.querySelector('.render-overlay')?.classList.add('is-visible'));
  root.querySelector('[data-render-cancel]').addEventListener('click', onCancel);
  return {
    update(progress, elapsed) {
      const bar = root.querySelector('[data-render-bar]');
      if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
      const time = root.querySelector('[data-render-time]');
      if (time) time.textContent = `${durationClock(elapsed)} / ${durationClock(composer.duration)}`;
      const copy = root.querySelector('[data-render-copy]');
      if (copy) {
        if (progress < 0.18) copy.textContent = '把走过的路和沿途的光，慢慢拼在一起。';
        else if (progress < 0.72) copy.textContent = '轨迹正在向前延伸，经过你的每一个瞬间。';
        else copy.textContent = '快好了，最后一点光影正在落版。';
      }
    },
    close() {
      const overlay = root.querySelector('.render-overlay');
      overlay?.classList.remove('is-visible');
      document.body.classList.remove('sheet-open');
      setTimeout(() => {
        if (!overlay?.isConnected) return;
        overlay.remove();
        if (!root.querySelector('.sheet') && !root.children.length) {
          root.classList.remove('is-open');
        }
      }, 260);
    },
  };
}

function resultSheet({ record, url, trip, onRegenerate }) {
  const filename = `迹忆-${safeFilename(trip.title)}-${record.extension === 'mp4' ? 'mp4' : 'webm'}`;
  const handle = openSheet({
    title: '你的运动 Vlog 已经剪好',
    subtitle: `${Math.ceil(record.duration || 0)} 秒 · ${formatBytes(record.size || record.blob?.size || 0)} · 9:16 竖屏`,
    className: 'vlog-result-sheet',
    content: `<div class="vlog-result">
      <video class="vlog-result__video" src="${url}" controls playsinline autoplay></video>
      <div class="vlog-result__actions">
        <button class="button button--primary" type="button" data-download>${icon('download', 17)} 保存到相册 / 下载</button>
        <button class="button button--ghost" type="button" data-share>${icon('share', 16)} 分享</button>
      </div>
      <button class="vlog-result__regen" type="button" data-regen>调整色调或配乐，重新生成 ${icon('refresh', 14)}</button>
      <p class="vlog-result__tip">${icon('info', 12)} 在手机上，下载的视频通常保存在「文件」或浏览器的下载目录；也可以直接分享到微信 / 相册。</p>
    </div>`,
    onMount: (sheet) => {
      sheet.body.querySelector('[data-download]').addEventListener('click', () => {
        downloadBlob(record.blob, filename);
        toast('已开始下载视频', { type: 'success' });
      });
      sheet.body.querySelector('[data-share]').addEventListener('click', async () => {
        const shared = await shareBlobFile(record.blob, filename, trip.title, '我的迹忆运动 Vlog');
        if (!shared) {
          downloadBlob(record.blob, filename);
          toast('已保存视频，可分享到相册或微信');
        }
      });
      sheet.body.querySelector('[data-regen]').addEventListener('click', () => {
        handle.close();
        onRegenerate?.();
      });
    },
  });
  return handle;
}

function resultMarkup(record, url) {
  return `<section class="export-existing" data-existing>
    <div class="export-existing__head">
      <div><p class="eyebrow">LATEST VLOG</p><h2>已经生成过一支</h2></div>
      <span class="tag">${formatBytes(record.size || record.blob?.size || 0)}</span>
    </div>
    <div class="export-existing__body">
      <video src="${url}" controls playsinline preload="metadata"></video>
      <div class="export-existing__actions">
        <button class="text-link" type="button" data-open-result>播放 / 分享 ${icon('arrowRight', 14)}</button>
        <button class="text-link" type="button" data-delete-export>删除视频</button>
      </div>
    </div>
  </section>`;
}

export async function renderExport(root, ctx) {
  const storedTrip = await loadTrip(ctx.params[0]);
  const trip = storedTrip ? await hydrateTrip(storedTrip, { extractFrames: true }) : null;
  if (!trip) {
    root.innerHTML = `<div class="screen"><div class="fatal-error"><span>NOT FOUND</span><h1>这段旅程找不到了</h1><p>它可能已经被删除。</p><a class="button button--primary" href="#/">回到首页</a></div></div>`;
    return { destroy() {} };
  }

  const theme = getTheme(trip.theme || 'dawn');
  const supported = typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream;
  let latestExport = await getLatestExport(trip.id).catch(() => null);
  let latestUrl = latestExport?.blob ? URL.createObjectURL(latestExport.blob) : null;
  let selectedTheme = theme.id;
  let music = true;
  let selectedMusic = 'dawn';
  let auditionScore = null;
  let auditionTimer = null;
  let exporting = false;
  let aborter = null;
  let composer = null;
  let resultUrl = null;

  root.innerHTML = `<div class="screen export-screen">
    <header class="export-topbar">
      <a class="icon-button" href="#/trip/${encodeURIComponent(trip.id)}" aria-label="返回旅程">${icon('back', 20)}</a>
      <div class="export-topbar__title"><span>运动 Vlog</span><small>${escapeHTML(trip.title)}</small></div>
      <button class="icon-button" type="button" data-info aria-label="导出说明">${icon('info', 20)}</button>
    </header>

    <section class="export-intro">
      <p class="eyebrow">TURN THE ROUTE INTO A FILM</p>
      <h1>把这段路，<br><em>剪成一支片子。</em></h1>
      <p class="export-intro__copy">轨迹会沿着地图生长，经过每一个照片与心情停下的位置。约 ${Math.ceil(0)} 秒，9:16 竖屏。</p>
    </section>

    <section class="vlog-stage-wrap">
      <div class="vlog-stage">
        <canvas id="vlog-canvas" aria-label="运动 Vlog 预览"></canvas>
        <span class="vlog-stage__badge">9:16 · VLOG</span>
        <div class="vlog-stage__loading" data-stage-loading><span class="spinner"></span>正在准备画面</div>
      </div>
      <div class="vlog-stage__meta">
        <span>${icon('route', 13)} ${escapeHTML(trip.locationName || '我的旅程')}</span>
        <span data-duration-label>约 0 秒</span>
      </div>
    </section>

    <section class="export-panel">
      <div class="export-panel__label"><span>情绪色调</span><small>换一种方式记住今天</small></div>
      <div class="theme-options">
        ${THEME_LIST.map((item) => `<button class="theme-option ${item.id === selectedTheme ? 'is-active' : ''}" type="button" data-theme="${item.id}">
          <span class="theme-option__swatch theme-option__swatch--${item.id}"><i></i></span>
          <span class="theme-option__name">${item.name}</span>
          <span class="theme-option__caption">${item.caption}</span>
        </button>`).join('')}
      </div>

      <div class="music-row">
        <span class="music-row__icon">${icon('music', 19)}</span>
        <div class="music-row__text">
          <strong>氛围配乐</strong>
          <small>浏览器实时合成的轻柔环境音</small>
        </div>
        <button class="switch ${music ? 'is-on' : ''}" type="button" role="switch" aria-checked="${music}" data-music><span></span></button>
      </div>
      <div class="music-options" data-music-options>
        <button class="music-chip ${selectedMusic === 'dawn' ? 'is-active' : ''}" type="button" data-music-style="dawn">晨雾</button>
        <button class="music-chip ${selectedMusic === 'forest' ? 'is-active' : ''}" type="button" data-music-style="forest">林间</button>
        <button class="music-chip ${selectedMusic === 'night' ? 'is-active' : ''}" type="button" data-music-style="night">夜行</button>
        <button class="music-audition" type="button" data-audition>${icon('play', 11)} 试听</button>
      </div>
    </section>

    <div class="export-unsupported ${supported ? '' : 'is-visible'}" data-unsupported>
      ${icon('info', 16)} 当前浏览器不支持画布视频录制。请使用 Chrome / Edge，或从手机系统浏览器打开。
    </div>

    <button class="button button--primary button--full export-action" type="button" data-generate ${supported ? '' : 'disabled'}>
      <span class="export-action__icon">${icon('sparkles', 18)}</span>
      <span data-generate-label>生成运动 Vlog</span>
      <span class="export-action__duration">约 ${Math.ceil(0)} 秒</span>
    </button>
    <p class="export-disclaimer">${icon('lock', 12)} 视频在你的设备上本地合成，不会上传到任何服务器。</p>

    <div data-result-holder>${latestExport && latestUrl ? resultMarkup(latestExport, latestUrl) : ''}</div>

    <footer class="export-foot">
      <span class="line"></span>
      <p>每一段路，都值得被重新走一遍。</p>
    </footer>
  </div>`;

  const canvas = root.querySelector('#vlog-canvas');
  const loading = root.querySelector('[data-stage-loading]');
  const generateButton = root.querySelector('[data-generate]');
  const generateLabel = root.querySelector('[data-generate-label]');
  const durationLabels = root.querySelectorAll('[data-duration-label], .export-intro p, .export-action__duration');
  const resultHolder = root.querySelector('[data-result-holder]');

  try {
    composer = new VlogComposer({ canvas, trip, themeId: selectedTheme });
    await composer.prepare();
    // The intro starts from black; show its title card as the poster frame.
    composer.renderAt(Math.min(2.6, composer.timeline.intro * 0.7));
    loading?.classList.add('is-hidden');
    root.querySelectorAll('[data-duration-label]').forEach((el) => { el.textContent = `约 ${Math.ceil(composer.duration)} 秒`; });
    const introCopy = root.querySelector('.export-intro__copy');
    if (introCopy) introCopy.textContent = `轨迹会沿着地图生长，经过每一个照片与心情停下的位置。约 ${Math.ceil(composer.duration)} 秒，9:16 竖屏。`;
    const actionDuration = root.querySelector('.export-action__duration');
    if (actionDuration) actionDuration.textContent = `约 ${Math.ceil(composer.duration)} 秒`;
  } catch (error) {
    console.error(error);
    if (loading) loading.innerHTML = `<span class="export-stage-error">预览加载失败<br><small>${escapeHTML(error.message || '')}</small></span>`;
    if (generateButton) generateButton.disabled = true;
  }

  function setResult(record) {
    latestExport = record;
    if (latestUrl) URL.revokeObjectURL(latestUrl);
    latestUrl = URL.createObjectURL(record.blob);
    resultHolder.innerHTML = resultMarkup(record, latestUrl);
    bindResultActions();
  }

  function bindResultActions() {
    const holder = resultHolder;
    holder.querySelector('[data-open-result]')?.addEventListener('click', () => {
      if (!latestExport || !latestUrl) return;
      resultSheet({
        record: latestExport,
        url: latestUrl,
        trip,
        onRegenerate: () => generateButton?.click(),
      });
    });
    holder.querySelector('[data-delete-export]')?.addEventListener('click', async () => {
      if (!latestExport) return;
      await deleteExport(latestExport.id);
      if (latestUrl) URL.revokeObjectURL(latestUrl);
      latestUrl = null;
      latestExport = null;
      resultHolder.innerHTML = '';
      toast('视频已删除');
    });
  }
  bindResultActions();

  root.querySelectorAll('[data-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedTheme = button.dataset.theme;
      root.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-active', b === button));
      composer?.setTheme(selectedTheme);
    });
  });

  function syncMusicUI() {
    const toggle = root.querySelector('[data-music]');
    toggle?.classList.toggle('is-on', music);
    toggle?.setAttribute('aria-checked', String(music));
    root.querySelectorAll('[data-music-style]').forEach((button) => {
      button.classList.toggle('is-active', music && button.dataset.musicStyle === selectedMusic);
    });
  }

  function auditionButton() {
    return root.querySelector('[data-audition]');
  }

  async function stopAudition() {
    clearTimeout(auditionTimer);
    auditionTimer = null;
    const score = auditionScore;
    auditionScore = null;
    const button = auditionButton();
    if (button) button.innerHTML = `${icon('play', 11)} 试听`;
    try { await score?.stop(); } catch { /* already closed */ }
  }

  async function toggleAudition() {
    if (auditionScore) {
      await stopAudition();
      return;
    }
    if (!AmbientScore.isSupported()) {
      toast('当前 WebView 不支持音频试听', { type: 'error' });
      return;
    }
    music = true;
    syncMusicUI();
    const score = new AmbientScore();
    try {
      await score.start(8, selectedMusic);
      auditionScore = score;
      const button = auditionButton();
      if (button) button.innerHTML = `${icon('pause', 11)} 停止试听`;
      auditionTimer = setTimeout(() => { stopAudition(); }, 8000);
    } catch (error) {
      toast('试听失败，请重试', { type: 'error' });
      try { await score.stop(); } catch { /* ignored */ }
    }
  }

  root.querySelector('[data-music]').addEventListener('click', () => {
    music = !music;
    if (!music) stopAudition();
    syncMusicUI();
  });

  root.querySelectorAll('[data-music-style]').forEach((button) => {
    button.addEventListener('click', () => {
      stopAudition();
      selectedMusic = button.dataset.musicStyle || 'dawn';
      music = true;
      syncMusicUI();
    });
  });

  root.querySelector('[data-audition]')?.addEventListener('click', toggleAudition);

  root.querySelector('[data-info]').addEventListener('click', () => {
    openSheet({
      title: '关于运动 Vlog',
      subtitle: '视频在本机实时合成',
      content: `<div class="info-list">
        <div class="info-item"><span>${icon('clock', 18)}</span><div><strong>生成需要一点时间</strong><p>视频按 1:1 实时合成，时长与成片一致，请保持页面在前台。</p></div></div>
        <div class="info-item"><span>${icon('video', 18)}</span><div><strong>MP4 / WebM</strong><p>浏览器会自动选择可用的格式。iPhone 可在分享菜单中保存到「照片」。</p></div></div>
        <div class="info-item"><span>${icon('music', 18)}</span><div><strong>原创环境音</strong><p>晨雾 / 林间 / 夜行三种氛围由浏览器实时合成，不使用外部音乐素材。</p></div></div>
        <div class="info-item"><span>${icon('lock', 18)}</span><div><strong>只在本机</strong><p>轨迹、照片和视频都不会上传。清理浏览器数据会同时删除它们。</p></div></div>
      </div>`,
    });
  });

  generateButton?.addEventListener('click', async () => {
    if (!composer || exporting) return;
    if (!supported) {
      toast('当前浏览器不支持视频导出，请换用 Chrome / Edge', { type: 'error', duration: 3200 });
      return;
    }
    exporting = true;
    await stopAudition();
    composer.primeVideos?.();
    aborter = new AbortController();
    generateButton.disabled = true;
    generateLabel.textContent = '正在生成';
    const overlay = renderOverlay(composer, () => {
      aborter?.abort();
    });
    try {
      const record = await exportVlog({
        composer,
        music,
        musicStyle: selectedMusic,
        signal: aborter.signal,
        onProgress: (progress, elapsed) => overlay.update(progress, elapsed),
      });
      overlay.close();
      const previousExport = latestExport;
      const id = `vlog_${Date.now().toString(36)}`;
      const saved = await saveExport({
        id,
        tripId: trip.id,
        blob: record.blob,
        mimeType: record.mimeType,
        extension: record.extension,
        duration: record.duration,
        size: record.blob.size,
        createdAt: Date.now(),
      });
      if (previousExport && previousExport.id !== saved.id) {
        await deleteExport(previousExport.id).catch(() => {});
      }
      setResult(saved);
      toast('Vlog 生成完成', { type: 'success' });
      if (navigator.vibrate) navigator.vibrate([12, 45, 18]);
      // Open the finished film immediately.
      resultSheet({
        record: saved,
        url: latestUrl,
        trip,
        onRegenerate: () => generateButton?.click(),
      });
    } catch (error) {
      overlay.close();
      if (error?.name === 'AbortError') toast('已取消生成');
      else {
        console.error(error);
        toast(error.message || '视频生成失败，请重试', { type: 'error', duration: 3800 });
      }
    } finally {
      exporting = false;
      aborter = null;
      generateButton.disabled = false;
      generateLabel.textContent = latestExport ? '重新生成运动 Vlog' : '生成运动 Vlog';
    }
  });

  return {
    destroy() {
      aborter?.abort();
      stopAudition();
      composer?.dispose();
      if (latestUrl) URL.revokeObjectURL(latestUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
  };
}
