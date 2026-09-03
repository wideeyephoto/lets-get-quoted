'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { draftCustomerMessage, SENSITIVITIES } from '@/lib/weather';
import {
  batchSendWeatherRescheduleSmsAction,
  logWeatherRiskToTimelineAction,
  moveJobToWeatherDateAction,
  sendWeatherRescheduleSmsAction,
  updateWeatherSettingsAction,
  weatherRisksAction,
  type WeatherRiskView,
} from './weather-actions';

function formatDay(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Jobs the forecast is against.
 *
 * Every action here ends with the contractor doing something. There is no
 * unconfirmed "reschedule these for me" automation, and that's deliberate: a calendar that moves
 * work on a forecast will eventually move a job on a day that turns out fine,
 * and the customer who took the morning off stops trusting your dates.
 *
 * Provides direct 1-tap SMS dispatch proposing clear alternative days, optional direct calendar moves,
 * and batch outreach across all at-risk exterior appointments.
 */
export default function WeatherPanel({
  enabled,
  profile,
  justEnabled = false,
}: {
  enabled: boolean;
  profile: string;
  /**
   * True on the one render that follows pressing "Turn it on".
   */
  justEnabled?: boolean;
}) {
  const [state, setState] = useState<{
    checked: boolean;
    risks: WeatherRiskView[];
    checkedAt?: string;
    businessName?: string;
  }>({ checked: false, risks: [] });

  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Interactive card state
  const [selectedTargetDay, setSelectedTargetDay] = useState<Record<string, string>>({});
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [editingCard, setEditingCard] = useState<Record<string, boolean>>({});
  const [sentStatus, setSentStatus] = useState<
    Record<
      string,
      {
        sent: boolean;
        sentAt: string;
        sentTo: string;
        isDelayed?: boolean;
        scheduledSendAt?: string;
        quietHoursReason?: string;
        error?: string;
      }
    >
  >({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [movedStatus, setMovedStatus] = useState<
    Record<string, { moved: boolean; newDate: string; error?: string }>
  >({});
  const [moving, setMoving] = useState<Record<string, boolean>>({});
  const [loggedStatus, setLoggedStatus] = useState<Record<string, boolean>>({});
  const [logging, setLogging] = useState<Record<string, boolean>>({});

  // Batch outreach state
  const [batchSending, setBatchSending] = useState(false);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  function check() {
    startTransition(async () => {
      const result = await weatherRisksAction();
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setState({
        checked: true,
        risks: result.risks,
        checkedAt: timeStr,
        businessName: result.businessName,
      });
    });
  }

  // Once, and never twice: an effect runs a second time under React's strict
  // double-invoke in development, and this one costs a network round trip.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!justEnabled || !enabled || autoChecked.current) return;
    autoChecked.current = true;
    check();
    // check() is stable enough for this — it only closes over setState and the
    // transition starter, both of which React guarantees are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justEnabled, enabled]);

  function getDraft(risk: WeatherRiskView, targetDay: string | null): string {
    if (editedDrafts[risk.jobId] !== undefined) {
      return editedDrafts[risk.jobId];
    }
    return draftCustomerMessage({
      businessName: risk.businessName || state.businessName || 'your contractor',
      customerName: risk.clientName,
      day: risk.day,
      assessment: {
        day: risk.day,
        level: risk.level as any,
        reasons: risk.reasons,
        summary: risk.summary,
      },
      sensitivity: { label: risk.sensitivityLabel, reasonNote: risk.reasonNote } as any,
      alternatives: risk.alternatives.map((a) => ({ day: a.day, level: 'clear', reasons: [], summary: a.summary })),
      targetAlternativeDay: targetDay || undefined,
    });
  }

  async function handleSendSms(risk: WeatherRiskView, targetDay: string | null) {
    const msg = getDraft(risk, targetDay);
    setSending((prev) => ({ ...prev, [risk.jobId]: true }));
    try {
      const res = await sendWeatherRescheduleSmsAction({
        jobId: risk.jobId,
        message: msg,
        proposedDate: targetDay,
        originalDate: risk.day,
        reasons: risk.reasons,
      });
      if (res.ok) {
        setSentStatus((prev) => ({
          ...prev,
          [risk.jobId]: {
            sent: true,
            sentAt: res.sentAt,
            sentTo: res.sentTo,
            isDelayed: res.isDelayed,
            scheduledSendAt: res.scheduledSendAt,
            quietHoursReason: res.quietHoursReason,
          },
        }));
      } else {
        setSentStatus((prev) => ({
          ...prev,
          [risk.jobId]: { sent: false, sentAt: '', sentTo: '', error: res.error },
        }));
      }
    } catch (err) {
      setSentStatus((prev) => ({
        ...prev,
        [risk.jobId]: { sent: false, sentAt: '', sentTo: '', error: err instanceof Error ? err.message : 'Send failed' },
      }));
    } finally {
      setSending((prev) => ({ ...prev, [risk.jobId]: false }));
    }
  }

  async function handleMoveJob(risk: WeatherRiskView, targetDay: string) {
    setMoving((prev) => ({ ...prev, [risk.jobId]: true }));
    try {
      const res = await moveJobToWeatherDateAction({
        jobId: risk.jobId,
        newDate: targetDay,
        reason: risk.reasons.join(', ') || risk.summary,
      });
      if (res.ok) {
        setMovedStatus((prev) => ({
          ...prev,
          [risk.jobId]: { moved: true, newDate: res.newDate },
        }));
      } else {
        setMovedStatus((prev) => ({
          ...prev,
          [risk.jobId]: { moved: false, newDate: '', error: res.error },
        }));
      }
    } catch (err) {
      setMovedStatus((prev) => ({
        ...prev,
        [risk.jobId]: { moved: false, newDate: '', error: err instanceof Error ? err.message : 'Move failed' },
      }));
    } finally {
      setMoving((prev) => ({ ...prev, [risk.jobId]: false }));
    }
  }

  async function handleLogTimeline(risk: WeatherRiskView) {
    setLogging((prev) => ({ ...prev, [risk.jobId]: true }));
    try {
      const res = await logWeatherRiskToTimelineAction({
        jobId: risk.jobId,
        day: risk.day,
        summary: risk.summary,
        reasons: risk.reasons,
      });
      if (res.ok) {
        setLoggedStatus((prev) => ({ ...prev, [risk.jobId]: true }));
      }
    } catch {
      // silent
    } finally {
      setLogging((prev) => ({ ...prev, [risk.jobId]: false }));
    }
  }

  async function handleBatchSend() {
    const candidates = state.risks.filter(
      (r) => r.canSendSms && !sentStatus[r.jobId]?.sent && !movedStatus[r.jobId]?.moved
    );
    if (candidates.length === 0) return;

    setBatchSending(true);
    setBatchSummary(null);
    try {
      const items = candidates.map((r) => {
        const target = selectedTargetDay[r.jobId] ?? (r.alternatives[0]?.day || null);
        return {
          jobId: r.jobId,
          message: getDraft(r, target),
          proposedDate: target,
          originalDate: r.day,
          reasons: r.reasons,
        };
      });
      const res = await batchSendWeatherRescheduleSmsAction(items);
      setBatchSummary(
        `Batch finished: ${res.sentCount} text${res.sentCount === 1 ? '' : 's'} queued successfully.${
          res.failedCount > 0 ? ` (${res.failedCount} failed)` : ''
        }`
      );
      // Mark successfully sent items
      const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setSentStatus((prev) => {
        const next = { ...prev };
        for (const item of res.results) {
          if (item.ok) {
            const risk = state.risks.find((x) => x.jobId === item.jobId);
            next[item.jobId] = { sent: true, sentAt: nowTime, sentTo: risk?.formattedPhone || 'client' };
          }
        }
        return next;
      });
    } catch (err) {
      setBatchSummary(err instanceof Error ? err.message : 'Batch send encountered an error.');
    } finally {
      setBatchSending(false);
    }
  }

  if (!enabled) {
    return (
      <details className="panel workspace-section-card workspace-details">
        <summary className="workspace-details-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Weather</p>
            <h2>Watch the forecast</h2>
          </div>
          <span className="workspace-details-copy">Flag scheduled work the weather is going to ruin.</span>
        </summary>
        <form action={updateWeatherSettingsAction} className="form-grid compact-form">
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            Checks the US National Weather Service forecast against your scheduled jobs and tells you which days are
            in trouble. It never moves anything — you decide, and it drafts the text.
          </p>
          <div className="field">
            <label htmlFor="weatherProfile">What stops your work</label>
            <select id="weatherProfile" name="weatherProfile" defaultValue="">
              <option value="">Work it out from my trade ({profile})</option>
              {SENSITIVITIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <small className="field-hint">
              A painter and a landscaper care about very different days. This sets the thresholds.
            </small>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary">Turn it on</button>
          </div>
        </form>
      </details>
    );
  }

  const batchEligible = state.risks.filter(
    (r) => r.canSendSms && !sentStatus[r.jobId]?.sent && !movedStatus[r.jobId]?.moved
  );

  return (
    <section className="panel workspace-section-card" id="weather-panel">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Weather · {profile}</p>
        <h2>Days that look wrong</h2>
        {state.checked ? (
          <div className="weather-checked-bar">
            <small className="weather-checked-time">Checked {state.checkedAt ? `at ${state.checkedAt}` : 'just now'}</small>
            <button type="button" className="btn ghost compact-btn" onClick={check} disabled={pending || batchSending}>
              {pending ? 'Re-checking…' : 'Re-check'}
            </button>
          </div>
        ) : null}
      </div>

      {!state.checked ? (
        <>
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            {pending
              ? 'Reading the forecast for every day you have work booked. Takes a few seconds.'
              : 'Checks the next two weeks of scheduled work against the forecast.'}
          </p>
          <button type="button" className="btn secondary" onClick={check} disabled={pending}>
            {pending ? 'Checking…' : 'Check the forecast'}
          </button>
        </>
      ) : state.risks.length === 0 ? (
        <p className="empty-state">
          Nothing in the next two weeks looks like a problem. Jobs without an address on file aren&apos;t checked —
          there&apos;s no forecast for a place we don&apos;t know.
        </p>
      ) : (
        <div className="weather-risk-list">
          {batchEligible.length > 1 ? (
            <div className="weather-batch-bar">
              <div className="weather-batch-info">
                <strong>{batchEligible.length} weather-impacted jobs ready for outreach</strong>
                <span>1-tap batch sends personalized reschedule SMS to all confirmed mobile numbers</span>
              </div>
              <button
                type="button"
                className="btn primary compact-btn"
                onClick={handleBatchSend}
                disabled={batchSending || pending}
              >
                {batchSending ? 'Sending Batch…' : `Batch Notify ${batchEligible.length} Customers`}
              </button>
            </div>
          ) : null}

          {batchSummary ? (
            <div className="weather-sent-badge" style={{ marginBottom: '0.6rem' }}>
              ✓ {batchSummary}
            </div>
          ) : null}

          {state.risks.map((risk) => {
            const targetDay = selectedTargetDay[risk.jobId] ?? (risk.alternatives[0]?.day || null);
            const currentDraft = getDraft(risk, targetDay);
            const isEditingThis = editingCard[risk.jobId] ?? false;
            const sentInfo = sentStatus[risk.jobId];
            const movedInfo = movedStatus[risk.jobId];
            const isSendingThis = sending[risk.jobId] ?? false;
            const isMovingThis = moving[risk.jobId] ?? false;

            return (
              <article key={risk.jobId} className={`weather-risk level-${risk.level}`}>
                <header className="weather-risk-head">
                  <div>
                    <strong>{formatDay(risk.day)}</strong>
                    <span className="weather-risk-level">{risk.levelLabel}</span>
                  </div>
                  <Link href={`/dashboard/jobs/${risk.jobId}`} className="weather-risk-job">
                    {risk.clientName}
                    {risk.ref ? ` · ${risk.ref}` : ''} →
                  </Link>
                </header>

                <p className="weather-risk-why">
                  {risk.summary}
                  {risk.reasons.length > 0 ? ` — ${risk.reasons.join(', ')}` : ''}
                </p>

                {/* Alternative Day Picker */}
                {risk.alternatives.length > 0 ? (
                  <div className="weather-alt-selector">
                    <span className="weather-alt-label">Suggest alternate clear day:</span>
                    <div className="weather-alt-chips" role="group" aria-label="Alternative dates">
                      {risk.alternatives.map((alt, index) => {
                        const isSelected = (targetDay === alt.day) || (!targetDay && index === 0);
                        return (
                          <button
                            key={alt.day}
                            type="button"
                            className={`weather-alt-pill ${isSelected ? 'is-active' : ''}`}
                            onClick={() => {
                              setSelectedTargetDay((prev) => ({ ...prev, [risk.jobId]: alt.day }));
                              // Clear custom edit when switching day to refresh copy
                              setEditedDrafts((prev) => {
                                const copy = { ...prev };
                                delete copy[risk.jobId];
                                return copy;
                              });
                            }}
                          >
                            {formatDay(alt.day)}
                            {index === 0 ? ' (Earliest)' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="weather-risk-alts">
                    Nothing clear inside the forecast horizon (~7 days). Check again nearer the time.
                  </p>
                )}

                {/* Draft text display or edit */}
                <div className="weather-risk-draft">
                  {isEditingThis ? (
                    <>
                      <textarea
                        className="weather-draft-textarea"
                        rows={3}
                        value={currentDraft}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditedDrafts((prev) => ({ ...prev, [risk.jobId]: val }));
                        }}
                      />
                      <button
                        type="button"
                        className="btn ghost xs"
                        onClick={() => setEditingCard((prev) => ({ ...prev, [risk.jobId]: false }))}
                      >
                        Done editing
                      </button>
                    </>
                  ) : (
                    <>
                      <p>{currentDraft}</p>
                      <button
                        type="button"
                        className="btn ghost xs"
                        onClick={() => setEditingCard((prev) => ({ ...prev, [risk.jobId]: true }))}
                      >
                        Customize text
                      </button>
                    </>
                  )}
                </div>

                {/* Action Toolbar */}
                <div className="weather-card-actions">
                  {sentInfo?.sent ? (
                    sentInfo.isDelayed ? (
                      <span
                        className="weather-sent-badge text-amber-300 border-amber-500/30 bg-amber-500/10"
                        title={sentInfo.quietHoursReason || 'TCPA quiet hours: delivery scheduled for 8:01 AM local time'}
                      >
                        🌙 Queued for {sentInfo.scheduledSendAt || 'tomorrow 8:01 AM'} (TCPA hold)
                      </span>
                    ) : (
                      <span className="weather-sent-badge">
                        ✓ Text sent to {sentInfo.sentTo} ({sentInfo.sentAt})
                      </span>
                    )
                  ) : risk.alreadySentToday ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span
                        className="weather-sent-badge text-sky-300 border-sky-500/30 bg-sky-500/10"
                        title="A weather reschedule offer was already sent to this customer within the last 24 hours"
                      >
                        ✓ Offer sent today ({risk.lastSentAt || 'earlier'})
                      </span>
                      {risk.canSendSms ? (
                        <button
                          type="button"
                          className="btn ghost xs"
                          onClick={() => handleSendSms(risk, targetDay)}
                          disabled={isSendingThis || isMovingThis}
                          title="Send another reschedule SMS to this customer"
                        >
                          {isSendingThis ? 'Sending…' : 'Re-send SMS'}
                        </button>
                      ) : null}
                    </div>
                  ) : risk.canSendSms ? (
                    <button
                      type="button"
                      className="btn primary compact-btn"
                      onClick={() => handleSendSms(risk, targetDay)}
                      disabled={isSendingThis || isMovingThis}
                    >
                      {isSendingThis ? 'Sending SMS…' : `Send SMS to ${risk.formattedPhone}`}
                    </button>
                  ) : risk.optedOut ? (
                    <span className="weather-card-notice">⚠️ Homeowner opted out of SMS</span>
                  ) : (
                    <span className="weather-card-notice">⚠️ No mobile number on file</span>
                  )}

                  {movedInfo?.moved ? (
                    <span className="weather-moved-badge">
                      ✓ Moved to {formatDay(movedInfo.newDate)}
                    </span>
                  ) : targetDay && targetDay !== risk.day ? (
                    <button
                      type="button"
                      className="btn secondary compact-btn"
                      onClick={() => handleMoveJob(risk, targetDay)}
                      disabled={isSendingThis || isMovingThis}
                      title={`Move this job to ${formatDay(targetDay)}`}
                    >
                      {isMovingThis ? 'Moving…' : `Move to ${formatDay(targetDay)}`}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn ghost compact-btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(currentDraft);
                      setCopied(risk.jobId);
                    }}
                  >
                    {copied === risk.jobId ? 'Copied ✓' : 'Copy text'}
                  </button>

                  {loggedStatus[risk.jobId] ? (
                    <span className="weather-logged-badge">
                      ✓ Logged to Timeline
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost compact-btn"
                      onClick={() => handleLogTimeline(risk)}
                      disabled={logging[risk.jobId]}
                      title="Post a weather advisory note to the job's live timeline for office staff and field crew"
                    >
                      {logging[risk.jobId] ? 'Logging…' : 'Log to Timeline'}
                    </button>
                  )}
                </div>

                {sentInfo?.error ? (
                  <p className="field-error" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
                    Error sending text: {sentInfo.error}
                  </p>
                ) : null}

                {movedInfo?.error ? (
                  <p className="field-error" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
                    Error rescheduling: {movedInfo.error}
                  </p>
                ) : null}
              </article>
            );
          })}
          <p className="weather-risk-foot">
            A forecast never moves an appointment automatically. Sending an SMS proposes the new date to the homeowner; pressing &quot;Move&quot; updates the schedule calendar directly.
          </p>
        </div>
      )}
    </section>
  );
}

