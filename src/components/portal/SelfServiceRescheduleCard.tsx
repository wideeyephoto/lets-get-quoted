'use client';

import { useState } from 'react';
import {
  calculateAvailableRescheduleWindows,
  validateRescheduleRequest,
  type RescheduleSlotId,
  type RescheduleWindow,
} from '@/lib/client-rescheduling';

type Props = {
  jobId: string;
  currentDateLabel?: string | null;
  currentTimeWindow?: string | null;
  currentScheduledAt?: string | null;
  businessName: string;
  onConfirmReschedule?: (params: {
    requestedDate: string;
    requestedSlot: RescheduleSlotId;
    reason: string;
  }) => Promise<void>;
};

export default function SelfServiceRescheduleCard({
  jobId: _jobId,
  currentDateLabel,
  currentTimeWindow,
  currentScheduledAt,
  businessName,
  onConfirmReschedule,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableWindows = calculateAvailableRescheduleWindows({});
  const uniqueDates = Array.from(new Set(availableWindows.map((w) => w.date)));

  const [selectedDate, setSelectedDate] = useState<string>(uniqueDates[0] || '');
  const [selectedSlot, setSelectedSlot] = useState<RescheduleSlotId>('morning');
  const [reason, setReason] = useState<string>('Schedule conflict');

  const slotsForDate = availableWindows.filter((w) => w.date === selectedDate);

  async function handleSubmit() {
    setLoading(true);
    setErrorMessage(null);

    const validation = validateRescheduleRequest({
      currentScheduledAt: currentScheduledAt ?? null,
      requestedDate: selectedDate,
      requestedSlot: selectedSlot,
    });

    if (!validation.allowed) {
      setErrorMessage(validation.reason || 'Could not reschedule appointment.');
      setLoading(false);
      return;
    }

    try {
      if (!onConfirmReschedule) {
        throw new Error('Self-service rescheduling is currently unavailable. Please contact the business directly.');
      }

      await onConfirmReschedule({
        requestedDate: selectedDate,
        requestedSlot: selectedSlot,
        reason,
      });

      const matchingSlot = slotsForDate.find((s) => s.slot === selectedSlot);
      setSuccessMessage(
        `Your visit with ${businessName} has been rescheduled to ${matchingSlot?.dateLabel || selectedDate} (${matchingSlot?.timeRange}).`
      );
      setIsOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reschedule. Please try again.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '10px',
          padding: '16px 20px',
          color: '#166534',
          marginTop: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
          <span>✓</span> Appointment Rescheduled
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: '#15803d' }}>
          {successMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid var(--border-default, #e2e8f0)',
        borderRadius: '10px',
        padding: '18px 20px',
        marginTop: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Scheduled Visit
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
            {currentDateLabel || 'Upcoming Appointment'}{currentTimeWindow ? ` • ${currentTimeWindow}` : ''}
          </div>
        </div>

        {!isOpen ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📅 Reschedule Visit
          </button>
        ) : null}
      </div>

      {/* Reschedule Drawer / Selection Form */}
      {isOpen && (
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', fontWeight: 600, color: '#0f172a' }}>
            Choose a new date and arrival window:
          </h4>

          {/* Date Picker Chips */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '14px' }}>
            {uniqueDates.map((dStr) => {
              const item = availableWindows.find((w) => w.date === dStr);
              const isSelected = selectedDate === dStr;

              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => setSelectedDate(dStr)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #047857' : '1px solid #cbd5e1',
                    background: isSelected ? '#ecfdf5' : '#ffffff',
                    color: isSelected ? '#047857' : '#334155',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item?.dateLabel || dStr}
                </button>
              );
            })}
          </div>

          {/* Time Slot Chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
            {slotsForDate.map((slotItem: RescheduleWindow) => {
              const isSelected = selectedSlot === slotItem.slot;

              return (
                <button
                  key={slotItem.id}
                  type="button"
                  disabled={!slotItem.isAvailable}
                  onClick={() => setSelectedSlot(slotItem.slot)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #047857' : '1px solid #e2e8f0',
                    background: isSelected ? '#ecfdf5' : slotItem.isAvailable ? '#ffffff' : '#f1f5f9',
                    color: isSelected ? '#047857' : slotItem.isAvailable ? '#1e293b' : '#94a3b8',
                    fontWeight: 500,
                    fontSize: '0.78rem',
                    cursor: slotItem.isAvailable ? 'pointer' : 'not-allowed',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{slotItem.slotLabel}</div>
                  <div style={{ fontSize: '0.72rem', color: isSelected ? '#047857' : '#64748b', marginTop: '2px' }}>
                    {slotItem.timeRange}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Reason Selector */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              Reason for rescheduling (optional):
            </label>
            <select
              aria-label="Reason for rescheduling"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
            >
              <option value="Schedule conflict">Schedule conflict</option>
              <option value="Away from home">Away from home / out of town</option>
              <option value="Need more preparation time">Need more preparation time</option>
              <option value="Other">Other reason</option>
            </select>
          </div>

          {errorMessage && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.78rem', marginBottom: '14px' }}>
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => setIsOpen(false)}
              style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              style={{ padding: '8px 16px', borderRadius: '6px', background: '#047857', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Saving...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
