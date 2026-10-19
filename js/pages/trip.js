import { loadTrip } from '../data.js';
import { TrailMap } from '../map.js';
import { getLatestExport, deleteTrip } from '../db.js';
import { formatDate, formatClock, durationClock, paceLabel } from '../geo.js';
import { icon } from '../icons.js';
import {
  escapeHTML,
  toast,
  openSheet,
  confirmSheet,
  openMediaPreview,
} from '../ui.js';

function momentMedia(moment) {
  if (!moment.src) return '';
  if (moment.type === 'video' || moment.mediaType === 'video') {
    return `<video class="moment-media" src="${moment.videoSrc || moment.src}" controls playsinline preload="metadata" poster="${moment.thumbUrl || ''}"></video>`;
  }
  return `<button class="moment-media-button" type="button" data-preview="${encodeURIComponent(moment.id)}">
    <img class="moment-media" src="${moment.src}" alt="${escapeHTML(moment.title || '沿途照片')}" loading="lazy" />
    <span class="moment-media__zoom">${icon('image', 14)} 查看原图</span>
  </button>`;
}

function momentCard(moment, index) {
  const isNote = moment.type === 'note';
  const distance = moment.distance ? (moment.distance / 1000).toFixed(2) : null;
  const time = moment.t ? formatClock(moment.t) : '';
  return `<article class="moment-card ${isNote ? 'moment-card--note' : ''}" style="--i:${index}">
    <div class="moment-card__rail">
      <span class="moment-card__number">${String(moment.order || index + 1).padStart(2, '0')}</span>
      <span class="moment-card__line"></span>
    </div>
    <div class="moment-card__content">
      <div class="moment-card__meta">
        <span>${escapeHTML(time)}</span>
        ${distance ? `<span class="dot"></span><span>${distance} km</span>` : ''}
        ${moment.mood ? `<span class="mood-tag"># ${escapeHTML(moment.mood)}</span>` : ''}
      </div>
      ${isNote ? `<div class="note-card">
        <span class="note-card__quote">“</span>
        ${moment.src ? momentMedia(moment) : ''}
        <p class="note-card__text">${escapeHTML(moment.text || '在这里，停了一会儿。')}</p>
        <span class="note-card__sign">— 记于 ${escapeHTML(moment.title || '此刻')}</span>
      </div>` : `<div class="moment-photo">
        ${moment.src ? `<button class="moment-photo__button" type="button" data-preview="${encodeURIComponent(moment.id)}">
          <img src="${moment.thumbUrl || moment.src}" alt="${escapeHTML(moment.title || '沿途照片')}" loading="lazy" />
          ${moment.type === 'video' ? `<span class="moment-photo__play">${icon('play', 22)}</span>` : ''}
        </button>` : `<div class="moment-photo__empty">${icon('image', 24)}</div>`}
        <div class="moment-photo__body">
          <h3>${escapeHTML(moment.title || '沿途的风景')}</h3>
          ${moment.text ? `<p>${escapeHTML(moment.text)}</p>` : ''}
        </div>
      </div>`}
    </div>
  </article>`;
}

export async function renderTrip(root, ctx) {
  const id = ctx.params[0];
  const trip = await loadTrip(id);
  if (!trip) {
    root.innerHTML = `<div class="screen"><div class="fatal-error">
      <span>NOT FOUND</span><h1>这段旅程找不到了</h1><p>它可能已经被删除。</p>
      <a class="button button--primary" href="#/">回到首页</a>
    </div></div>`;
    return { destroy() {} };
  }

  const stats = trip.stats || {};
  const moments = trip.moments || [];
  const latestExport = await getLatestExport(trip.id).catch(() => null);
  const exportUrl = latestExport?.blob ? URL.createObjectURL(latestExport.blob) : null;
  const sortedMoments = [...moments].sort((a, b) => (a.order || 0) - (b.order || 0));
  const isDemo = !!trip.demo;

  root.innerHTML = `<div class="screen trip-screen">
    <section class="trip-map">
      <canvas id="trip-canvas"></canvas>
      <div class="trip-map__top-shade"></div>
      <header class="trip-topbar">
        <a class="map-button" href="#/" aria-label="返回首页">${icon('back', 20)}</a>
        <span class="trip-topbar__title">${isDemo ? '示例旅程' : '旅程详情'}</span>
        <button class="map-button" type="button" data-more aria-label="更多">${icon('more', 20)}</button>
      </header>
      <div class="trip-map__caption">
        <span>${icon('map', 13)} ${escapeHTML(trip.locationName || '我的旅程')}</span>
        ${latestExport ? `<span class="trip-map__vlog">${icon('check', 12)} Vlog 已生成</span>` : ''}
      </div>
    </section>

    <section class="trip-content">
      <div class="trip-content__handle"></div>
      <div class="trip-title-block">
        <div class="trip-title-block__meta">
          <span>${escapeHTML(formatDate(trip.startedAt))}</span>
          <span class="dot"></span>
          <span>${escapeHTML(formatClock(trip.startedAt))} 出发</span>
          ${isDemo ? '<span class="tag">灵感示例</span>' : ''}
        </div>
        <h1>${escapeHTML(trip.title)}</h1>
        <p class="trip-subtitle">${escapeHTML(trip.subtitle || trip.description || '一段用脚步写下的旅程')}</p>
      </div>

      <div class="trip-stats">
        <div class="trip-stat trip-stat--accent">
          <strong>${((stats.distance || 0) / 1000).toFixed(2)}</strong>
          <span>公里</span>
        </div>
        <div class="trip-stat">
          <strong>${escapeHTML(durationClock(stats.duration || 0))}</strong>
          <span>用时</span>
        </div>
        <div class="trip-stat">
          <strong>${escapeHTML(paceLabel(stats.pace || 0))}</strong>
          <span>平均配速</span>
        </div>
        <div class="trip-stat">
          <strong>${Math.round(stats.elevationGain || 0)}<small>m</small></strong>
          <span>累计爬升</span>
        </div>
      </div>

      ${trip.description ? `<blockquote class="trip-quote">
        <span>“</span>
        <p>${escapeHTML(trip.description)}</p>
      </blockquote>` : ''}

      <section class="trip-moments">
        <div class="section-head">
          <div>
            <p class="eyebrow">MOMENTS ALONG THE WAY</p>
            <h2>沿途瞬间</h2>
          </div>
          <span class="section-head__count">${moments.length} 个</span>
        </div>
        ${moments.length ? `<div class="moment-list">${sortedMoments.map(momentCard).join('')}</div>`
          : `<div class="empty-state">
              <span class="empty-state__icon">${icon('camera', 24)}</span>
              <h3>这一路没有留下照片</h3>
              <p>下次出发时，试着在喜欢的地方按一下快门。<br>轨迹会记得你停下的位置。</p>
            </div>`}
      </section>

      ${exportUrl ? `<section class="existing-vlog">
        <div class="section-head">
          <div><p class="eyebrow">YOUR VLOG</p><h2>已经生成的 Vlog</h2></div>
        </div>
        <video class="existing-vlog__video" src="${exportUrl}" controls playsinline preload="metadata"></video>
        <a class="text-link existing-vlog__link" href="#/export/${encodeURIComponent(trip.id)}">重新生成或下载 ${icon('arrowRight', 14)}</a>
      </section>` : ''}

      <footer class="trip-foot">
        <span>${icon('route', 18)}</span>
        <p>${isDemo ? '这是一段示例旅程，你可以用它先体验一次 Vlog 导出。' : '轨迹与瞬间只保存在这台设备上。'}</p>
      </footer>
    </section>

    <div class="bottom-dock">
      <button class="button button--primary button--full trip-export-button" type="button" data-generate>
        <span class="trip-export-button__icon">${icon('sparkles', 19)}</span>
        ${latestExport ? '查看 / 重新生成运动 Vlog' : '生成运动 Vlog'}
        <span class="trip-export-button__arrow">${icon('arrowRight', 17)}</span>
      </button>
    </div>
  </div>`;

  const map = new TrailMap(root.querySelector('#trip-canvas'), {
    interactive: true,
    theme: trip.theme || 'dawn',
    progress: 1,
    moments: sortedMoments,
    attribution: true,
    basemap: 'streets',
    chrome: true,
    startEnd: true,
    follow: false,
  });
  map.setRoute(trip.points, { progress: 1, moments: sortedMoments, fit: false });
  const mapHeight = root.querySelector('.trip-map')?.clientHeight || 420;
  map.fitToRoute(trip.points, { top: 82, right: 30, bottom: Math.max(60, mapHeight * 0.28), left: 30 });
  map.setCamera(map.center, Math.max(10, map.zoom));

  const previewButtons = root.querySelectorAll('[data-preview]');
  previewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const moment = sortedMoments.find((m) => m.id === decodeURIComponent(button.dataset.preview));
      if (!moment) return;
      openMediaPreview(moment.src, moment.type === 'video' || moment.mediaType === 'video' ? 'video' : 'photo', moment.title || moment.text || '');
    });
  });

  root.querySelector('[data-generate]')?.addEventListener('click', () => {
    ctx.navigate(`/export/${encodeURIComponent(trip.id)}`);
  });

  root.querySelector('[data-more]')?.addEventListener('click', () => {
    openSheet({
      title: '这段旅程',
      subtitle: trip.title,
      content: `<div class="more-actions">
        <button class="more-action" type="button" data-share>
          <span>${icon('share', 20)}</span><span><strong>分享这段旅程</strong><small>把标题和故事分享给朋友</small></span>${icon('chevron', 16)}
        </button>
        <button class="more-action" type="button" data-regen>
          <span>${icon('sparkles', 20)}</span><span><strong>${latestExport ? '重新生成 Vlog' : '生成运动 Vlog'}</strong><small>轨迹动画 + 沿途照片</small></span>${icon('chevron', 16)}
        </button>
        ${isDemo ? '' : `<button class="more-action more-action--danger" type="button" data-delete>
          <span>${icon('trash', 19)}</span><span><strong>删除这段旅程</strong><small>轨迹、照片和导出的视频都会被删除</small></span>${icon('chevron', 16)}
        </button>`}
      </div>`,
      onMount: (sheet) => {
        sheet.body.querySelector('[data-share]').addEventListener('click', async () => {
          const text = `${trip.title}\n${trip.description || trip.subtitle || ''}\n${(stats.distance / 1000).toFixed(2)} km · ${durationClock(stats.duration || 0)}`;
          try {
            if (navigator.share) await navigator.share({ title: trip.title, text });
            else {
              await navigator.clipboard.writeText(text);
              toast('旅程故事已复制', { type: 'success' });
            }
          } catch (error) {
            if (error?.name !== 'AbortError') toast('暂时无法分享', { type: 'error' });
          }
        });
        sheet.body.querySelector('[data-regen]').addEventListener('click', () => {
          sheet.close();
          ctx.navigate(`/export/${encodeURIComponent(trip.id)}`);
        });
        sheet.body.querySelector('[data-delete]')?.addEventListener('click', async () => {
          const yes = await confirmSheet({
            title: '删除这段旅程？',
            message: '轨迹、沿途照片与已经导出的视频都会被永久删除，无法恢复。',
            confirmText: '删除',
            cancelText: '保留',
            danger: true,
          });
          if (!yes) return;
          await deleteTrip(trip.id);
          sheet.close();
          toast('旅程已删除');
          setTimeout(() => ctx.navigate('/'), 200);
        });
      },
    });
  });

  return {
    destroy() {
      map.destroy();
      if (exportUrl) setTimeout(() => URL.revokeObjectURL(exportUrl), 500);
    },
  };
}
