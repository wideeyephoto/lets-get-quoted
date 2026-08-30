'use client';

import { useState } from 'react';
import type { PlatformCampaignRecord } from '@/lib/admin-platform-campaigns';
import { PLATFORM_AUDIENCES } from '@/lib/admin-platform-campaigns';
import AdminCampaignComposer from './AdminCampaignComposer';
import AdminCampaignHistory from './AdminCampaignHistory';
import styles from '../admin.module.css';

type Props = {
  adminEmail: string;
  initialAudienceReach: Record<string, number>;
  initialCampaigns: PlatformCampaignRecord[];
};

export default function AdminCampaignsClient({
  adminEmail,
  initialAudienceReach,
  initialCampaigns,
}: Props) {
  const [activeTab, setActiveTab] = useState<'composer' | 'history' | 'audiences'>('composer');
  const [campaigns, setCampaigns] = useState<PlatformCampaignRecord[]>(initialCampaigns);

  return (
    <div>
      {/* Navigation Tabs */}
      <div className={styles.tabStrip}>
        <button
          type="button"
          onClick={() => setActiveTab('composer')}
          className={`${styles.tabBtn} ${activeTab === 'composer' ? styles.tabActive : ''}`}
        >
          <span>New Campaign</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabActive : ''}`}
        >
          <span>Campaign History</span>
          {campaigns.length > 0 && (
            <span className={styles.tabBadge}>{campaigns.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audiences')}
          className={`${styles.tabBtn} ${activeTab === 'audiences' ? styles.tabActive : ''}`}
        >
          <span>Audiences &amp; Reach</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'composer' && (
        <AdminCampaignComposer
          adminEmail={adminEmail}
          initialAudienceReach={initialAudienceReach}
          onCampaignSent={() => {
            // Switch to history tab on campaign send
            setActiveTab('history');
          }}
        />
      )}

      {activeTab === 'history' && (
        <AdminCampaignHistory
          campaigns={campaigns}
          onSelectCampaign={(selected) => {
            // Switch to composer when re-using a campaign
            setActiveTab('composer');
          }}
        />
      )}

      {activeTab === 'audiences' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1rem' }}>
          {PLATFORM_AUDIENCES.map((aud) => {
            const count = initialAudienceReach[aud.id] ?? 0;
            return (
              <div key={aud.id} className={styles.panel} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                      {aud.label}
                    </h3>
                    <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
                      Cohort: <code>{aud.id}</code>
                    </span>
                  </div>
                  <span className={`${styles.pill} ${styles.accent}`} style={{ fontSize: '0.66rem' }}>
                    {aud.badge}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(247, 245, 239, 0.7)', lineHeight: 1.45, flex: 1 }}>
                  {aud.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div>
                    <span className={styles.muted} style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Current Deliverable Size:
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                      {count} <span style={{ fontSize: '0.76rem', fontWeight: 500, color: 'rgba(247, 245, 239, 0.5)' }}>recipients</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('composer')}
                    className="button small"
                    style={{ fontSize: '0.72rem' }}
                  >
                    Draft to this group →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
