'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import {
  WAITLIST_STATUS_LABELS,
  WAITLIST_URGENCY_LABELS,
  formatWaitlistWindowLabel,
  type OpenedSlotWindow,
  type RankedWaitlistCandidate,
  type WaitlistEntry,
  type WaitlistOffer,
  type WaitlistStatus,
  type WaitlistUrgency,
  type WaitlistWindow,
} from '@/lib/cancellation-waitlist';
import {
  addWaitlistEntryAction,
  cancelWaitlistOfferAction,
  findCandidatesAction,
  manualAcceptOfferAction,
  manualDeclineOfferAction,
  removeWaitlistEntryAction,
  sendWaitlistOfferAction,
  triggerWaitlistSweepAction,
  toggleWaitlistAction,
} from './actions';
import styles from './WaitlistManager.module.css';

interface WaitlistManagerProps {
  entries: WaitlistEntry[];
  offers: WaitlistOffer[];
  activePendingOffers: WaitlistOffer[];
  enabled?: boolean;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WaitlistManager({
  entries,
  offers,
  activePendingOffers,
}: WaitlistManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'offered' | 'fulfilled'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');

  // Modals & Panels
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFillSlotModal, setShowFillSlotModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);

  // Fill Slot State
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [slotDate, setSlotDate] = useState(tomorrow);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('12:00');
  const [slotDuration, setSlotDuration] = useState('3.0');
  const [holdMinutes, setHoldMinutes] = useState(30);
  const [autoCascade, setAutoCascade] = useState(true);

  // Ranked candidates matching current slot
  const [rankedCandidates, setRankedCandidates] = useState<RankedWaitlistCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<RankedWaitlistCandidate | null>(null);
  const [customSmsBody, setCustomSmsBody] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Form State for Adding Entry
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formService, setFormService] = useState('');
  const [formHours, setFormHours] = useState('2.0');
  const [formValue, setFormValue] = useState('');
  const [formUrgency, setFormUrgency] = useState<WaitlistUrgency>('medium');
  const [formWindow, setFormWindow] = useState<WaitlistWindow>('any');
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formEarliest, setFormEarliest] = useState('');
  const [formLatest, setFormLatest] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Fetch candidates whenever slot parameters change in Fill Slot Modal
  useEffect(() => {
    if (!showFillSlotModal) return;

    let mounted = true;
    setIsLoadingCandidates(true);

    const slot: OpenedSlotWindow = {
      dateKey: slotDate,
      windowStart,
      windowEnd,
      durationHours: Number(slotDuration) || 3.0,
    };

    findCandidatesAction(slot)
      .then((candidates) => {
        if (!mounted) return;
        setRankedCandidates(candidates);
        setSelectedCandidate(candidates[0] || null);
        setIsLoadingCandidates(false);
      })
      .catch(() => {
        if (!mounted) return;
        setRankedCandidates([]);
        setIsLoadingCandidates(false);
      });

    return () => {
      mounted = false;
    };
  }, [showFillSlotModal, slotDate, windowStart, windowEnd, slotDuration]);

  // Periodic hold sweep countdown check
  useEffect(() => {
    const timer = setInterval(() => {
      const hasExpired = activePendingOffers.some(
        (o) => new Date(o.hold_expires_at).getTime() < Date.now(),
      );
      if (hasExpired) {
        startTransition(async () => {
          await triggerWaitlistSweepAction();
        });
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [activePendingOffers]);

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    if (activeTab !== 'all' && entry.status !== activeTab) return false;
    if (urgencyFilter !== 'all' && entry.urgency !== urgencyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = entry.client_name.toLowerCase().includes(q);
      const matchPhone = entry.client_phone.includes(q);
      const matchAddress = entry.address?.toLowerCase().includes(q) || false;
      const matchService = entry.service_name?.toLowerCase().includes(q) || false;
      if (!matchName && !matchPhone && !matchAddress && !matchService) return false;
    }
    return true;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      setActionMessage('Please provide client name and phone number.');
      return;
    }

    startTransition(async () => {
      try {
        await addWaitlistEntryAction({
          clientName: formName,
          clientPhone: formPhone,
          clientEmail: formEmail || null,
          address: formAddress || null,
          serviceName: formService || null,
          estimatedHours: Number(formHours) || 2.0,
          estimatedValue: formValue ? Number(formValue) : null,
          urgency: formUrgency,
          preferredWindow: formWindow,
          preferredDays: formDays,
          earliestDate: formEarliest || null,
          latestDate: formLatest || null,
          notes: formNotes || null,
        });
        setShowAddModal(false);
        resetForm();
        setActionMessage('Customer added to cancellation waitlist.');
        setTimeout(() => setActionMessage(null), 4000);
      } catch (err: unknown) {
        setActionMessage((err as Error).message || 'Failed to add waitlist entry.');
      }
    });
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormService('');
    setFormHours('2.0');
    setFormValue('');
    setFormUrgency('medium');
    setFormWindow('any');
    setFormDays([1, 2, 3, 4, 5]);
    setFormEarliest('');
    setFormLatest('');
    setFormNotes('');
  };

  const handleSendOffer = () => {
    if (!selectedCandidate) return;

    startTransition(async () => {
      try {
        await sendWaitlistOfferAction({
          waitlistEntryId: selectedCandidate.entry.id,
          slot: {
            dateKey: slotDate,
            windowStart,
            windowEnd,
            durationHours: Number(slotDuration) || 3.0,
          },
          rank: selectedCandidate.rank,
          score: selectedCandidate.score,
          holdMinutes,
          customBody: customSmsBody || undefined,
          autoCascade,
        });
        setShowFillSlotModal(false);
        setActionMessage(`Slot offered to ${selectedCandidate.entry.client_name} (Rank #${selectedCandidate.rank}).`);
        setTimeout(() => setActionMessage(null), 5000);
      } catch (err: unknown) {
        setActionMessage((err as Error).message || 'Failed to dispatch offer.');
      }
    });
  };

  const handleRemove = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the cancellation waitlist?`)) return;
    startTransition(async () => {
      await removeWaitlistEntryAction(id);
    });
  };

  const handleCancelOffer = (offerId: string) => {
    if (!confirm('Withdraw this slot offer? Customer will be notified if they reply.')) return;
    startTransition(async () => {
      await cancelWaitlistOfferAction(offerId);
    });
  };

  const handleManualAccept = (offerId: string) => {
    startTransition(async () => {
      await manualAcceptOfferAction(offerId);
      setActionMessage('Offer marked as accepted & job scheduled!');
      setTimeout(() => setActionMessage(null), 4000);
    });
  };

  const handleManualDecline = (offerId: string) => {
    startTransition(async () => {
      await manualDeclineOfferAction(offerId);
      setActionMessage('Offer declined. Cascading to next candidate if enabled.');
      setTimeout(() => setActionMessage(null), 4000);
    });
  };

  return (
    <div className={styles.waitlistShell}>
      {/* Header & Breadcrumb */}
      <div className={styles.headerRow}>
        <div>
          <div className={styles.breadcrumb}>
            <Link href="/dashboard/schedule" className={styles.breadcrumbLink}>
              ← Back to Schedule
            </Link>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbCurrent}>Cancellation Waitlist</span>
          </div>
          <h1 className={styles.pageTitle}>
            Cancellation Waitlist & Priority Offerings
          </h1>
          <p className={styles.pageSubtitle}>
            Automatically offer newly opened windows to qualified customers in priority order.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Turn off the cancellation waitlist? New entries will not be collected and pending offers will not cascade until turned back on.')) {
                startTransition(async () => {
                  await toggleWaitlistAction(false);
                });
              }
            }}
            disabled={isPending}
            className={styles.pauseWaitlistBtn}
            title="Turn off cancellation waitlist"
          >
            Turn Off
          </button>
          <button
            onClick={() => setShowFillSlotModal(true)}
            className={styles.fillWindowBtn}
          >
            <span>⚡</span> Fill Opened Window
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className={styles.addWaitlistBtn}
          >
            <span>+</span> Add to Waitlist
          </button>
        </div>
      </div>

      {/* Action notification banner */}
      {actionMessage && (
        <div className={styles.actionBanner}>
          <span>✓ {actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className={styles.actionBannerDismiss}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>
            Active in Queue
          </div>
          <div className={styles.metricValue}>
            {entries.filter((e) => e.status === 'active').length}
          </div>
          <div className={styles.metricSubtext}>Ready for opening matches</div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricLabel} ${styles.metricLabelPending}`}>
            Live Pending Holds
          </div>
          <div className={`${styles.metricValue} ${activePendingOffers.length > 0 ? styles.metricValuePending : ''}`}>
            {activePendingOffers.length}
          </div>
          <div className={styles.metricSubtext}>Awaiting client reply</div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricLabel} ${styles.metricLabelFulfilled}`}>
            Fulfilled Slots
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueFulfilled}`}>
            {entries.filter((e) => e.status === 'fulfilled').length}
          </div>
          <div className={styles.metricSubtext}>Successfully backfilled</div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricLabel} ${styles.metricLabelEmergency}`}>
            High / Emergency
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueEmergency}`}>
            {entries.filter((e) => e.status === 'active' && (e.urgency === 'emergency' || e.urgency === 'high')).length}
          </div>
          <div className={styles.metricSubtext}>Priority fast-track</div>
        </div>
      </div>

      {/* Active Pending Offers Section (If any) */}
      {activePendingOffers.length > 0 && (
        <div className={styles.activeHoldsSection}>
          <div className={styles.activeHoldsHeader}>
            <div className={styles.activeHoldsTitleBox}>
              <span className={styles.pulseDot} />
              <h2 className={styles.activeHoldsTitle}>
                Active Slot Holds in Progress ({activePendingOffers.length})
              </h2>
            </div>
            <span className={styles.activeHoldsSubtext}>Auto-cascades to next candidate if not confirmed</span>
          </div>

          <div className={styles.activeHoldsGrid}>
            {activePendingOffers.map((offer) => {
              const expiresTime = new Date(offer.hold_expires_at).getTime();
              const minsLeft = Math.max(0, Math.round((expiresTime - Date.now()) / 60000));
              const entry = entries.find((e) => e.id === offer.waitlist_entry_id);

              return (
                <div key={offer.id} className={styles.holdCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className={styles.holdCardClient}>
                        {entry?.client_name || 'Customer'}
                      </div>
                      <div className={styles.holdCardPhone}>{offer.phone}</div>
                    </div>
                    <span className={minsLeft < 10 ? styles.holdTimerPillUrgent : styles.holdTimerPillNormal}>
                      ⏱ {minsLeft}m left
                    </span>
                  </div>

                  <div className={styles.holdSlotDetail}>
                    <div><strong>Slot:</strong> {offer.opened_slot_date} ({formatWaitlistWindowLabel(offer.window_start, offer.window_end)})</div>
                    <div><strong>Rank:</strong> #{offer.priority_rank} (Score: {offer.priority_score})</div>
                  </div>

                  <div className={styles.holdActions}>
                    <button
                      onClick={() => handleManualAccept(offer.id)}
                      disabled={isPending}
                      className={styles.acceptBtn}
                    >
                      ✓ Customer Said YES
                    </button>
                    <button
                      onClick={() => handleManualDecline(offer.id)}
                      disabled={isPending}
                      className={styles.declineBtn}
                    >
                      Decline & Cascade
                    </button>
                    <button
                      onClick={() => handleCancelOffer(offer.id)}
                      disabled={isPending}
                      className={styles.withdrawBtn}
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Waitlist Table & Filter Bar */}
      <div className={styles.tableContainer}>
        {/* Controls header */}
        <div className={styles.tableControls}>
          {/* Status Tabs */}
          <div className={styles.tabsNav}>
            {(['active', 'offered', 'fulfilled', 'all'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ''}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Search & Urgency filter */}
          <div className={styles.searchFilters}>
            <select
              aria-label="Filter by urgency"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Urgencies</option>
              <option value="emergency">Emergency</option>
              <option value="high">High Priority</option>
              <option value="medium">Standard</option>
              <option value="flexible">Flexible</option>
            </select>

            <input
              type="text"
              placeholder="Search name, phone, address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* Entries Table */}
        {filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📋</div>
            <div className={styles.emptyStateTitle}>No waitlist entries found</div>
            <p className={styles.emptyStateDesc}>
              {activeTab === 'active'
                ? 'There are no active customers waiting for an earlier window.'
                : 'No records matching your search criteria.'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className={styles.addWaitlistBtn}
            >
              + Add Customer to Waitlist
            </button>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.waitlistTable}>
              <thead>
                <tr className={styles.tableHeadRow}>
                  <th style={{ padding: '12px 16px' }}>Customer & Service</th>
                  <th style={{ padding: '12px 16px' }}>Availability Preferences</th>
                  <th style={{ padding: '12px 16px' }}>Scope & Value</th>
                  <th style={{ padding: '12px 16px' }}>Urgency</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const daysWaiting = Math.max(
                    0,
                    Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 86400000),
                  );

                  return (
                    <tr key={entry.id} className={styles.tableRow}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div className={styles.clientName}>{entry.client_name}</div>
                        <div className={styles.clientPhone}>{entry.client_phone}</div>
                        {entry.address && (
                          <div className={styles.clientAddress}>📍 {entry.address}</div>
                        )}
                        {entry.service_name && (
                          <div className={styles.serviceName}>
                            {entry.service_name}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span className={styles.windowPill}>
                            Window: {entry.preferred_window.toUpperCase()}
                          </span>
                        </div>
                        {entry.preferred_days && entry.preferred_days.length > 0 ? (
                          <div className={styles.metaText}>
                            Days: {entry.preferred_days.map((d) => WEEKDAY_NAMES[d]).join(', ')}
                          </div>
                        ) : (
                          <div className={styles.subMetaText}>Any day of week</div>
                        )}
                        {(entry.earliest_date || entry.latest_date) && (
                          <div className={styles.subMetaText}>
                            Between {entry.earliest_date || 'now'} and {entry.latest_date || 'anytime'}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div>{entry.estimated_hours} hrs estimated</div>
                        {entry.estimated_value ? (
                          <div className={styles.valueText}>
                            ${entry.estimated_value.toLocaleString()}
                          </div>
                        ) : (
                          <div className={styles.noBudgetText}>No budget set</div>
                        )}
                        <div className={styles.subMetaText}>
                          Waiting {daysWaiting === 0 ? 'today' : `${daysWaiting}d`}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          className={
                            entry.urgency === 'emergency'
                              ? styles.badgeEmergency
                              : entry.urgency === 'high'
                              ? styles.badgeHigh
                              : entry.urgency === 'medium'
                              ? styles.badgeMedium
                              : styles.badgeFlexible
                          }
                        >
                          {WAITLIST_URGENCY_LABELS[entry.urgency]}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          className={
                            entry.status === 'active'
                              ? styles.statusActive
                              : entry.status === 'offered'
                              ? styles.statusOffered
                              : entry.status === 'fulfilled'
                              ? styles.statusFulfilled
                              : styles.badgeFlexible
                          }
                        >
                          {WAITLIST_STATUS_LABELS[entry.status]}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {entry.status === 'active' && (
                            <button
                              onClick={() => {
                                setShowFillSlotModal(true);
                              }}
                              className={styles.offerSlotBtn}
                            >
                              Offer Slot
                            </button>
                          )}
                          <button
                            onClick={() => handleRemove(entry.id, entry.client_name)}
                            disabled={isPending}
                            className={styles.removeRowBtn}
                            title="Remove from waitlist"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Fill Opened Window Assistant */}
      {showFillSlotModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalBox}>
            <div className={styles.modalHead}>
              <div>
                <h2 className={styles.modalTitle}>
                  ⚡ Fill Newly Opened Window
                </h2>
                <p className={styles.modalSubtitle}>
                  Matches and ranks all qualified waitlist customers in priority order.
                </p>
              </div>
              <button
                onClick={() => setShowFillSlotModal(false)}
                className={styles.modalCloseBtn}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {/* Slot definition controls */}
            <div
              className={styles.innerWell}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <label className={styles.formLabel}>
                  Date of Opening
                </label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Window Start
                </label>
                <input
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Window End
                </label>
                <input
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Available Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* Candidates ranking section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Qualified Candidates ({rankedCandidates.length})
                </span>
                {isLoadingCandidates && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Calculating matches...</span>}
              </div>

              {rankedCandidates.length === 0 ? (
                <div className={styles.innerWell} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No active waitlist customers match this specific date, time window, or duration.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {rankedCandidates.map((candidate) => {
                    const isSelected = selectedCandidate?.entry.id === candidate.entry.id;

                    return (
                      <div
                        key={candidate.entry.id}
                        onClick={() => setSelectedCandidate(candidate)}
                        className={`${styles.candidateItem} ${isSelected ? styles.candidateItemSelected : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className={`${styles.candidateRank} ${candidate.rank === 1 ? styles.candidateRankFirst : ''}`}
                          >
                            #{candidate.rank}
                          </span>
                          <div>
                            <div className={styles.candidateName}>
                              {candidate.entry.client_name}
                            </div>
                            <div className={styles.candidateSub}>
                              {candidate.entry.service_name || 'General Service'} • {candidate.entry.estimated_hours}h required
                              {candidate.score.distanceMiles !== null && ` • ${candidate.score.distanceMiles} mi from route`}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div className={styles.candidateScoreText}>
                            Score: {candidate.score.totalScore}/100
                          </div>
                          <div className={styles.candidateScoreSub}>
                            {candidate.score.daysWaiting}d waiting • {candidate.entry.urgency}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected candidate score & offer settings */}
            {selectedCandidate && (
              <div className={styles.scoreBreakdownBox}>
                <div className={styles.scoreBreakdownTitle}>
                  Score Breakdown for {selectedCandidate.entry.client_name} (Priority Rank #{selectedCandidate.rank})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 12, marginBottom: 12 }}>
                  <div className={styles.scoreStatCard}>
                    <div className={styles.scoreStatLabel}>Proximity</div>
                    <div className={styles.scoreStatValue}>{selectedCandidate.score.proximityScore}/35 pts</div>
                  </div>
                  <div className={styles.scoreStatCard}>
                    <div className={styles.scoreStatLabel}>Wait Duration</div>
                    <div className={styles.scoreStatValue}>{selectedCandidate.score.waitTimeScore}/25 pts</div>
                  </div>
                  <div className={styles.scoreStatCard}>
                    <div className={styles.scoreStatLabel}>Urgency</div>
                    <div className={styles.scoreStatValue}>{selectedCandidate.score.urgencyScore}/20 pts</div>
                  </div>
                  <div className={styles.scoreStatCard}>
                    <div className={styles.scoreStatLabel}>Window Fit</div>
                    <div className={styles.scoreStatValue}>{selectedCandidate.score.windowFitScore}/10 pts</div>
                  </div>
                  <div className={styles.scoreStatCard}>
                    <div className={styles.scoreStatLabel}>Job Value</div>
                    <div className={styles.scoreStatValue}>{selectedCandidate.score.valueScore}/10 pts</div>
                  </div>
                </div>

                {/* Offer Parameters */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label className={styles.formLabel}>
                      Hold Reservation Timer
                    </label>
                    <select
                      aria-label="Hold reservation timer"
                      value={holdMinutes}
                      onChange={(e) => setHoldMinutes(Number(e.target.value))}
                      className={styles.formSelect}
                    >
                      <option value={15}>15 Minutes Hold</option>
                      <option value={30}>30 Minutes Hold (Standard)</option>
                      <option value={45}>45 Minutes Hold</option>
                      <option value={60}>60 Minutes Hold</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                    <input
                      type="checkbox"
                      id="autoCascade"
                      checked={autoCascade}
                      onChange={(e) => setAutoCascade(e.target.checked)}
                    />
                    <label htmlFor="autoCascade" className={styles.autoCascadeLabel}>
                      Auto-cascade to next candidate on expiry/decline
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Action Footer */}
            <div className={styles.modalFooter}>
              <button
                onClick={() => setShowFillSlotModal(false)}
                className={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleSendOffer}
                disabled={!selectedCandidate || isPending}
                className={styles.modalSendOfferBtn}
              >
                {isPending ? 'Sending...' : `Send Offer to ${selectedCandidate?.entry.client_name || 'Candidate'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add Customer to Waitlist */}
      {showAddModal && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modalBox} ${styles.modalBoxAdd}`}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>
                + Add Customer to Cancellation Waitlist
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className={styles.modalCloseBtn}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.formLabel}>
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. (555) 234-5678"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className={styles.formLabel}>
                  Street Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 742 Evergreen Terrace, Springfield"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.formLabel}>
                    Service / Trade
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Water Heater Repair"
                    value={formService}
                    onChange={(e) => setFormService(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>
                    Est. Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>
                    Est. Value ($)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 450"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.formLabel}>
                    Urgency Level
                  </label>
                  <select
                    aria-label="Urgency level"
                    value={formUrgency}
                    onChange={(e) => setFormUrgency(e.target.value as WaitlistUrgency)}
                    className={styles.formSelect}
                  >
                    <option value="emergency">Emergency (Urgent)</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Standard</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div>
                  <label className={styles.formLabel}>
                    Preferred Time Window
                  </label>
                  <select
                    aria-label="Preferred time window"
                    value={formWindow}
                    onChange={(e) => setFormWindow(e.target.value as WaitlistWindow)}
                    className={styles.formSelect}
                  >
                    <option value="any">Any Time of Day</option>
                    <option value="morning">Morning (8 AM – 12 PM)</option>
                    <option value="afternoon">Afternoon (12 PM – 4 PM)</option>
                    <option value="evening">Late Afternoon (4 PM – 7 PM)</option>
                  </select>
                </div>
              </div>

              {/* Preferred Weekdays */}
              <div style={{ marginBottom: 12 }}>
                <label className={styles.formLabel}>
                  Available Days of Week
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {WEEKDAY_NAMES.map((name, index) => {
                    const isSelected = formDays.includes(index);
                    return (
                      <button
                        type="button"
                        key={name}
                        onClick={() => {
                          if (isSelected) setFormDays(formDays.filter((d) => d !== index));
                          else setFormDays([...formDays, index]);
                        }}
                        className={`${styles.weekdayBtn} ${isSelected ? styles.weekdayBtnSelected : ''}`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.formLabel}>
                    Earliest Acceptable Date
                  </label>
                  <input
                    type="date"
                    value={formEarliest}
                    onChange={(e) => setFormEarliest(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel}>
                    Latest Acceptable Date
                  </label>
                  <input
                    type="date"
                    value={formLatest}
                    onChange={(e) => setFormLatest(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className={styles.formLabel}>
                  Notes / Context
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Existing customer with flexible schedule on Thursdays"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className={styles.modalSubmitBtn}
                >
                  {isPending ? 'Saving...' : 'Add to Waitlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
