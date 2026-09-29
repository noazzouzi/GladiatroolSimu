/** Icônes simples dessinées en SVG (aucune police d'icônes ni image externe). */
import type { ReactElement } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'first'
  | 'last'
  | 'prevTurn'
  | 'nextTurn'
  | 'plus'
  | 'minus'
  | 'fit'
  | 'move'
  | 'gift'
  | 'trash'
  | 'copy'
  | 'upload'
  | 'target'
  | 'check'
  | 'x'
  | 'up'
  | 'down';

const PATHS: Record<IconName, ReactElement> = {
  play: <path d="M7 5l12 7-12 7z" fill="currentColor" />,
  pause: (
    <g fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  prev: <path d="M15 5l-8 7 8 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  next: <path d="M9 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  first: <path d="M6 5v14M18 5l-8 7 8 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  last: <path d="M18 5v14M6 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  prevTurn: <path d="M12 5l-7 7 7 7M19 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />,
  nextTurn: <path d="M12 5l7 7-7 7M5 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  minus: <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  gift: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <path d="M3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" />
    </g>
  ),
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />,
  copy: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </g>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  target: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </g>
  ),
  check: <path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  x: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  up: <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
  down: <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />,
};

export function Icon({ name, size = 18, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} focusable="false">
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
