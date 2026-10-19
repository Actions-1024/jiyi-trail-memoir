export {
  $,
  $$,
  escapeHTML,
  toast,
  openSheet,
  closeSheet,
  confirmSheet,
  setButtonLoading,
  activityLabel,
  statBlock,
  emptyState,
  openMediaPreview,
  haptic,
  debounce,
} from '../ui.js';

export {
  formatClock,
  formatDate,
  formatDateShort,
  formatWeekday,
  formatRelativeDate,
  durationClock,
  durationHuman,
  distanceLabel,
  distanceValue,
  distanceUnit,
  paceLabel,
  speedLabel,
  statsFor,
} from '../geo.js';

export function coverStyle(src) {
  return src ? `style="background-image:url('${src}')"` : '';
}

export function imageOrPlaceholder(src, alt, className = '') {
  if (!src) {
    return `<div class="image-placeholder ${className}" aria-label="${alt}"></div>`;
  }
  return `<img class="${className}" src="${src}" alt="${alt}" loading="lazy" />`;
}
