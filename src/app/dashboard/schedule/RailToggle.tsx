'use client';

import { useEffect, useState } from 'react';

/**
 * Hide the unscheduled rail on a wide screen.
 *
 * The rail is 21–24rem of the row at every width above 1280, permanently, and
 * it earns that on a day with work waiting for a date. On a day with one job in
 * it — or when the calendar is the thing being read rather than the queue — it
 * is a quarter of the screen the week timeline could be using. A 1366 laptop
 * feels this hardest: the calendar is about 950px with the rail up and about
 * 1250px without it, which is the difference between a comfortable week and a
 * cramped one.
 *
 * WHY A BODY ATTRIBUTE AND NOT A CLASS ON THE SHELL. The shell is server
 * rendered inside a server component; this control sits in the calendar
 * toolbar, which is a different subtree. Rather than lift state through both —
 * or make the page a client component to hold one boolean — the state lives
 * where the CSS can already see it from either side.
 *
 * ONLY ABOVE 1280. Below that the rail is not a rail at all, it is the
 * full-screen queue opened from the banner, and there is nothing to collapse;
 * showing the control there would offer to hide something that is not on
 * screen.
 */
const KEY = 'lgq.schedule.railCollapsed';
const ATTR = 'schedRail';

export default function RailToggle({ count }: { count: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)');
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Read once, after mount. Reading during render would make the server markup
  // and the first client render disagree about the layout of the whole page.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KEY) === '1');
    } catch {
      // Private mode, or storage disabled. The rail simply stays open.
    }
  }, []);

  useEffect(() => {
    // The attribute has to come off below the breakpoint as well as when the
    // rail is expanded — a stale "collapsed" would hide the queue's desktop
    // home the moment the window grew back past 1280.
    if (collapsed && wide) document.body.dataset[ATTR] = 'collapsed';
    else delete document.body.dataset[ATTR];
    return () => { delete document.body.dataset[ATTR]; };
  }, [collapsed, wide]);

  if (!wide) return null;

  return (
    <button
      type="button"
      className="sched-rail-toggle"
      aria-pressed={collapsed}
      onClick={() => {
        const next = !collapsed;
        setCollapsed(next);
        try {
          window.localStorage.setItem(KEY, next ? '1' : '0');
        } catch {
          // Not persisting is survivable; not toggling would not be.
        }
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M15 5v14" />
      </svg>
      {/* The count is on the button when the rail is hidden, because that is
          the only place the number still appears once the list is gone. */}
      {collapsed ? <>Show jobs{count > 0 ? ` (${count})` : ''}</> : 'Hide jobs'}
    </button>
  );
}
