'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { isAutomationsAnchor, resolveTabForHash, SETTINGS_TAB_EVENT } from '@/lib/nav-helpers';

export type SettingsTab = {
  id: string;
  label: string;
  // Section ids that live inside this tab, so deep links (#reviews,
  // #daily-digest, #finances, the tax-year links, …) open the right tab.
  anchors?: string[];
  content: ReactNode;
};

const TAB_ICONS: Record<string, string> = {
  account: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  plan: '<path d="M4 6.5h16v11H4z"/><path d="M7.5 10h4M7.5 14h7M16.5 9v2"/>',
  payments: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>',
  automations: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>',
  business: '<path d="M3.5 20.5h17"/><path d="M5 20.5V6.5l7-3.5 7 3.5v14"/><path d="M9.5 20.5v-4h5v4"/><path d="M9 10h1.5M13.5 10H15M9 13.2h1.5M13.5 13.2H15"/>',
};

// A tabbed sub-nav ("submenu") over the settings sections. All panels stay
// mounted and just toggle `hidden`, so the server-action forms inside keep
// working and switching tabs is instant. Implements the ARIA tabs pattern:
// roving tabindex, arrow/Home/End navigation, and tab<->panel wiring.
export default function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const router = useRouter();

  useEffect(() => {
    // Scroll to an anchored section once its panel is actually visible — the
    // element exists in the DOM while hidden, but scrollIntoView is a no-op on
    // display:none, so poll a few frames until offsetParent is non-null.
    const scrollWhenReady = (id: string, tries = 0) => {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null) {
        // A deep-linked automation card is a collapsed <details> — open it so the
        // linked section is actually visible, not just scrolled to a closed header.
        if (el instanceof HTMLDetailsElement) el.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries < 12) requestAnimationFrame(() => scrollWhenReady(id, tries + 1));
    };
    const open = (hash: string) => {
      const ownerId = resolveTabForHash(tabs, hash);
      if (!ownerId) {
        // AUTOMATIONS LEFT, AND ITS LINKS DID NOT.
        //
        // Eleven section ids used to resolve to a tab on this page, and links to
        // them are scattered through the product and through people's bookmarks.
        // A next.config redirect cannot catch any of them: a URL fragment is
        // never sent to the server, so there is nothing for a server rule to
        // match. Forwarded here instead, from the one component that already
        // reads the hash — with the hash intact, so the destination scrolls to
        // and opens the same card it always did.
        if (isAutomationsAnchor(hash)) router.replace(`/dashboard/automations#${hash}`);
        return;
      }
      setActive(ownerId);
      if (hash !== ownerId) scrollWhenReady(hash);
    };
    const applyHash = () => open(window.location.hash.replace(/^#/, ''));
    // An explicit request from a link elsewhere in the app. Needed because
    // hashchange is not enough on its own: Next's <Link> navigates with
    // pushState, which never fires it, and a link to the hash the URL already
    // carries changes nothing to listen for. See lib/nav-helpers.
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
  }, [tabs, router]);

  function select(id: string) {
    setActive(id);
    // Reflect the tab in the URL (no jump) so a refresh or a shared link lands
    // back on the same tab.
    history.replaceState(null, '', `#${id}`);
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function onTablistKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((tab) => tab.id === active);
    if (idx === -1) return;
    let nextIdx: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIdx = (idx + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = tabs.length - 1;
    if (nextIdx === null) return;
    event.preventDefault();
    const nextId = tabs[nextIdx].id;
    select(nextId);
    tabRefs.current[nextId]?.focus();
  }

  return (
    <>
      <div className="settings-tabnav" role="tablist" aria-label="Settings sections" ref={navRef} onKeyDown={onTablistKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            data-tab={t.id}
            aria-selected={active === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            className={`settings-tab${active === t.id ? ' active' : ''}`}
            onClick={() => select(t.id)}
          >
            <svg className="settings-tab-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TAB_ICONS[t.id] ?? '' }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`settings-panel-${t.id}`}
          aria-labelledby={`settings-tab-${t.id}`}
          tabIndex={0}
          hidden={active !== t.id}
          className="settings-tabpanel"
        >
          {t.content}
        </div>
      ))}
    </>
  );
}
