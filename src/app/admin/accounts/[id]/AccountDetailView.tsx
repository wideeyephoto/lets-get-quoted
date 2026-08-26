'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';

export type AccountTabId = 'overview' | 'billing' | 'messages' | 'support' | 'staff' | 'all';

export interface AccountTab {
  id: AccountTabId;
  label: string;
  icon: string;
  badge?: number | string | null;
}

export default function AccountDetailView({
  tabs,
  defaultTab = 'overview',
  children,
}: {
  tabs: AccountTab[];
  defaultTab?: AccountTabId;
  children: (activeTab: AccountTabId) => React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<AccountTabId>(defaultTab);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '') as AccountTabId;
      if (['overview', 'billing', 'messages', 'support', 'staff', 'all'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const selectTab = (tabId: AccountTabId) => {
    setActiveTab(tabId);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tabId}`);
    }
  };

  return (
    <div>
      <nav className={styles.tabStrip} role="tablist" aria-label="Account sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabBtn} ${isActive ? styles.tabActive : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge != null && tab.badge !== 0 ? (
                <span className={styles.tabBadge}>{tab.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel">
        {children(activeTab)}
      </div>
    </div>
  );
}
