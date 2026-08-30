'use client';

import { useState } from 'react';
import type { PlatformCampaignRecord } from '@/lib/admin-campaign-types';
import styles from '../admin.module.css';

type Props = {
  campaigns: PlatformCampaignRecord[];
  onSelectCampaign?: (campaign: PlatformCampaignRecord) => void;
};

export default function AdminCampaignHistory({
  campaigns,
  onSelectCampaign,
}: Props) {
  const [selectedRecord, setSelectedRecord] = useState<PlatformCampaignRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filtered = campaigns.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.subject.toLowerCase().includes(term) ||
      c.audience.toLowerCase().includes(term) ||
      c.sentBy.toLowerCase().includes(term)
    );
  });

  return (
    <section className={styles.panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Platform Broadcast History</h2>
          <p className={styles.muted} style={{ fontSize: '0.76rem', margin: '0.2rem 0 0' }}>
            Permanent record of all platform emails sent from Let’s Get Quoted to contractors.
          </p>
        </div>
        <div>
          <input
            className={styles.input}
            type="search"
            placeholder="Search campaigns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', width: '220px' }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'rgba(247, 245, 239, 0.5)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No past platform campaigns match your search.</p>
          <p className={styles.muted} style={{ fontSize: '0.76rem', marginTop: '0.4rem' }}>
            Compose a new broadcast in the New Campaign tab to send your first platform announcement.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Subject &amp; Heading</th>
                <th>Audience</th>
                <th>Delivered</th>
                <th>Theme</th>
                <th>Sent By</th>
                <th>Sent Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isSent = item.status === 'sent';
                const isPartial = item.status === 'partially_failed';
                return (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#ffffff', display: 'block' }}>{item.subject}</strong>
                      <span className={styles.muted} style={{ fontSize: '0.74rem' }}>
                        {item.heading}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles.accent}`} style={{ fontSize: '0.66rem' }}>
                        {item.audience.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${isSent ? styles.good : isPartial ? styles.warn : styles.bad}`}>
                        {item.sentCount} / {item.recipientCount}
                      </span>
                    </td>
                    <td>
                      <span className={styles.muted} style={{ textTransform: 'capitalize' }}>
                        {item.theme}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.74rem' }}>{item.sentBy}</code>
                    </td>
                    <td>
                      <span className={styles.muted} style={{ fontSize: '0.76rem' }}>
                        {new Date(item.sentAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(item)}
                          className="button small secondary"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                        >
                          View
                        </button>
                        {onSelectCampaign && (
                          <button
                            type="button"
                            onClick={() => onSelectCampaign(item)}
                            className="button small"
                            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                          >
                            Reuse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className={styles.panel}
            style={{
              maxWidth: '620px',
              width: '100%',
              background: '#08121f',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              padding: '1.5rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
              <div>
                <p className={styles.eyebrow}>Platform Campaign Details</p>
                <h2 className={styles.title} style={{ fontSize: '1.25rem', margin: '0.2rem 0' }}>
                  {selectedRecord.subject}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="button small secondary"
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.6rem', fontSize: '0.76rem', marginBottom: '1rem' }}>
              <div><span className={styles.muted}>Audience:</span> {selectedRecord.audience.replace(/_/g, ' ')}</div>
              <div><span className={styles.muted}>Delivered:</span> {selectedRecord.sentCount} of {selectedRecord.recipientCount}</div>
              <div><span className={styles.muted}>From:</span> {selectedRecord.senderName} &lt;{selectedRecord.senderEmail}&gt;</div>
              <div><span className={styles.muted}>Theme:</span> {selectedRecord.theme}</div>
              <div><span className={styles.muted}>Sent By:</span> {selectedRecord.sentBy}</div>
              <div><span className={styles.muted}>Date:</span> {new Date(selectedRecord.sentAt).toLocaleString()}</div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '0.3rem' }}>Heading:</strong>
              <div style={{ padding: '0.5rem 0.7rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.4rem', fontSize: '0.82rem' }}>
                {selectedRecord.heading}
              </div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <strong style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '0.3rem' }}>Message Body:</strong>
              <pre style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem', fontSize: '0.76rem', whiteSpace: 'pre-wrap', color: 'rgba(247, 245, 239, 0.85)', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>
                {selectedRecord.body}
              </pre>
            </div>

            {selectedRecord.ctaLabel && (
              <div style={{ marginBottom: '1.2rem', padding: '0.6rem 0.8rem', background: 'rgba(255, 122, 33, 0.08)', borderRadius: '0.5rem', border: '1px solid rgba(255, 122, 33, 0.2)', fontSize: '0.78rem' }}>
                <strong>CTA Button:</strong> {selectedRecord.ctaLabel} → <code style={{ color: '#ff9447' }}>{selectedRecord.ctaUrl}</code>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              {onSelectCampaign && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCampaign(selectedRecord);
                    setSelectedRecord(null);
                  }}
                  className="button small primary"
                >
                  Duplicate into Composer
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="button small secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
