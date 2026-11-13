import React from 'react';

const paths = {
  camera: 'M3 7h12v10H3z M15 10l5-3v10l-5-3',
  mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v1a7 7 0 0 0 14 0v-1 M12 18v4 M9 22h6',
  chat: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
  people: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M5 20v-2a7 6 0 0 1 14 0v2z M3 15a4 4 0 0 1 3-4 M21 15a4 4 0 0 0-3-4',
  hand: 'M7 12V7a1.4 1.4 0 0 1 2.8 0v4-6a1.4 1.4 0 0 1 2.8 0v6-5a1.4 1.4 0 0 1 2.8 0v6-3a1.4 1.4 0 0 1 2.8 0v5a7 7 0 0 1-7 7h-.5a5 5 0 0 1-4-2l-4-5a1.5 1.5 0 0 1 2.2-2z',
  react: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M8 14a4 4 0 0 0 8 0 M9 9h.01 M15 9h.01',
  view: 'M3 4h18v16H3z M3 11h18 M12 4v16',
  'present-standard': 'M3 4h18v11H3z M6 19h3 M11 19h3 M16 19h3',
  'present-side': 'M3 4h18v16H3z M15 4v16',
  'present-overlay': 'M3 4h18v16H3z M12 12h6v5h-6z',
  'present-weather': 'M3 4h18v16H3z M16.5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12.5 20v-2a4 4 0 0 1 8 0v2',
  layers: 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  image: 'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M16 8h.01',
  up: 'M6 14l6-6 6 6',
  down: 'M6 10l6 6 6-6',
  rooms: 'M3 5h7v14H3z M14 5h7v6h-7z M14 15h7v4h-7z',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  share: 'M3 7v13h18V7 M12 15V3 M8 7l4-4 4 4',
  leave: 'M3 13c1-4 5-5 9-5s8 1 9 5v3h-5l-1-3H9l-1 3H3z',
  close: 'M6 6l12 12 M18 6 6 18',
  link: 'M9 15l6-6 M8 16l-1 1a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0 M16 8l1-1a3 3 0 0 1 4 4l-5 5a3 3 0 0 1-4 0',
  calendar: 'M3 5h18v16H3z M7 3v5 M17 3v5 M3 11h18 M8 15h3 M13 15h3',
  arrow: 'M4 12h15 M13 6l6 6-6 6',
  send: 'M3 3l18 9-18 9 3-9z M6 12h15',
  chevron: 'M6 9l6 6 6-6',
  activity: 'M4 4h16v12H4z M12 16v4 M8 20h8 M7 12l3-3 3 2 4-4',
  lock: 'M5 10h14v10H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v2',
  expand: 'M9 4H4v5 M15 4h5v5 M4 15v5h5 M20 15v5h-5',
  download: 'M12 3v12 M8 11l4 4 4-4 M4 16v5h16v-5',
  pin: 'M9 3h6l-1 5 4 4v2H6v-2l4-4z M12 14v7',
  record: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0z',
  captions: 'M3 5h18v14H3z M10 10a2 2 0 1 0 0 4 M17 10a2 2 0 1 0 0 4',
  gear: 'M8 4l1-2h6l1 2 3 1 2 4-1 3 1 3-2 4-3 1-1 2H9l-1-2-3-1-2-4 1-3-1-3 2-4z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  speaker: 'M3 9h4l5-4v14l-5-4H3z M16 8a5 5 0 0 1 0 8 M18 5a9 9 0 0 1 0 14',
};

export function Icon({ name, off = false, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={name === 'more' ? 2.8 : 1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />{off && <path className="icon-slash" d="M3 3l18 18" />}
  </svg>;
}
