'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { isQuickStopSettingsAnchor, QUICK_STOP_TABS, type QuickStopTabId } from '@/lib/quick-stop-tabs';

/**
 * Today / Settings / Insights.
 *
 * The page was one column nine sections tall, and an owner arriving at it met a
 * route map and a priority-area editor before learning Quick Stops was switched
 * off. Worse, most of the height was the sales pitch — how it works, the
 * example, the customer preview, the benefit list — which is exactly right the
 * first time and is scrolled past every day after that.
 *
 * TWO CONSTRAINTS SHAPED THE IMPLEMENTATION, and both are the kind of thing
 * that looks like an optimisation until it breaks something:
 *
 * 1. PANELS ARE HIDDEN, NEVER UNMOUNTED. The configurator is a SINGLE <form>
 *    spanning five drawers of plain DOM inputs, and its own comment explains
 *    why they are hidden rather than unmounted: a closed drawer that is not
 *    rendered contributes nothing to the FormData, and the action writes the
 *    resulting blanks straight over your settings. Saving with one drawer open
 *    once zeroed the fee band. A tab shell that unmounted inactive tabs would
 *    reintroduce that bug the moment anything the form posts sat on another
 *    tab. `hidden` keeps every input in the DOM and out of the a11y tree.
 *
 * 2. THE MAP MUST NOT BE BUILT INSIDE A HIDDEN CONTAINER. Google Maps measures
 *    its container at construction, so a map built while display:none renders
 *    as a grey square and stays grey. The initial state is therefore ALWAYS
 *    Today, whatever the link asked for: both ways of arriving somewhere else —
 *    `?tab=` and `#anchor` — switch in a mount effect, after the map has been
 *    constructed against a container with a real box. Seeding useState from
 *    either one puts `hidden` on the Today panel in the SSR stream and the map
 *    never recovers, because nothing in its deps changes when you come back.
 *
 * Server-rendered ReactNode props rather than children-with-context: the three
 * panels are built on the server, so switching tabs costs nothing and no data
 * is refetched.
 */
export default function QuickStopTabs({
  today,
  settings,
  insights,
  initialTab = 'today',
  openCount = 0,
}: {
  today: ReactNode;
  settings: ReactNode;
  insights: ReactNode;
  initialTab?: QuickStopTabId;
  openCount?: number;
}) {
  const [active, setActive] = useState<QuickStopTabId>('today');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /**
   * ?tab= lands — after first paint, never as the server's initial state.
   *
   * See constraint 2 above. The setup checklist links here with
   * `?tab=settings#quick-stop-setup`, and `select` rewrites the URL on every
   * tab click, so this param is on the ordinary route in rather than being a
   * hand-typed edge case: seeding state from it would grey out the coverage map
   * for anyone who had ever opened another tab and come back.
   *
   * Ahead of the hash effect so that a hash still wins when a link carries
   * both — they are batched into one render and the later write is the one that
   * sticks.
   */
  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  /**
   * Deep links still land.
   *
   * Five places link into sections of this page — Settings' own automations
   * card, the quick-stop panel component, the status block's "Review settings",
   * the explainer's jump buttons — and every one of them points at a section id
   * that now lives on a tab other than the default. Arriving at
   * `#quick-stop-setup` without this selects Today and scrolls to nothing.
   *
   * A hashchange listener as well as a mount read, because moving between two
   * anchors on the same page never remounts.
   */
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) return;
      const owner = isQuickStopSettingsAnchor(hash) ? 'settings' : QUICK_STOP_TABS.find((tab) => tab.id === hash)?.id;
      if (!owner) return;
      setActive(owner);
      // The panel is `hidden` until React re-renders, and scrollIntoView is a
      // no-op on a hidden element — so wait a frame for the switch to land.
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el instanceof HTMLDetailsElement) el.open = true;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  function select(id: QuickStopTabId) {
    setActive(id);
    // Reflected in the URL so a refresh or a shared link comes back to the same
    // tab. replaceState, not push: flipping a tab is not a navigation somebody
    // should have to press Back through.
    history.replaceState(null, '', `?tab=${id}`);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = QUICK_STOP_TABS.findIndex((tab) => tab.id === active);
    if (index === -1) return;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % QUICK_STOP_TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + QUICK_STOP_TABS.length) % QUICK_STOP_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = QUICK_STOP_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = QUICK_STOP_TABS[next].id;
    select(id);
    tabRefs.current[id]?.focus();
  }

  const panels: Record<QuickStopTabId, ReactNode> = { today, settings, insights };

  return (
    <>
      <div className="qs-tabnav" role="tablist" aria-label="Quick Stops sections" onKeyDown={onKeyDown}>
        {QUICK_STOP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`qs-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`qs-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            className={`qs-tab${active === tab.id ? ' active' : ''}`}
            onClick={() => select(tab.id)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'inherit' }}>
              {tab.label}
              {tab.id === 'today' && openCount > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '1.25rem',
                    height: '1.25rem',
                    padding: '0 0.35rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    backgroundColor: '#ff7a21',
                    color: '#ffffff',
                    lineHeight: 1,
                  }}
                  title={`${openCount} open request${openCount === 1 ? '' : 's'} waiting`}
                >
                  {openCount}
                </span>
              ) : null}
            </span>
            <small>{tab.hint}</small>
          </button>
        ))}
      </div>

      {QUICK_STOP_TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`qs-panel-${tab.id}`}
          aria-labelledby={`qs-tab-${tab.id}`}
          tabIndex={0}
          hidden={active !== tab.id}
          className="qs-tabpanel"
        >
          {panels[tab.id]}
        </div>
      ))}
    </>
  );
}
