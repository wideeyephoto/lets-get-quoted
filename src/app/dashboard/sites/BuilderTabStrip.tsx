'use client';

import styles from './SiteEditor.module.css';

// The four builder tabs on a phone, as a strip riding the bottom edge of the
// live preview.
//
// It was briefly a chip — one label plus a dropdown — which reclaimed the same
// space but hid the fact that there were four tabs at all. A control nobody can
// see is not navigation. So all four are visible again, in the same place the
// row used to be and directly above the form they switch, just overlaying the
// preview rather than taking a layout row of their own: ~34px of preview
// instead of 63px off the form.
//
// The bottom edge and not the top: the top of a website is its header and logo,
// which is exactly the part an owner is looking at while editing branding.

export type TabStripItem = { id: string; label: string };

export default function BuilderTabStrip({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: readonly TabStripItem[];
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.tabStrip} role="tablist" aria-label="Website settings">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={tab.id === activeTab ? styles.tabStripActive : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
