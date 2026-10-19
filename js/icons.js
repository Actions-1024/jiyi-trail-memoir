const paths = {
  logo: `
    <path d="M7 21c4.5-4.2 6.8-7.4 6.8-10.2A4.8 4.8 0 0 0 9 6a4.8 4.8 0 0 0-4.8 4.8C4.2 13.6 6.5 16.8 11 21" />
    <path d="M13 3.5c2.2 0 4 1.8 4 4 0 2.7-2.6 6.2-6.9 10.4" />
    <circle cx="9" cy="10.7" r="1.4" fill="currentColor" stroke="none" />`,
  back: '<path d="M15 18l-6-6 6-6" />',
  close: '<path d="M6 6l12 12M18 6L6 18" />',
  camera: `
    <path d="M4 7.5h3l1.5-2h7L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"/>
    <circle cx="12" cy="13" r="3.6"/>`,
  note: `
    <path d="M5 4.5h10.5L20 9v10.5H5z"/>
    <path d="M15 4.5V9h4.5M8 12h8M8 15.5h6"/>`,
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  locate: `
    <circle cx="12" cy="12" r="6.5"/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>`,
  route: `
    <circle cx="6" cy="18" r="2.2"/>
    <circle cx="18" cy="6" r="2.2"/>
    <path d="M8 17.2c3.2-1 1.8-4.2 4.4-5.5 2-1 1.3-3.4 3.4-4.3"/>`,
  sparkles: `
    <path d="M12 3l1.2 3.7L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.3z"/>
    <path d="M18.5 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>
    <path d="M5 13l.6 1.7 1.7.6-1.7.6L5 17.6l-.6-1.7-1.7-.6 1.7-.6z"/>`,
  download: `
    <path d="M12 3v12m0 0l4.5-4.5M12 15l-4.5-4.5"/>
    <path d="M4 18.5v1.2h16v-1.2"/>`,
  share: `
    <circle cx="18" cy="5.5" r="2.5"/>
    <circle cx="6" cy="12" r="2.5"/>
    <circle cx="18" cy="18.5" r="2.5"/>
    <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>`,
  chevron: '<path d="M9 18l6-6-6-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: `
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 13h9.4l.8-13"/>
    <path d="M10 11v5M14 11v5"/>`,
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  image: `
    <rect x="3" y="4.5" width="18" height="15" rx="2"/>
    <circle cx="8.5" cy="9.5" r="1.8"/>
    <path d="M21 15l-5-5L5 20"/>`,
  video: `
    <rect x="2.5" y="6" width="13" height="12" rx="2"/>
    <path d="M15.5 10l6-3.5v11l-6-3.5z"/>`,
  music: `
    <path d="M9 18V5l10-2v13"/>
    <circle cx="6.5" cy="18" r="2.8"/>
    <circle cx="16.5" cy="16" r="2.8"/>`,
  clock: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5.2l3.5 2"/>`,
  pin: `
    <path d="M12 21c4.2-4.4 6.5-7.7 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 13.3 7.8 16.6 12 21Z"/>
    <circle cx="12" cy="10.3" r="2.2"/>`,
  mountain: `
    <path d="M3 19l6-10 4 6 2-3 6 7z"/>
    <path d="M7.5 11.5l2.2 2 2.2-1.3"/>`,
  map: `
    <path d="M9 4.5 3.5 7v13L9 17.5l6 2.5 5.5-2.5v-13L15 7z"/>
    <path d="M9 4.5v13M15 7v13"/>`,
  layers: `
    <path d="M12 3l9 5-9 5-9-5z"/>
    <path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>`,
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  calendar: `
    <rect x="3.5" y="5" width="17" height="16" rx="2"/>
    <path d="M8 3v4M16 3v4M3.5 10h17"/>`,
  arrowRight: '<path d="M4 12h15m0 0l-5.5-5.5M19 12l-5.5 5.5"/>',
  refresh: `
    <path d="M20 11a8 8 0 0 0-14.8-4L3 10"/>
    <path d="M3 4v6h6"/>
    <path d="M4 13a8 8 0 0 0 14.8 4L21 14"/>
    <path d="M21 20v-6h-6"/>`,
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z"/>',
  lock: `
    <rect x="5" y="10" width="14" height="10" rx="2"/>
    <path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/>`,
  info: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 11v5M12 8h.01"/>`,
  plus: '<path d="M12 5v14M5 12h14"/>',
  wind: `
    <path d="M3 8h10.5a2.5 2.5 0 1 0-2.3-3.5"/>
    <path d="M3 12h15.5a2.5 2.5 0 1 1-2.3 3.5"/>
    <path d="M3 16h7.5"/>`,
  home: `
    <path d="M3.5 10.5 12 3l8.5 7.5"/>
    <path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"/>`,
  user: `
    <circle cx="12" cy="8" r="4"/>
    <path d="M4.5 21c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>`,
  footprints: `
    <ellipse cx="8" cy="8" rx="2.4" ry="3.4" transform="rotate(-20 8 8)"/>
    <ellipse cx="16" cy="16" rx="2.4" ry="3.4" transform="rotate(-20 16 16)"/>
    <path d="M9.5 12.3c0 1.5-.8 2.2-2 2.2s-2-.7-2-2.2M17.5 20.3c0 1.5-.8 2.2-2 2.2s-2-.7-2-2.2"/>`,
};

export function icon(name, size = 24, className = '') {
  const body = paths[name] || paths.info;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function logoMark(size = 34) {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="26" height="26" rx="9" fill="currentColor"/>
    <path d="M8.5 21.5c4.8-4.7 7.2-8.1 7.2-11.1a4.9 4.9 0 1 0-9.8 0c0 3 2.4 6.4 7.2 11.1Z" stroke="#F3EEE2" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M15.8 7.2c2.2.2 3.8 2 3.8 4.2 0 2.5-2.1 5.5-6.3 9.2" stroke="#F3EEE2" stroke-width="1.2" stroke-linecap="round" opacity=".65"/>
    <circle cx="11.5" cy="10.2" r="1.25" fill="#F3EEE2"/>
  </svg>`;
}
