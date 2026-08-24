'use client';

import { useEffect, useState } from 'react';

export type PlanTabId = 'usage' | 'plan';

export default function PlanSubnav({
  planName,
  initialTab = 'usage',
}: {
  planName: string;
  initialTab?: PlanTabId;
}) {
  const [activeTab, setActiveTab] = useState<PlanTabId>(initialTab);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (
        hash === '#change-plan' ||
        hash === '#current-plan' ||
        hash === '#cancel-plan' ||
        hash === '#plan-fit' ||
        hash === '#platform-fee' ||
        hash === '#choose-paid-plan'
      ) {
        setActiveTab('plan');
        updateDomSubviews('plan');
      } else if (
        hash === '#usage-balances' ||
        hash === '#workspace-storage' ||
        hash === '#buy-credits' ||
        hash === '#included-limits' ||
        hash === '#overage' ||
        hash === '#plan-at-a-glance' ||
        hash === '#plan'
      ) {
        setActiveTab('usage');
        updateDomSubviews('usage');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const updateDomSubviews = (tab: PlanTabId) => {
    const usagePanel = document.querySelector('[data-subview="usage"]');
    const planPanel = document.querySelector('[data-subview="plan"]');
    if (usagePanel) {
      usagePanel.classList.toggle('active', tab === 'usage');
      usagePanel.setAttribute('aria-hidden', tab === 'usage' ? 'false' : 'true');
    }
    if (planPanel) {
      planPanel.classList.toggle('active', tab === 'plan');
      planPanel.setAttribute('aria-hidden', tab === 'plan' ? 'false' : 'true');
    }
  };

  const setTab = (tab: PlanTabId) => {
    setActiveTab(tab);
    updateDomSubviews(tab);
    if (tab === 'plan') {
      window.history.replaceState(null, '', '#current-plan');
    } else {
      window.history.replaceState(null, '', '#usage-balances');
    }
  };

  return (
    <div className="plan-subnav-bar">
      <div className="plan-subnav-pillgroup" role="tablist" aria-label="Plan and usage sub-views">
        <button
          type="button"
          role="tab"
          id="tab-usage"
          aria-selected={activeTab === 'usage'}
          onClick={() => setTab('usage')}
          className={`plan-subnav-pill ${activeTab === 'usage' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="plan-subnav-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
          <span>Usage &amp; Balances</span>
          <span className="plan-subnav-badge live">Live</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-plan"
          aria-selected={activeTab === 'plan'}
          onClick={() => setTab('plan')}
          className={`plan-subnav-pill ${activeTab === 'plan' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="plan-subnav-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>Plan &amp; Subscription</span>
          <span className="plan-subnav-badge tier">{planName}</span>
        </button>
      </div>
    </div>
  );
}
