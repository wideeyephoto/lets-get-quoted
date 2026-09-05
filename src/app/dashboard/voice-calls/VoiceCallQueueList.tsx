'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  formatCallLength,
  formatDispositionLabel,
  formatOutcomeLabel,
  parseVoiceCallSummary,
} from '@/lib/voice/call-formatting';
import type {
  VoiceCallDisposition,
  VoiceCallQueueItem,
} from '@/lib/voice/call-workspace';
import ConvertToQuoteButton from './ConvertToQuoteButton';
import {
  bulkUpdateVoiceCallDispositionsAction,
  updateVoiceCallDispositionAction,
} from './actions';
import styles from './voice-calls.module.css';

const ALL_DISPOSITIONS: { value: VoiceCallDisposition; label: string }[] = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'needs_callback', label: 'Needs Callback' },
  { value: 'callback_scheduled', label: 'Callback Scheduled' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_a_fit', label: 'Not a Fit' },
  { value: 'spam', label: 'Spam' },
  { value: 'resolved', label: 'Resolved' },
];

function formatCallTime(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  } catch {
    return at.toLocaleString();
  }
}

export default function VoiceCallQueueList({
  items,
  timezone,
  currentTab,
  currentDateRange,
  currentDisposition,
  currentOutcome,
  searchQuery,
  totalFiltered,
  currentPage,
  pageSize,
}: {
  items: readonly VoiceCallQueueItem[];
  timezone: string;
  currentTab: string;
  currentDateRange: string;
  currentDisposition: string;
  currentOutcome: string;
  searchQuery?: string;
  totalFiltered: number;
  currentPage: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  const [targetBulkDisposition, setTargetBulkDisposition] = useState<VoiceCallDisposition>('contacted');

  const allOnPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const someOnPageSelected = items.some((i) => selectedIds.has(i.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function toggleSelectItem(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function handleSingleDispositionChange(callId: string, newDisposition: VoiceCallDisposition) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('callId', callId);
        formData.append('disposition', newDisposition);
        await updateVoiceCallDispositionAction(formData);
        router.refresh();
      } catch (err) {
        console.error('Failed to update disposition:', err);
      }
    });
  }

  function handleApplyBulkDisposition() {
    if (selectedIds.size === 0 || isPending) return;
    setBulkActionError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('callIds', Array.from(selectedIds).join(','));
        formData.append('disposition', targetBulkDisposition);
        await bulkUpdateVoiceCallDispositionsAction(formData);
        setSelectedIds(new Set());
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to apply bulk disposition';
        setBulkActionError(msg);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  function buildPageHref(targetPage: number): string {
    const params = new URLSearchParams();
    params.set('view', 'inbox');
    params.set('tab', currentTab);
    params.set('dateRange', currentDateRange);
    if (currentDisposition !== 'all') params.set('disposition', currentDisposition);
    if (currentOutcome !== 'all') params.set('outcome', currentOutcome);
    if (searchQuery) params.set('q', searchQuery);
    if (targetPage > 1) params.set('page', targetPage.toString());
    return `/dashboard/voice-calls?${params.toString()}`;
  }

  const exportSelectedHref = `/api/voice/export?ids=${Array.from(selectedIds).join(',')}`;

  if (items.length === 0) {
    return (
      <div className={styles.emptyState} role="status" aria-label="No calls found in current view">
        <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} aria-hidden="true">
          📭
        </span>
        <h3>No calls in this view</h3>
        <p>
          {searchQuery
            ? `No voice calls matched "${searchQuery}". Try clearing your search term.`
            : currentTab !== 'all' || currentDateRange !== 'all' || currentDisposition !== 'all' || currentOutcome !== 'all'
            ? 'No calls match the selected filter combination.'
            : 'When the AI receptionist answers calls, they will appear in your working inbox with full transcripts and action items.'}
        </p>
        {(searchQuery || currentTab !== 'all' || currentDateRange !== 'all' || currentDisposition !== 'all' || currentOutcome !== 'all') && (
          <div style={{ marginTop: '1rem' }}>
            <Link
              href="/dashboard/voice-calls?view=inbox"
              className={styles.actionBtnSecondary}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none',
                borderRadius: '6px',
              }}
            >
              ✕ Reset All Filters
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="call-queue-list" className={styles.queueContainer} role="region" aria-label="Call Queue List">
      {/* Selection Header & Bulk Action Bar */}
      <div className={styles.selectionToolbar}>
        <div className={styles.selectAllGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={allOnPageSelected}
              ref={(el) => {
                if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
              }}
              onChange={toggleSelectAll}
              aria-label="Select all calls on this page"
              className={styles.checkboxInput}
            />
            <span>Select All</span>
          </label>
          <span className={styles.queueCountSummary}>
            Showing {Math.min((currentPage - 1) * pageSize + 1, totalFiltered)}–{Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} calls
          </span>
        </div>

        {selectedIds.size > 0 && (
          <div className={styles.bulkActionBar} role="region" aria-label="Bulk actions">
            <span className={styles.bulkCountBadge}>
              {selectedIds.size} selected
            </span>

            <div className={styles.bulkDispositionGroup}>
              <label htmlFor="bulk-disposition-select" className={styles.visuallyHidden}>
                Bulk disposition
              </label>
              <select
                id="bulk-disposition-select"
                value={targetBulkDisposition}
                onChange={(e) => setTargetBulkDisposition(e.target.value as VoiceCallDisposition)}
                className={styles.bulkSelect}
                disabled={isPending}
              >
                {ALL_DISPOSITIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    Mark {d.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBulkDisposition}
                disabled={isPending}
                className={styles.bulkActionBtn}
              >
                {isPending ? 'Applying…' : 'Apply'}
              </button>
            </div>

            <a
              href={exportSelectedHref}
              className={styles.bulkExportBtn}
              download={`voice-calls-selected-${selectedIds.size}.csv`}
            >
              📥 Export ({selectedIds.size})
            </a>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className={styles.bulkDeselectBtn}
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {bulkActionError ? (
        <div className={styles.bulkErrorBanner} role="alert">
          <span>⚠️ {bulkActionError}</span>
        </div>
      ) : null}

      {/* Queue Items */}
      <div className={styles.queueList}>
        {items.map((call) => {
          const isUrgent = call.workflow.urgency === 'urgent' || call.workflow.urgency === 'emergency';
          const isUnreviewed = call.workflow.disposition === 'unreviewed';
          const isSelected = selectedIds.has(call.id);
          const parsed = parseVoiceCallSummary(call.summary);

          let outcomeBadgeClass = styles.badgeAi;
          if (call.outcome === 'transfer_attempted' || call.outcome === 'transferred_and_answered' || call.outcome === 'transferred') {
            outcomeBadgeClass = styles.badgeTransfer;
          } else if (call.outcome === 'voicemail' || call.outcome === 'voicemail_fallback') {
            outcomeBadgeClass = styles.badgeVoicemail;
          }

          return (
            <div
              key={call.id}
              className={`${styles.callCard} ${isUnreviewed ? styles.unreviewedCard : ''} ${isUrgent ? styles.urgentCard : ''} ${isSelected ? styles.selectedCard : ''}`}
            >
              <div className={styles.cardHead}>
                <div className={styles.callerGroup}>
                  <label className={styles.itemCheckboxLabel} title="Select this call">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(call.id)}
                      className={styles.checkboxInput}
                      aria-label={`Select call from ${call.callerNumber || 'Unknown'}`}
                    />
                  </label>

                  <span className={styles.callerNumber}>
                    {parsed.callerName ?? (call.callerNumber ?? 'Unknown Caller')}
                  </span>
                  {parsed.callerName && call.callerNumber ? (
                    <span className={styles.callerSubNumber}>
                      ({call.callerNumber})
                    </span>
                  ) : null}
                  {call.isProvisional || call.outcome === 'in_progress' ? (
                    <span className={`${styles.badge} ${styles.badgeLive}`}>
                      <span aria-hidden="true">🔴</span> Live Call
                    </span>
                  ) : null}
                  {call.workflow.urgency === 'emergency' ? (
                    <span className={`${styles.badge} ${styles.badgeEmergency}`}>
                      <span aria-hidden="true">🚨</span> Emergency
                    </span>
                  ) : call.workflow.urgency === 'urgent' ? (
                    <span className={`${styles.badge} ${styles.badgeUrgent}`}>
                      <span aria-hidden="true">⚠️</span> Urgent
                    </span>
                  ) : null}
                  <span className={`${styles.badge} ${outcomeBadgeClass}`}>
                    {formatOutcomeLabel(call.outcome)}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeDisposition}`}>
                    {formatDispositionLabel(call.workflow.disposition)}
                  </span>
                </div>
                <span className={styles.timeText}>{formatCallTime(call.startedAt, timezone)}</span>
              </div>

              {parsed.displaySummary ? (
                <div className={styles.summaryContainer}>
                  <p className={styles.summaryText}>
                    {parsed.workRequested ?? parsed.displaySummary}
                  </p>
                  {parsed.structured ? (
                    <div className={styles.summaryMetaRow}>
                      {parsed.serviceAddress ? (
                        <span className={styles.metaChip}>
                          <span aria-hidden="true">📍</span> {parsed.serviceAddress}
                        </span>
                      ) : null}
                      {parsed.slot ? (
                        <span className={`${styles.metaChip} ${parsed.isBooked ? styles.metaChipBooked : ''}`}>
                          <span aria-hidden="true">{parsed.isBooked ? '📅' : '🗓️'}</span>{' '}
                          {parsed.isBooked ? 'Booked:' : 'Requested:'} {parsed.slot}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={styles.summaryText} style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {call.isProvisional ? 'Call in progress or awaiting terminal transcript summary...' : 'No conversation summary recorded.'}
                </p>
              )}

              {/* Inline Audio Player if recording is ready */}
              {call.recordingStatus === 'ready' && (
                <div className={styles.audioPlayerContainer}>
                  <audio
                    controls
                    preload="none"
                    src={`/api/voice/recordings/${call.id}`}
                    className={styles.inlineAudio}
                    aria-label={`Recording for call from ${call.callerNumber || 'Unknown'}`}
                  >
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              <div className={styles.cardFooter}>
                <div className={styles.footerLeft}>
                  <span>Duration: {formatCallLength(call.aiSeconds)}</span>
                  {call.billedMinutes !== null ? (
                    <span>({call.billedMinutes} min billed)</span>
                  ) : null}
                  {call.recordingStatus === 'ready' ? (
                    <span className={styles.audioReadyPill}>
                      <span aria-hidden="true">🎙️</span> Audio Ready
                    </span>
                  ) : null}
                </div>

                <div className={styles.footerRight}>
                  {/* Inline quick disposition dropdown */}
                  <div className={styles.inlineDispositionSelector}>
                    <label htmlFor={`disp-${call.id}`} className={styles.visuallyHidden}>
                      Disposition
                    </label>
                    <select
                      id={`disp-${call.id}`}
                      value={call.workflow.disposition}
                      onChange={(e) => handleSingleDispositionChange(call.id, e.target.value as VoiceCallDisposition)}
                      disabled={isPending}
                      className={styles.inlineDispSelect}
                      title="Update disposition"
                    >
                      {ALL_DISPOSITIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {call.callerNumber ? (
                    <>
                      <a
                        href={`tel:${call.callerNumber}`}
                        className={styles.linkButtonCall}
                        title={`Direct call ${call.callerNumber}`}
                      >
                        <span aria-hidden="true">📞</span> Call
                      </a>
                      <Link
                        href={`/dashboard/messages?to=${encodeURIComponent(call.callerNumber)}`}
                        className={styles.linkButtonSms}
                        title={`Send SMS to ${call.callerNumber}`}
                      >
                        <span aria-hidden="true">💬</span> SMS
                      </Link>
                    </>
                  ) : null}

                  <ConvertToQuoteButton callId={call.id} />

                  {call.leadId ? (
                    <Link href={`/dashboard/leads/${call.leadId}`} className={styles.linkButton}>
                      View Lead →
                    </Link>
                  ) : null}

                  <Link href={`/dashboard/voice-calls/${call.id}`} className={styles.linkButtonPrimary}>
                    Details &amp; Transcript →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <nav className={styles.paginationRow} aria-label="Call queue pagination">
          <Link
            href={buildPageHref(Math.max(1, currentPage - 1))}
            className={`${styles.paginationBtn} ${currentPage <= 1 ? styles.paginationBtnDisabled : ''}`}
            aria-disabled={currentPage <= 1}
            tabIndex={currentPage <= 1 ? -1 : 0}
          >
            ← Previous
          </Link>

          <span className={styles.paginationText}>
            Page {currentPage} of {totalPages}
          </span>

          <Link
            href={buildPageHref(Math.min(totalPages, currentPage + 1))}
            className={`${styles.paginationBtn} ${currentPage >= totalPages ? styles.paginationBtnDisabled : ''}`}
            aria-disabled={currentPage >= totalPages}
            tabIndex={currentPage >= totalPages ? -1 : 0}
          >
            Next →
          </Link>
        </nav>
      )}
    </div>
  );
}
