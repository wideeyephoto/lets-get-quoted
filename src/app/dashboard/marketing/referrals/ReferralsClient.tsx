'use client';

import React, { useState, useTransition, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { ReferralQueue, ReferralRow } from '@/lib/referral-queue';
import { formatMoney } from '@/lib/jobs';
import SaveButton from '@/components/save-button';
import { QRCodeSvg } from '@/components/ui/QRCodeSvg';
import { buildReferralShareText } from '@/lib/referrals';
import styles from './referrals.module.css';

export type ClientLinkItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  referralCode: string;
  referralUrl: string;
  shareText: string;
  totalSent?: number;
  totalWon?: number;
};

export type AdvocateItem = {
  clientId: string;
  name: string;
  phone: string | null;
  email: string | null;
  totalSent: number;
  totalWon: number;
  revenue: number;
  owedCount: number;
  referralUrl: string;
  shareText: string;
};

export type RevenueMetrics = {
  totalWonRevenue: number;
  totalReferrals: number;
  totalWon: number;
  totalOwed: number;
  totalThanked: number;
};

interface ReferralsClientProps {
  queue: ReferralQueue;
  reward: string;
  configured: boolean;
  bookingUrl: string | null;
  businessName: string;
  clientLinks: ClientLinkItem[];
  advocates: AdvocateItem[];
  metrics: RevenueMetrics;
  basePath?: string;
  leadsError?: boolean;
  stopsError?: boolean;
  onSettleAction: (formData: FormData) => Promise<void>;
  onUnsettleAction: (formData: FormData) => Promise<void>;
  onSetRewardAction: (formData: FormData) => Promise<void>;
}

function formatDay(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function computeDaysAgo(iso: string): number {
  if (!iso) return 0;
  const introduced = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - introduced);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function ReferralsClient({
  queue,
  reward,
  configured,
  bookingUrl,
  businessName,
  clientLinks,
  advocates,
  metrics,
  basePath = '/dashboard',
  leadsError = false,
  stopsError = false,
  onSettleAction,
  onUnsettleAction,
  onSetRewardAction,
}: ReferralsClientProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrModalClient, setQrModalClient] = useState<{ name: string; url: string } | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [rewardDraft, setRewardDraft] = useState(reward);
  const [isPending, startTransition] = useTransition();
  const [showThanked, setShowThanked] = useState(false);

  // 5-second undo toast state
  const [undoState, setUndoState] = useState<{
    row: ReferralRow;
    timer: NodeJS.Timeout;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (undoState?.timer) clearTimeout(undoState.timer);
    };
  }, [undoState]);

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 3000);
    }
  };

  const handleSettleWithUndo = (row: ReferralRow, formData: FormData) => {
    startTransition(async () => {
      await onSettleAction(formData);
      if (undoState?.timer) clearTimeout(undoState.timer);
      const timer = setTimeout(() => {
        setUndoState(null);
      }, 5000);
      setUndoState({ row, timer });
    });
  };

  const handleUndo = () => {
    if (!undoState) return;
    const row = undoState.row;
    clearTimeout(undoState.timer);
    setUndoState(null);

    const formData = new FormData();
    formData.append('leadIds', row.leadIds.join(','));
    formData.append('stopIds', row.stopIds.join(','));

    startTransition(async () => {
      await onUnsettleAction(formData);
    });
  };

  const handleReopenConfirm = (row: ReferralRow, formData: FormData) => {
    const ok = window.confirm(
      `Reopen referral for ${row.referrerName}?\n\nThis will move ${row.referredName} back into the 'Owed a thank-you' list.`
    );
    if (ok) {
      startTransition(async () => {
        await onUnsettleAction(formData);
      });
    }
  };

  // Filtered customer links
  const filteredClientLinks = useMemo(() => {
    if (!clientSearch.trim()) return clientLinks.slice(0, 15);
    const q = clientSearch.toLowerCase();
    return clientLinks
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [clientLinks, clientSearch]);

  // Filtered queue rows
  const filteredOwed = useMemo(() => {
    if (!queueSearch.trim()) return queue.owed;
    const q = queueSearch.toLowerCase();
    return queue.owed.filter(
      (r) =>
        r.referrerName.toLowerCase().includes(q) ||
        r.referredName.toLowerCase().includes(q) ||
        (r.referredPhone && r.referredPhone.includes(q)) ||
        (r.referredEmail && r.referredEmail.toLowerCase().includes(q))
    );
  }, [queue.owed, queueSearch]);

  // Export referrals to CSV
  const handleExportCsv = () => {
    const headers = ['Type', 'Referrer Name', 'Referrer Client ID', 'Referred Customer', 'Phone', 'Email', 'Introduced Date', 'Settled Date', 'Status', 'Attributed Revenue'];
    const allRows: (string | number)[][] = [];

    queue.owed.forEach((r) => {
      allRows.push([
        'Owed',
        r.referrerName,
        r.referrerClientId,
        r.referredName,
        r.referredPhone || '',
        r.referredEmail || '',
        formatDay(r.introducedAt),
        '',
        'Won (Unthanked)',
        r.value || 0,
      ]);
    });

    queue.waiting.forEach((r) => {
      allRows.push([
        'Waiting',
        r.referrerName,
        r.referrerClientId,
        r.referredName,
        r.referredPhone || '',
        r.referredEmail || '',
        formatDay(r.introducedAt),
        '',
        'Inquiry / In Progress',
        r.value || 0,
      ]);
    });

    queue.thanked.forEach((r) => {
      allRows.push([
        'Thanked',
        r.referrerName,
        r.referrerClientId,
        r.referredName,
        r.referredPhone || '',
        r.referredEmail || '',
        formatDay(r.introducedAt),
        r.settledAt ? formatDay(r.settledAt) : '',
        'Thanked & Settled',
        r.value || 0,
      ]);
    });

    const csvContent = [headers.join(','), ...allRows.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `referrals-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preview message for the offer
  const liveSharePreview = useMemo(() => {
    const sampleUrl = bookingUrl ? `${bookingUrl}?ref=sample-code` : 'https://yourbusiness.letsgetquoted.com/book/online?ref=sample-code';
    return buildReferralShareText({
      referrerName: 'Sarah',
      businessName: businessName || 'our company',
      shareUrl: sampleUrl,
    });
  }, [bookingUrl, businessName]);

  const hasErrors = leadsError || stopsError;

  return (
    <>
      {/* Undo Toast */}
      {undoState ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <span>
            Marked <strong>{undoState.row.referrerName}</strong> as thanked.
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="btn"
            style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#3b82f6', color: '#fff' }}
          >
            Undo
          </button>
        </div>
      ) : null}

      {/* QR Code Modal */}
      {qrModalClient ? (
        <div className={styles.modalOverlay} onClick={() => setQrModalClient(null)} role="dialog" aria-modal="true" aria-label={`Referral QR Code for ${qrModalClient.name}`}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Direct Referral QR Code</p>
            <h3 style={{ margin: '0.25rem 0 0.5rem', color: '#f8fafc' }}>{qrModalClient.name}</h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              Have the homeowner scan this with their phone camera at the door or print it on a leave-behind card.
            </p>
            <div className={styles.qrWrap}>
              <QRCodeSvg value={qrModalClient.url} size={220} />
            </div>
            <div style={{ wordBreak: 'break-all', fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>
              {qrModalClient.url}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => handleCopy('modal-qr', qrModalClient.url)}
              >
                {copiedId === 'modal-qr' ? 'Copied Link! ✓' : 'Copy Link'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setQrModalClient(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Executive Revenue & Funnel Strip */}
      <div className={styles.metricsGrid}>
        <div className={`${styles.metricCard} ${metrics.totalOwed > 0 ? styles.metricCardHighlight : ''}`}>
          <span className={styles.metricLabel}>Owed Thank-Yous</span>
          <span className={styles.metricValue}>{metrics.totalOwed}</span>
          <span className={styles.metricSub}>
            {metrics.totalOwed === 1 ? '1 client awaiting reward' : `${metrics.totalOwed} clients awaiting rewards`}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Attributed Revenue</span>
          <span className={styles.metricValue}>{formatMoney(metrics.totalWonRevenue)}</span>
          <span className={styles.metricSub}>From booked referral work</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Booked / Won</span>
          <span className={styles.metricValue}>{metrics.totalWon}</span>
          <span className={styles.metricSub}>{metrics.totalReferrals} total introduced</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Thanked &amp; Paid</span>
          <span className={styles.metricValue}>{metrics.totalThanked}</span>
          <span className={styles.metricSub}>Completed rewards</span>
        </div>
      </div>

      <div className={styles.funnelStrip} aria-label="Referral Conversion Funnel">
        <div className={styles.funnelStep}>
          <span className={styles.funnelStepNum}>{metrics.totalReferrals}</span>
          <span className={styles.funnelStepLabel}>Introduced</span>
        </div>
        <span className={styles.funnelArrow}>→</span>
        <div className={styles.funnelStep}>
          <span className={styles.funnelStepNum}>{metrics.totalWon}</span>
          <span className={styles.funnelStepLabel}>Booked Won</span>
        </div>
        <span className={styles.funnelArrow}>→</span>
        <div className={styles.funnelStep}>
          <span className={styles.funnelStepNum}>{metrics.totalOwed}</span>
          <span className={styles.funnelStepLabel} style={{ color: metrics.totalOwed > 0 ? '#facc15' : undefined }}>
            Owed
          </span>
        </div>
        <span className={styles.funnelArrow}>→</span>
        <div className={styles.funnelStep}>
          <span className={styles.funnelStepNum}>{metrics.totalThanked}</span>
          <span className={styles.funnelStepLabel}>Thanked</span>
        </div>
      </div>

      {/* Top Advocates / Referrers */}
      {advocates.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Leaderboard</p>
            <h2>Top customer advocates</h2>
          </div>
          <p className="workspace-details-copy">
            The homeowners driving your word-of-mouth growth. Send them their link or a special thank-you.
          </p>
          <div className={styles.advocateGrid}>
            {advocates.slice(0, 6).map((adv) => (
              <div key={adv.clientId} className={styles.advocateCard}>
                <div>
                  <div className={styles.advocateName}>
                    <Link href={`${basePath}/clients/${adv.clientId}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {adv.name}
                    </Link>
                  </div>
                  <div className={styles.advocateStats}>
                    <strong>{adv.totalSent}</strong> sent · <strong>{adv.totalWon}</strong> booked ·{' '}
                    <strong style={{ color: '#22c55e' }}>{formatMoney(adv.revenue)}</strong> won
                    {adv.owedCount > 0 ? (
                      <div style={{ color: '#facc15', fontWeight: 600, marginTop: '4px' }}>
                        ⚠ Owed {adv.owedCount} thank-you
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={styles.advocateActions}>
                  <button
                    type="button"
                    className={`${styles.linkButton} ${copiedId === `adv-${adv.clientId}` ? styles.copiedBadge : ''}`}
                    onClick={() => handleCopy(`adv-${adv.clientId}`, adv.referralUrl)}
                    aria-label={`Copy referral link for ${adv.name}`}
                  >
                    {copiedId === `adv-${adv.clientId}` ? 'Copied! ✓' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setQrModalClient({ name: adv.name, url: adv.referralUrl })}
                    aria-label={`Show QR code for ${adv.name}`}
                  >
                    QR Code
                  </button>
                  {adv.phone ? (
                    <a
                      href={`sms:${adv.phone}?body=${encodeURIComponent(adv.shareText)}`}
                      className={styles.linkButton}
                      aria-label={`Text referral link to ${adv.name}`}
                    >
                      💬 Text
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Your Customers' Links (Missing Product) */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Distribution</p>
          <h2>Your customers&apos; links</h2>
        </div>
        <p className="workspace-details-copy">
          Every customer gets a unique, tracked link. Search any customer to copy their link, present a door-side QR code, or text it to them directly.
        </p>

        <div className={styles.searchBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search customers by name, phone, or email…"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            aria-label="Search customer referral links"
          />
          {clientSearch ? (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }}
              onClick={() => setClientSearch('')}
            >
              Clear
            </button>
          ) : null}
        </div>

        {filteredClientLinks.length === 0 ? (
          <p className="empty-state">No customers match that search.</p>
        ) : (
          <div className="mkt-perf-table-wrap">
            <table className="mkt-perf-table">
              <caption className="sr-only">Customer personal referral links</caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Personal link</th>
                  <th scope="col"><span className="sr-only">Share Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredClientLinks.map((client) => {
                  const isCopied = copiedId === `client-${client.id}`;
                  return (
                    <tr key={client.id}>
                      <td>
                        <Link href={`${basePath}/clients/${client.id}`} style={{ fontWeight: 600 }}>
                          {client.name}
                        </Link>
                      </td>
                      <td>
                        <span className="mkt-perf-muted" style={{ fontSize: '0.8rem' }}>
                          {[client.phone, client.email].filter(Boolean).join(' · ') || 'No contact'}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.78rem', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                          {client.referralUrl ? `${client.referralUrl.slice(0, 32)}…` : 'Not available'}
                        </code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className={`${styles.linkButton} ${isCopied ? styles.copiedBadge : ''}`}
                            onClick={() => handleCopy(`client-${client.id}`, client.referralUrl)}
                            aria-label={`Copy referral link for ${client.name}`}
                          >
                            {isCopied ? 'Copied! ✓' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => setQrModalClient({ name: client.name, url: client.referralUrl })}
                            aria-label={`Show QR Code for ${client.name}`}
                          >
                            QR
                          </button>
                          {client.phone ? (
                            <a
                              href={`sms:${client.phone}?body=${encodeURIComponent(client.shareText)}`}
                              className={styles.linkButton}
                              aria-label={`Text link to ${client.name}`}
                            >
                              Text
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Offer Settings & Live Preview */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>What you offer</h2>
        </div>
        <p className="workspace-details-copy">
          In your own words. It goes out with every referral link. Leave it empty and no referral links are sent at all.
        </p>

        <form action={onSetRewardAction} className="form-grid">
          <div className="field full">
            <label htmlFor="reward">Your thank-you</label>
            <input
              id="reward"
              name="reward"
              type="text"
              maxLength={120}
              value={rewardDraft}
              onChange={(e) => setRewardDraft(e.target.value)}
              placeholder="$50 off your next service"
              aria-describedby="reward-help-copy"
            />
            <span id="reward-help-copy" className="workspace-details-copy" style={{ fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
              Example: &ldquo;$50 off your next service&rdquo; or &ldquo;a $25 gift card&rdquo;.
            </span>
            {rewardDraft.trim() === '' && reward.trim() !== '' ? (
              <span className={styles.rewardNotice}>
                ⚠ Saving an empty reward will turn off referral link inclusion on future marketing messages.
              </span>
            ) : null}
          </div>

          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">
            Save offer
          </SaveButton>
        </form>

        <div className={styles.previewBox}>
          <div className={styles.previewHeading}>Outbound Share Copy Preview</div>
          <div className={styles.previewMessage}>
            &ldquo;{liveSharePreview}&rdquo;
          </div>
        </div>

        {!configured ? (
          <p className="workspace-details-copy" role="status" style={{ marginTop: '1rem', color: '#f59e0b' }}>
            Referral tracking isn&apos;t switched on for this environment yet (signing secret missing), so links can&apos;t be verified at checkout. Existing rows stay recorded.
          </p>
        ) : null}
      </section>

      {/* Owed a thank-you Table */}
      <section className="panel workspace-section-card">
        <div className={styles.tableToolbar}>
          <div className="section-heading workspace-section-heading compact-heading" style={{ margin: 0 }}>
            <h2>Owed a thank-you {hasErrors ? '' : `(${queue.owed.length})`}</h2>
          </div>
          {queue.owed.length > 0 ? (
            <button
              type="button"
              onClick={handleExportCsv}
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              📥 Export CSV
            </button>
          ) : null}
        </div>

        {hasErrors ? (
          <p className="empty-state">
            Couldn&apos;t load your referrals just now. If this keeps happening, the referrals migration may not have been run yet.
          </p>
        ) : queue.owed.length === 0 ? (
          <div className={styles.emptyStateCta}>
            <div className={styles.emptyStateTitle}>Nothing outstanding.</div>
            <p className={styles.emptyStateSub}>
              You have no unpaid referral debts. When customers book through personal links, their rewards will land here.
            </p>
            <Link href={`${basePath}/marketing/campaigns?template=referral`} className="btn primary">
              Send a referral campaign →
            </Link>
          </div>
        ) : (
          <>
            {queue.owed.length > 5 ? (
              <div className={styles.searchBar} style={{ marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Filter debts by referrer or customer name…"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  aria-label="Filter owed referrals"
                />
              </div>
            ) : null}

            <div className="mkt-perf-table-wrap">
              <table className="mkt-perf-table">
                <caption className="sr-only">Referral rewards owed to customers</caption>
                <thead>
                  <tr>
                    <th scope="col">Referred by</th>
                    <th scope="col">Who they sent</th>
                    <th scope="col">First introduced</th>
                    <th scope="col">Reward owed</th>
                    <th scope="col"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOwed.map((row) => {
                    const daysAgo = computeDaysAgo(row.introducedAt);
                    const agingClass = daysAgo > 30 ? styles.agingAlert : daysAgo > 14 ? styles.agingWarn : styles.agingNew;
                    const rowKey = `${row.referrerClientId}:${row.leadIds[0] ?? row.stopIds[0]}`;

                    return (
                      <tr key={rowKey}>
                        <td>
                          <Link href={`${basePath}/clients/${row.referrerClientId}`} style={{ fontWeight: 600 }}>
                            {row.referrerName}
                          </Link>
                        </td>
                        <td>
                          <div>
                            {row.leadIds[0] ? (
                              <Link href={`${basePath}/leads/${row.leadIds[0]}`}>
                                {row.referredName}
                              </Link>
                            ) : (
                              <span>{row.referredName}</span>
                            )}
                            {row.leadIds.length > 1 ? (
                              <span className="mkt-perf-muted"> · {row.leadIds.length} inquiries</span>
                            ) : null}
                          </div>
                          {(row.referredPhone || row.referredEmail) ? (
                            <div className="mkt-perf-muted" style={{ fontSize: '0.78rem' }}>
                              {[row.referredPhone, row.referredEmail].filter(Boolean).join(' · ')}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span>{formatDay(row.introducedAt)}</span>
                          <span className={`${styles.agingPill} ${agingClass}`}>
                            {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{reward || '$50 reward'}</span>
                          {row.value ? (
                            <span className="mkt-perf-muted" style={{ fontSize: '0.78rem', display: 'block' }}>
                              Job: {formatMoney(row.value)}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <form
                            action={(formData) => handleSettleWithUndo(row, formData)}
                            style={{ margin: 0 }}
                          >
                            <input type="hidden" name="leadIds" value={row.leadIds.join(',')} />
                            <input type="hidden" name="stopIds" value={row.stopIds.join(',')} />
                            <SaveButton
                              className="btn"
                              pendingLabel="Saving…"
                              savedLabel="Done ✓"
                              aria-label={`Mark ${row.referrerName} as thanked`}
                            >
                              Mark as thanked
                            </SaveButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Introduced, not booked yet */}
      {queue.waiting.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <h2>Introduced, not booked yet ({queue.waiting.length})</h2>
          </div>
          <p className="workspace-details-copy">
            Nothing is owed until the work is won. These are here so you know the referral arrived and can track the lead.
          </p>
          <div className="mkt-perf-table-wrap">
            <table className="mkt-perf-table">
              <caption className="sr-only">Introduced referrals not yet booked</caption>
              <thead>
                <tr>
                  <th scope="col">Referred by</th>
                  <th scope="col">Who they sent</th>
                  <th scope="col">First got in touch</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.waiting.map((row) => {
                  const rowKey = `${row.referrerClientId}:${row.leadIds[0] ?? row.stopIds[0]}`;
                  return (
                    <tr key={rowKey}>
                      <td>
                        <Link href={`${basePath}/clients/${row.referrerClientId}`}>
                          {row.referrerName}
                        </Link>
                      </td>
                      <td>
                        <div>
                          {row.leadIds[0] ? (
                            <Link href={`${basePath}/leads/${row.leadIds[0]}`}>
                              {row.referredName}
                            </Link>
                          ) : (
                            row.referredName
                          )}
                        </div>
                        {(row.referredPhone || row.referredEmail) ? (
                          <div className="mkt-perf-muted" style={{ fontSize: '0.78rem' }}>
                            {[row.referredPhone, row.referredEmail].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                      </td>
                      <td>{formatDay(row.introducedAt)}</td>
                      <td>
                        <span className="mkt-perf-muted">Inquiry in progress</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Thanked Section (Collapsible) */}
      {queue.thanked.length > 0 ? (
        <section className="panel workspace-section-card">
          <div
            className="section-heading workspace-section-heading compact-heading"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <h2>Thanked ({queue.thanked.length})</h2>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              aria-expanded={showThanked}
              aria-controls="thanked-referrals-history"
              onClick={() => setShowThanked((prev) => !prev)}
            >
              {showThanked ? 'Hide history ▲' : 'Show history ▼'}
            </button>
          </div>

          <div id="thanked-referrals-history" hidden={!showThanked}>
            <div className="mkt-perf-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="mkt-perf-table">
                <caption className="sr-only">Thanked and settled referrals history</caption>
                <thead>
                  <tr>
                    <th scope="col">Referred by</th>
                    <th scope="col">Who they sent</th>
                    <th scope="col">Introduced</th>
                    <th scope="col">Thanked on</th>
                    <th scope="col"><span className="sr-only">Reopen Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.thanked.map((row) => {
                    const rowKey = `${row.referrerClientId}:${row.leadIds[0] ?? row.stopIds[0]}`;
                    return (
                      <tr key={rowKey}>
                        <td>
                          <Link href={`${basePath}/clients/${row.referrerClientId}`}>
                            {row.referrerName}
                          </Link>
                        </td>
                        <td>{row.referredName}</td>
                        <td>{formatDay(row.introducedAt)}</td>
                        <td>
                          {row.settledAt ? (
                            formatDay(row.settledAt)
                          ) : (
                            <>
                              <span className="sr-only">Not yet thanked</span>
                              <span aria-hidden="true">—</span>
                            </>
                          )}
                        </td>
                        <td>
                          <form
                            action={(formData) => handleReopenConfirm(row, formData)}
                            style={{ margin: 0 }}
                          >
                            <input type="hidden" name="leadIds" value={row.leadIds.join(',')} />
                            <input type="hidden" name="stopIds" value={row.stopIds.join(',')} />
                            <SaveButton
                              className="btn secondary"
                              pendingLabel="Reopening…"
                              savedLabel="Reopened ✓"
                              aria-label={`Reopen referral from ${row.referrerName}`}
                            >
                              Reopen
                            </SaveButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
