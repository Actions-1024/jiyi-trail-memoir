import { icon } from './icons.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function haptic(pattern = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

let toastTimer = null;
export function toast(message, options = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const { type = 'default', duration = 2400 } = options;
  root.innerHTML = `<div class="toast toast--${type}" role="status">
    <span class="toast__icon">${type === 'success' ? icon('check', 16) : type === 'error' ? icon('info', 16) : icon('sparkles', 15)}</span>
    <span>${escapeHTML(message)}</span>
  </div>`;
  requestAnimationFrame(() => root.firstElementChild?.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    const el = root.firstElementChild;
    if (!el) return;
    el.classList.remove('is-visible');
    setTimeout(() => {
      if (root.firstElementChild === el) root.innerHTML = '';
    }, 260);
  }, duration);
}

let activeSheet = null;

export function openSheet(options = {}) {
  const root = document.getElementById('sheet-root');
  if (!root) return null;
  closeSheet(true);
  const {
    title = '',
    subtitle = '',
    content = '',
    className = '',
    dismissible = true,
    onMount = null,
    onClose = null,
  } = options;

  root.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <div class="sheet__handle"></div>
      <header class="sheet__header">
        <div>
          <h2 class="sheet__title">${escapeHTML(title)}</h2>
          ${subtitle ? `<p class="sheet__subtitle">${escapeHTML(subtitle)}</p>` : ''}
        </div>
        ${dismissible ? `<button class="icon-button sheet__close" type="button" aria-label="关闭" data-sheet-close>${icon('close', 19)}</button>` : ''}
      </header>
      <div class="sheet__body">${content}</div>
    </section>`;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => root.classList.add('is-open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    onClose?.();
    setTimeout(() => {
      if (root.classList.contains('is-open')) return;
      root.innerHTML = '';
      if (activeSheet?.close === close) activeSheet = null;
    }, 280);
  };
  const handle = {
    el: root.querySelector('.sheet'),
    body: root.querySelector('.sheet__body'),
    close,
  };
  activeSheet = handle;

  root.querySelectorAll('[data-sheet-close]').forEach((el) => {
    el.addEventListener('click', () => {
      if (dismissible) close();
    });
  });
  // Swipe down to dismiss.
  const sheet = root.querySelector('.sheet');
  let startY = null;
  let currentY = 0;
  sheet?.addEventListener('touchstart', (event) => {
    if (event.target.closest('.sheet__body')?.scrollTop > 0) return;
    startY = event.touches[0].clientY;
    currentY = 0;
  }, { passive: true });
  sheet?.addEventListener('touchmove', (event) => {
    if (startY == null) return;
    currentY = Math.max(0, event.touches[0].clientY - startY);
    if (currentY > 0) sheet.style.transform = `translateY(${currentY}px)`;
  }, { passive: true });
  sheet?.addEventListener('touchend', () => {
    if (startY == null) return;
    if (currentY > 90 && dismissible) close();
    else sheet.style.transform = '';
    startY = null;
    currentY = 0;
  });

  onMount?.(handle);
  return handle;
}

export function closeSheet(immediate = false) {
  const root = document.getElementById('sheet-root');
  document.body.classList.remove('sheet-open');
  if (activeSheet) {
    const sheet = activeSheet;
    activeSheet = null;
    if (!immediate) {
      root?.classList.remove('is-open');
      setTimeout(() => {
        if (!root?.classList.contains('is-open')) {
          if (root) root.innerHTML = '';
        }
      }, 280);
      return;
    }
    sheet.close?.();
  }
  if (immediate && root) {
    root.classList.remove('is-open');
    root.innerHTML = '';
  }
}

export function confirmSheet(options = {}) {
  const {
    title = '确认',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
  } = options;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      handle?.close();
    };
    const handle = openSheet({
      title,
      content: `
        <p class="confirm-copy">${escapeHTML(message)}</p>
        <div class="sheet-actions">
          <button class="button button--ghost" data-cancel>${escapeHTML(cancelText)}</button>
          <button class="button ${danger ? 'button--danger' : 'button--primary'}" data-confirm>${escapeHTML(confirmText)}</button>
        </div>`,
      onMount: (sheet) => {
        sheet.body.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
        sheet.body.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

export function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${escapeHTML(label || '处理中')}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
    delete button.dataset.original;
  }
}

export function activityLabel(type) {
  const labels = { hike: '徒步', walk: '步行', run: '跑步', cycle: '骑行' };
  return labels[type] || '徒步';
}

export function statBlock(value, unit, label, className = '') {
  return `<div class="stat ${className}">
    <div class="stat__value">${escapeHTML(value)}<span class="stat__unit">${escapeHTML(unit)}</span></div>
    <div class="stat__label">${escapeHTML(label)}</div>
  </div>`;
}

export function emptyState(iconName, title, copy, action = '') {
  return `<div class="empty-state">
    <span class="empty-state__icon">${icon(iconName, 26)}</span>
    <h3>${escapeHTML(title)}</h3>
    <p>${escapeHTML(copy)}</p>
    ${action}
  </div>`;
}

export function openMediaPreview(src, type = 'photo', caption = '', frames = []) {
  const root = document.getElementById('sheet-root');
  if (!root) return;
  const frameMode = type === 'video' && Array.isArray(frames) && frames.length > 0;
  root.innerHTML = `
    <div class="media-preview" data-preview-close>
      <button class="media-preview__close icon-button" aria-label="关闭" data-preview-close>${icon('close', 20)}</button>
      ${frameMode
        ? `<div class="media-preview__frames">
            <img class="media-preview__media" data-preview-frame src="${frames[0]}" alt="${escapeHTML(caption || '视频')}">
            <button class="media-preview__toggle" type="button" data-frame-toggle>${icon('pause', 12)} 暂停</button>
          </div>`
        : type === 'video'
          ? `<video class="media-preview__media" src="${src}" controls autoplay playsinline></video>`
          : `<img class="media-preview__media" src="${src}" alt="${escapeHTML(caption || '照片')}">`}
      ${caption ? `<p class="media-preview__caption">${escapeHTML(caption)}</p>` : ''}
    </div>`;
  root.classList.add('is-open', 'is-preview');
  document.body.classList.add('sheet-open');
  let frameTimer = null;
  if (frameMode) {
    let index = 0;
    let playing = true;
    const image = root.querySelector('[data-preview-frame]');
    const toggle = root.querySelector('[data-frame-toggle]');
    frameTimer = setInterval(() => {
      if (!playing || !image) return;
      index = (index + 1) % frames.length;
      image.src = frames[index];
    }, 125);
    toggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      playing = !playing;
      toggle.innerHTML = playing ? `${icon('pause', 12)} 暂停` : `${icon('play', 12)} 播放`;
    });
  }
  const close = () => {
    clearInterval(frameTimer);
    root.classList.remove('is-open', 'is-preview');
    document.body.classList.remove('sheet-open');
    setTimeout(() => {
      if (!root.classList.contains('is-open')) root.innerHTML = '';
    }, 220);
  };
  root.querySelectorAll('[data-preview-close]').forEach((el) => el.addEventListener('click', close));
  const media = root.querySelector('.media-preview__media');
  media?.addEventListener('click', (event) => event.stopPropagation());
}

export function formatMood(mood) {
  return mood ? `# ${mood}` : '';
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function scrollAppToTop() {
  document.getElementById('view')?.scrollTo?.({ top: 0, behavior: 'instant' });
}
