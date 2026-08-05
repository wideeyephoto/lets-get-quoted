'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SETTINGS_TAB_EVENT } from '@/lib/nav-helpers';
import { setupHeadline, type BusinessSetup, type SetupItem, type SetupSection } from '@/lib/business-setup';

export type BusinessSectionId = 'overview' | SetupSection | 'data' | 'taxes';

export type BusinessSection = {
  id: BusinessSectionId;
  label: string;
  /** One line under the heading, so a section says what it is before you read the forms. */
  blurb: string;
  /** Section ids inside this panel, so /dashboard/settings#job-costing still lands in the right place. */
  anchors?: string[];
  content: ReactNode;
};

const RAIL_ICONS: Record<BusinessSectionId, string> = {
  overview: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5h4v5"/>',
  profile: '<rect x="3.2" y="4.5" width="17.6" height="15" rx="2.4"/><circle cx="9" cy="10.4" r="2.2"/><path d="M5.6 16.4a3.7 3.7 0 0 1 6.8 0"/><path d="M14.6 9.5h4M14.6 13h4"/>',
  costs: '<circle cx="12" cy="12" r="8.4"/><path d="M14.6 9.2h-3.9a1.55 1.55 0 0 0 0 3.1h2.6a1.55 1.55 0 0 1 0 3.1H9"/><path d="M12 16.9V7.1"/>',
  trust: '<path d="M12 3.2 5 6.1v5.6c0 4.4 2.9 8.4 7 9.7 4.1-1.3 7-5.3 7-9.7V6.1z"/><path d="m9 12.1 2.1 2.1 4.1-4.2"/>',
  apps: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.4.4l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.4-.4l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5"/>',
  data: '<path d="M12 15.5V4.2"/><path d="m8 8.2 4-4 4 4"/><path d="M4.5 14.5v3.4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.4"/>',
  taxes: '<path d="M6.5 3.4h8.2L19 7.7v12.9H6.5z"/><path d="M14.3 3.4v4.4H19"/><path d="M9.4 12h6M9.4 15.4h4.2"/>',
};

function StateMark({ state }: { state: SetupItem['state'] }) {
  if (state === 'complete') {
    return (
      <svg className="bz-mark is-complete" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" /><path d="m8.2 12.3 2.6 2.6 5-5.2" />
      </svg>
    );
  }
  if (state === 'attention') {
    return (
      <svg className="bz-mark is-attention" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" /><path d="M12 7.6v5.2" /><path d="M12 16.3h.01" />
      </svg>
    );
  }
  return (
    <svg className="bz-mark is-todo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

/** The ring around the count. Pure SVG, like every other chart in here. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? done / total : 0;
  return (
    <div className="bz-ring" role="img" aria-label={`${done} of ${total} essentials complete`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} className="bz-ring-track" />
        <circle
          cx="32" cy="32" r={radius}
          className="bz-ring-fill"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="bz-ring-num">
        <strong>{done}</strong>
        <small>of {total}</small>
      </span>
    </div>
  );
}

/**
 * The Business tab, as a workspace rather than a scroll.
 *
 * Every panel stays mounted and toggles `hidden`, exactly as the tabs above it
 * do — the forms inside are server actions, and unmounting one mid-submit is how
 * you lose somebody's typing.
 */
export default function BusinessWorkspace({ sections, setup }: { sections: BusinessSection[]; setup: BusinessSetup }) {
  const [active, setActive] = useState<BusinessSectionId>('overview');
  const railRef = useRef<HTMLDivElement>(null);

  // anchor -> section, so a deep link from anywhere in the app still resolves.
  const owners = useMemo(() => {
    const map = new Map<string, BusinessSectionId>();
    for (const section of sections) {
      map.set(section.id, section.id);
      for (const anchor of section.anchors ?? []) map.set(anchor, section.id);
    }
    return map;
  }, [sections]);

  const open = useCallback((hash: string) => {
    const owner = owners.get(hash);
    if (owner) setActive(owner);
  }, [owners]);

  useEffect(() => {
    const applyHash = () => open(window.location.hash.replace(/^#/, ''));
    // Same two signals the settings tabs listen for: a real hashchange, and the
    // custom event, because Next's <Link> navigates with pushState and never
    // fires one. See lib/nav-helpers.
    const onRequest = (event: Event) => {
      const hash = (event as CustomEvent<string>).detail;
      if (typeof hash === 'string') open(hash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    window.addEventListener(SETTINGS_TAB_EVENT, onRequest);
    return () => {
      window.removeEventListener('hashchange', applyHash);
      window.removeEventListener(SETTINGS_TAB_EVENT, onRequest);
    };
  }, [open]);

  function go(id: BusinessSectionId) {
    setActive(id);
    railRef.current?.querySelector<HTMLElement>(`[data-bz="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    // Back to the top of the panel — a section switched into halfway down reads
    // as a page that failed to load its heading.
    document.getElementById('bz-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const current = sections.find((section) => section.id === active) ?? sections[0];
  const numbered = sections.filter((section) => section.id !== 'overview');

  return (
    <div className="bz-shell">
      <nav className="bz-rail" aria-label="Business settings" ref={railRef}>
        <p className="eyebrow">Account</p>
        <h2 className="bz-rail-title">Business</h2>
        <ul>
          {sections.map((section) => {
            const badge = setup.alerts.filter((alert) => alert.section === section.id).length;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  data-bz={section.id}
                  className={`bz-rail-link${active === section.id ? ' is-active' : ''}`}
                  aria-current={active === section.id ? 'page' : undefined}
                  onClick={() => go(section.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: RAIL_ICONS[section.id] }} />
                  <span>{section.label}</span>
                  {badge > 0 ? <em className="bz-rail-badge" aria-label={`${badge} needing attention`}>{badge}</em> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="bz-panel" id="bz-panel">
        {sections.map((section) => (
          <div key={section.id} hidden={section.id !== active}>
            {section.id === 'overview' ? (
              <>
                <section className="panel workspace-section-card bz-overview">
                  <div className="bz-overview-head">
                    <div>
                      <h3>Setup overview</h3>
                      <p>{setupHeadline(setup)}</p>
                    </div>
                    <ProgressRing done={setup.done} total={setup.total} />
                  </div>

                  {/* Only the broken ones. An account with things merely not
                      started raises nothing here — see lib/business-setup. */}
                  {setup.alerts.length > 0 ? (
                    <div className="bz-alerts">
                      {setup.alerts.map((alert) => (
                        <div className="bz-alert" key={alert.id}>
                          <StateMark state="attention" />
                          <span>
                            <strong>{alert.label}</strong>
                            <small>{alert.detail}</small>
                          </span>
                          <button type="button" className="btn secondary" onClick={() => go(alert.section)}>{alert.actionLabel}</button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <ul className="bz-checklist">
                    {setup.items.map((item) => (
                      <li key={item.id} className={`bz-check is-${item.state}`}>
                        <StateMark state={item.state} />
                        <span className="bz-check-copy">
                          <strong>{item.label}{item.essential ? null : <em className="bz-optional">Optional</em>}</strong>
                          <small>{item.detail}</small>
                        </span>
                        <button type="button" className="linklike" onClick={() => go(item.section)}>{item.actionLabel}</button>
                      </li>
                    ))}
                  </ul>
                </section>

                <ul className="bz-jump">
                  {numbered.map((section, index) => (
                    <li key={section.id}>
                      <button type="button" className="bz-jump-card" onClick={() => go(section.id)}>
                        <span className="bz-jump-num" aria-hidden="true">{index + 1}</span>
                        <span>
                          <strong>{section.label}</strong>
                          <small>{section.blurb}</small>
                        </span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <header className="bz-section-head">
                  <h3>{section.label}</h3>
                  <p>{section.blurb}</p>
                </header>
                {section.content}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Screen-reader-only announcement of where you are, since the rail's
          active state is the only other signal. */}
      <p className="sr-only" aria-live="polite">{current?.label}</p>
    </div>
  );
}
