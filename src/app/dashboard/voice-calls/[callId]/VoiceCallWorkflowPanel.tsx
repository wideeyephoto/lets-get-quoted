'use client';

import { useTransition, useState } from 'react';
import type { VoiceCallDisposition } from '@/lib/voice/call-workspace';
import {
  updateVoiceCallDispositionAction,
  scheduleVoiceCallCallbackAction,
  addVoiceCallNoteAction,
  createLeadFromVoiceCallAction,
} from '../actions';
import styles from './call-detail.module.css';

export default function VoiceCallWorkflowPanel({
  callId,
  currentDisposition,
  leadId,
}: {
  callId: string;
  currentDisposition: VoiceCallDisposition;
  leadId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState('');
  const [showScheduler, setShowScheduler] = useState(false);

  const handleDispositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDisposition = e.target.value;
    const formData = new FormData();
    formData.append('callId', callId);
    formData.append('disposition', newDisposition);

    startTransition(async () => {
      await updateVoiceCallDispositionAction(formData);
    });
  };

  const handleQuickCallback = (hoursFromNow: number) => {
    const targetDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const formData = new FormData();
    formData.append('callId', callId);
    formData.append('callbackDueAt', targetDate.toISOString());

    startTransition(async () => {
      await scheduleVoiceCallCallbackAction(formData);
      setShowScheduler(false);
    });
  };

  const handleCustomCallbackSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append('callId', callId);

    startTransition(async () => {
      await scheduleVoiceCallCallbackAction(formData);
      setShowScheduler(false);
    });
  };

  const handleNoteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    const formData = new FormData();
    formData.append('callId', callId);
    formData.append('note', noteText);

    startTransition(async () => {
      await addVoiceCallNoteAction(formData);
      setNoteText('');
    });
  };

  const handleCreateLead = () => {
    const formData = new FormData();
    formData.append('callId', callId);

    startTransition(async () => {
      await createLeadFromVoiceCallAction(formData);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Staff Disposition Selector */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Update Disposition</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <select
            aria-label="Staff disposition"
            value={currentDisposition}
            onChange={handleDispositionChange}
            disabled={isPending}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="needs_callback">Needs Callback</option>
            <option value="callback_scheduled">Callback Scheduled</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
            <option value="not_a_fit">Not a Fit</option>
            <option value="spam">Spam</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Quick Schedule Callback */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--mute-t62, #94a3b8)' }}>
                Schedule Callback
              </span>
              <button
                type="button"
                onClick={() => setShowScheduler(!showScheduler)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent, #3b82f6)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showScheduler ? 'Hide' : 'Set custom time'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleQuickCallback(1)}
                className={styles.actionBtnSecondary}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                In 1 hour
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleQuickCallback(24)}
                className={styles.actionBtnSecondary}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                Tomorrow
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleQuickCallback(48)}
                className={styles.actionBtnSecondary}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                In 2 days
              </button>
            </div>

            {showScheduler ? (
              <form onSubmit={handleCustomCallbackSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="datetime-local"
                  name="callbackDueAt"
                  aria-label="Callback due date and time"
                  required
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '6px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '0.8rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
                >
                  Save
                </button>
              </form>
            ) : null}
          </div>

          {!leadId ? (
            <button
              type="button"
              onClick={handleCreateLead}
              disabled={isPending}
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
            >
              ➕ Create Linked Lead
            </button>
          ) : null}
        </div>
      </div>

      {/* Add Staff Note Form */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Add Internal Note</span>
        </div>
        <form onSubmit={handleNoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <textarea
            aria-label="Internal staff note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add follow-up notes, customer preferences, or job estimates..."
            rows={3}
            disabled={isPending}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '0.85rem',
              resize: 'vertical',
            }}
          />
          <button
            type="submit"
            disabled={isPending || !noteText.trim()}
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            style={{ alignSelf: 'flex-end', opacity: noteText.trim() ? 1 : 0.5 }}
          >
            {isPending ? 'Saving...' : 'Add Note'}
          </button>
        </form>
      </div>
    </div>
  );
}
