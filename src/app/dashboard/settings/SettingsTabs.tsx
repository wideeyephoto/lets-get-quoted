'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  payments: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>',
  automations: '<path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/>',
  business: '<path d="M3.5 20.5h17"/><path d="M5 20.5V6.5l7-3.5 7 3.5v14"/><path d="M9.5 20.5v-4h5v4"/><path d="M9 10h1.5M13.5 10H15M9 13.2h1.5M13.5 13.2H15"/>',
};

// A tabbed sub-nav ("submenu") over the settings sections. All panels stay
// mounted and just toggle `hidden`, so the server-action forms inside keep
// working and switching tabs is instant.
export default function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to an anchored section once its panel is actually visible — the
    // element exists in the DOM while hidden, but scrollIntoView is a no-op on
    // display:none, so poll a few frames until offsetParent is non-null.
    const scrollWhenReady = (id: string, tries = 0) => {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries < 12) requestAnimationFrame(() => scrollWhenReady(id, tries + 1));
    };
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) return;
      const owner = tabs.find((t) => t.id === hash || t.anchors?.includes(hash));
      if (!owner) return;
      setActive(owner.id);
      if (hash !== owner.id) scrollWhenReady(hash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    // Reflect the tab in the URL (no jump) so a refresh or a shared link lands
    // back on the same tab.
    history.replaceState(null, '', `#${id}`);
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  return (
    <>
      <div className="settings-tabnav" role="tablist" aria-label="Settings sections" ref={navRef}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={active === t.id}
            className={`settings-tab${active === t.id ? ' active' : ''}`}
            onClick={() => select(t.id)}
          >
            <svg className="settings-tab-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TAB_ICONS[t.id] ?? '' }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} className="settings-tabpanel">
          {t.content}
        </div>
      ))}
    </>
  );
}
