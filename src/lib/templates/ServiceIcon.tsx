import type { ReactNode } from 'react';

// A small, on-brand stroke-icon set for the Services grid. Keyed by name;
// unknown keys fall back to 'spark'. 24px grid, round caps; stroke follows
// currentColor so every template tints them with its accent.
const ICONS: Record<string, ReactNode> = {
  spark: <path d="M12 2.5l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  droplet: <path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z" />,
  bolt: <path d="M13 2L3 14h9l-1 8 10-12h-9z" />,
  home: <><path d="M3 9.5l9-7 9 7V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-8h6v8" /></>,
  star: <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  leaf: <><path d="M11 21A8 8 0 0 1 10 6c6-1 8-2 10-4 1 3 1.5 5 1.5 8A9 9 0 0 1 11 21z" /><path d="M4 21c1-4 3-6 7-7" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  truck: <><rect x="1.5" y="6" width="12.5" height="10" rx="1" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></>,
  sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M5.5 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6L3.3 17.2l1.6-.6z" /></>,
  roller: <><rect x="4" y="4" width="13" height="6" rx="1" /><path d="M17 7h3v4h-8v3" /><rect x="10" y="14" width="4" height="6" rx="1" /></>,
};

export const SERVICE_ICON_KEYS = Object.keys(ICONS);

export default function ServiceIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] ?? ICONS.spark}
    </svg>
  );
}
