import { loadHomeData, totalStats } from '../data.js';
import { getDraft } from '../recorder.js';
import { icon } from '../icons.js';
import {
  escapeHTML,
  formatRelativeDate,
  formatClock,
  durationClock,
  durationHuman,
} from './helpers.js';
import { formatDate, formatWeekday } from '../geo.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function tripCard(trip, index) {
  const distance = trip.stats?.distance || 0;
  const duration = trip.stats?.duration || 0;
  const cover = trip.cover
    ? `<div class="trip-card__cover" style="background-image:url('${trip.cover}')"></div>`
    : `<div class="trip-card__cover trip-card__cover--empty">
        <span class="trip-card__route">${icon('route', 26)}</span>
      </div>`;
  return `<a class="trip-card" href="#/trip/${encodeURIComponent(trip.id)}" style="--i:${index}">
    ${cover}
    <div class="trip-card__body">
      <div class="trip-card__meta">
        <span>${escapeHTML(formatRelativeDate(trip.startedAt))}</span>
        <span class="dot"></span>
        <span>${escapeHTML(formatClock(trip.startedAt))}</span>
        ${trip.demo ? '<span class="tag tag--ghost">示例</span>' : ''}
      </div>
      <h3>${escapeHTML(trip.title)}</h3>
      <p class="trip-card__subtitle">${escapeHTML(trip.subtitle || trip.locationName || '一段新的旅程')}</p>
      <div class="trip-card__stats">
        <span><strong>${(distance / 1000).toFixed(2)}</strong> km</span>
        <span><strong>${escapeHTML(durationClock(duration))}</strong></span>
        <span><strong>${trip.moments?.length || 0}</strong> 个瞬间</span>
      </div>
    </div>
    <span class="trip-card__arrow">${icon('chevron', 18)}</span>
  </a>`;
}

export async function renderHome(root, ctx) {
  const { demo, trips } = await loadHomeData();
  const draft = getDraft();
  const allTrips = [demo, ...trips.filter((t) => t.id !== demo.id)]
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  // Keep the sample out of a real user's lifetime totals.
  const totals = totalStats(trips.length ? trips : [demo]);
  const today = new Date();
  const hasUserTrips = trips.length > 0;

  root.innerHTML = `<div class="screen home">
    <header class="home-head">
      <a class="brand" href="#/" aria-label="迹忆首页">
        <span class="brand__mark">${icon('route', 20)}</span>
        <span class="brand__text">
          <strong>迹忆</strong>
          <small>TRAIL MEMOIR</small>
        </span>
      </a>
      <a class="avatar" href="#/profile" aria-label="我的">
        <span>${hasUserTrips ? '旅' : '忆'}</span>
      </a>
    </header>

    <section class="home-intro">
      <p class="eyebrow">${escapeHTML(formatDate(today))} · ${escapeHTML(formatWeekday(today))}</p>
      <h1>${greeting()}，<br><em>去走一段路。</em></h1>
      <p class="home-intro__copy">记录每一步，也记录当时的风景与心情。<br>结束时，把整段旅程剪成一支 Vlog。</p>
    </section>

    ${draft ? `<button class="draft-banner" data-resume-draft>
      <span class="draft-banner__pulse"></span>
      <span class="draft-banner__text">
        <strong>有一段旅程尚未结束</strong>
        <small>${draft.points.length} 个轨迹点 · 点击继续记录</small>
      </span>
      <span class="draft-banner__arrow">${icon('arrowRight', 18)}</span>
    </button>` : ''}

    <a class="hero-card" href="#/record">
      <img class="hero-card__image" src="assets/demo/hero.jpg" alt="清晨的西湖" />
      <div class="hero-card__shade"></div>
      <div class="hero-card__top">
        <span class="pill pill--light"><span class="pill__dot"></span>开始新的旅程</span>
        <span class="hero-card__weather">18° <span>晴</span></span>
      </div>
      <div class="hero-card__bottom">
        <h2>把走过的路，<br>剪成一段回忆。</h2>
        <div class="hero-card__action">
          <span class="hero-card__cta">开始记录 ${icon('arrowRight', 17)}</span>
        </div>
      </div>
    </a>

    <section class="overview">
      <div class="overview__head">
        <span>你的足迹</span>
        <span class="overview__hint">${hasUserTrips ? '每一次出发都算数' : '从一段示例开始'}</span>
      </div>
      <div class="overview__grid">
        <div class="overview__item">
          <strong>${totals.distance >= 1000 ? (totals.distance / 1000).toFixed(1) : Math.round(totals.distance)}</strong>
          <span>${totals.distance >= 1000 ? '公里' : '米'} · 累计里程</span>
        </div>
        <div class="overview__item">
          <strong>${escapeHTML(durationHuman(totals.duration))}</strong>
          <span>在路上</span>
        </div>
        <div class="overview__item">
          <strong>${totals.moments}</strong>
          <span>个瞬间</span>
        </div>
      </div>
    </section>

    <section class="recent">
      <div class="section-head">
        <div>
          <p class="eyebrow">JOURNEYS</p>
          <h2>最近旅程</h2>
        </div>
        <span class="section-head__count">${allTrips.length} 段</span>
      </div>
      <div class="trip-list">
        ${allTrips.map(tripCard).join('')}
      </div>
    </section>

    <footer class="home-foot">
      <span class="home-foot__line"></span>
      <p>慢一点，才看得见风景。</p>
      <span class="home-foot__sign">迹忆 · 把旅程带回家</span>
    </footer>

    <nav class="tabbar" aria-label="主导航">
      <a class="tabbar__item is-active" href="#/">
        <span class="tabbar__icon">${icon('home', 21)}</span>
        <span>首页</span>
      </a>
      <button class="tabbar__record" type="button" data-start-record aria-label="开始记录">
        <span class="tabbar__record-inner">${icon('footprints', 25)}</span>
        <span class="tabbar__record-label">记录</span>
      </button>
      <a class="tabbar__item" href="#/profile">
        <span class="tabbar__icon">${icon('user', 21)}</span>
        <span>我的</span>
      </a>
    </nav>
  </div>`;

  root.querySelector('[data-start-record]')?.addEventListener('click', () => ctx.navigate('/record'));
  root.querySelector('[data-resume-draft]')?.addEventListener('click', () => {
    sessionStorage.setItem('jiyi:resume-draft', '1');
    ctx.navigate('/record');
  });

  return { destroy() {} };
}
