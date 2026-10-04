import React from 'react';

/** Stroke icons drawn inline so the app needs no icon font or network. */
const PATHS = {
  home: <path d="M3 11l9-8 9 8v9h-6v-6H9v6H3z" />,
  review: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  quiz: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 12l3 3 5-6" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  sparkle: <><path d="M12 4l1.800 4.200L18 10l-4.200 1.800L12 16l-1.800-4.200L6 10l4.200-1.800z" /><path d="M19 15v4M17 17h4M5 4v3M3.500 5.500h3" /></>,
  flip: <><path d="M20 12a8 8 0 11-3-6.200" /><path d="M20 4v5h-5" /></>,
  sound: <><path d="M4 10v4h3l5 4V6L7 10z" /><path d="M16 9a4 4 0 010 6M18.500 6.500a8 8 0 010 11" /></>,
  moon: <path d="M20 14a8 8 0 11-9-10 6.500 6.500 0 009 10z" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  book: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.500 2M9 2h6" /></>,
  speak: <path d="M4 5h16v11H9l-5 4z" />,
  chart: <path d="M4 19V5M4 19h16M8 15l4-5 3 3 5-7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  cloud: <path d="M7 18a4 4 0 010-8 5 5 0 019.600-1.500A4.500 4.500 0 0117 18z" />,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.500v.500" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  send: <path d="M4 12l16-8-6 16-3-7z" />,
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: 'none', ...style }}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

/** The Study Bunny logo (public/logo.png). */
export function BunnyMark({ size = 40 }) {
  return <img src="/logo.png" alt="" width={size} height={size} style={{ flex: 'none', objectFit: 'contain' }} />;
}

/** The Study Bunny mascot (public/mascot.png), used in the Home hero. */
export function BunnyScene({ className }) {
  return <img src="/mascot.png" alt="" className={className} />;
}
