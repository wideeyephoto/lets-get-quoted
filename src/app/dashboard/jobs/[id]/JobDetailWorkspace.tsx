'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { JobDetailLayout } from '@/lib/dashboard-views';
import { setJobDetailLayoutAction } from '@/app/dashboard/view-actions';

export type JobDetailTab = 'overview' | 'financials' | 'execution' | 'selections' | 'settings';

export interface TabBadges {
  feedCount?: number;
  remainingLabel?: string;
  tasksDone?: number;
  tasksTotal?: number;
  selectionsWaiting?: number;
  selectionsOverdue?: number;
  scheduledLabel?: string | null;
}

interface JobDetailWorkspaceProps {
  jobId: string;
  layout: JobDetailLayout;
  initialTab?: JobDetailTab;
  badges: TabBadges;
  overviewPane: ReactNode;
  financialsPane: ReactNode;
  executionPane: ReactNode;
  selectionsPane: ReactNode;
  settingsPane: ReactNode;
  classicContent: ReactNode;
}

export default function JobDetailWorkspace({
  jobId: _jobId,
  layout: initialLayout,
  initialTab = 'overview',
  badges,
  overviewPane,
  financialsPane,
  executionPane,
  selectionsPane,
  settingsPane,
  classicContent,
}: JobDetailWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [layout, setLayout] = useState<JobDetailLayout>(initialLayout);
  const [, startTransition] = useTransition();

  // Determine active tab from search params or deep links if present, else state
  const paramTab = searchParams.get('tab') as JobDetailTab | null;
  const validTabs: JobDetailTab[] = ['overview', 'financials', 'execution', 'selections', 'settings'];
  const [activeTab, setActiveTab] = useState<JobDetailTab>(
    paramTab && validTabs.includes(paramTab) ? paramTab : initialTab
  );

  const handleTabChange = (tab: JobDetailTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  const handleLayoutToggle = (newLayout: JobDetailLayout) => {
    setLayout(newLayout);
    startTransition(async () => {
      await setJobDetailLayoutAction(newLayout);
      router.refresh();
    });
  };

  return (
    <div className="job-workspace-container">
      {/* View Switcher Controls */}
      <div className="job-layout-bar">
        <div className="job-layout-toggle-group" role="radiogroup" aria-label="Job page layout style">
          <button
            type="button"
            className={`job-layout-toggle-btn ${layout === 'tabs' ? 'is-active' : ''}`}
            onClick={() => handleLayoutToggle('tabs')}
            aria-pressed={layout === 'tabs'}
            title="Tabbed Workspace view (streamlined, low scroll)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>Tabbed Hub</span>
          </button>
          <button
            type="button"
            className={`job-layout-toggle-btn ${layout === 'classic' ? 'is-active' : ''}`}
            onClick={() => handleLayoutToggle('classic')}
            aria-pressed={layout === 'classic'}
            title="Classic stacked scroll view"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <span>Classic Stack</span>
          </button>
        </div>
      </div>

      {layout === 'tabs' ? (
        <div className="job-tabs-workspace">
          {/* Main Navigation Tabs */}
          <nav className="job-workspace-tabs" aria-label="Job sections">
            <button
              type="button"
              className={`job-workspace-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('overview')}
            >
              <span className="job-tab-icon">⚡</span>
              <span className="job-tab-label">Overview &amp; Feed</span>
              {badges.feedCount && badges.feedCount > 0 ? (
                <span className="job-tab-badge">{badges.feedCount}</span>
              ) : null}
            </button>

            <button
              type="button"
              className={`job-workspace-tab ${activeTab === 'financials' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('financials')}
            >
              <span className="job-tab-icon">💰</span>
              <span className="job-tab-label">Financials &amp; ROI</span>
              {badges.remainingLabel ? (
                <span className="job-tab-badge font-mono">{badges.remainingLabel}</span>
              ) : null}
            </button>

            <button
              type="button"
              className={`job-workspace-tab ${activeTab === 'execution' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('execution')}
            >
              <span className="job-tab-icon">🛠️</span>
              <span className="job-tab-label">Tasks &amp; Milestones</span>
              {badges.tasksTotal && badges.tasksTotal > 0 ? (
                <span className="job-tab-badge">
                  {badges.tasksDone}/{badges.tasksTotal}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              className={`job-workspace-tab ${activeTab === 'selections' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('selections')}
            >
              <span className="job-tab-icon">🎨</span>
              <span className="job-tab-label">Selections</span>
              {badges.selectionsWaiting && badges.selectionsWaiting > 0 ? (
                <span className={`job-tab-badge ${badges.selectionsOverdue && badges.selectionsOverdue > 0 ? 'is-danger' : 'is-warning'}`}>
                  {badges.selectionsWaiting}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              className={`job-workspace-tab ${activeTab === 'settings' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('settings')}
            >
              <span className="job-tab-icon">⚙️</span>
              <span className="job-tab-label">Schedule &amp; Crew</span>
              {badges.scheduledLabel ? (
                <span className="job-tab-badge is-muted">{badges.scheduledLabel}</span>
              ) : null}
            </button>
          </nav>

          {/* Active Tab Panel */}
          <div className="job-tab-pane" role="tabpanel">
            {activeTab === 'overview' && overviewPane}
            {activeTab === 'financials' && financialsPane}
            {activeTab === 'execution' && executionPane}
            {activeTab === 'selections' && selectionsPane}
            {activeTab === 'settings' && settingsPane}
          </div>
        </div>
      ) : (
        <div className="job-classic-workspace">
          {classicContent}
        </div>
      )}
    </div>
  );
}
