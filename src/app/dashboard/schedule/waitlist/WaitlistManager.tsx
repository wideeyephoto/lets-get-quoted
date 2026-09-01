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
} from './actions';

interface WaitlistManagerProps {
  entries: WaitlistEntry[];
  offers: WaitlistOffer[];
  activePendingOffers: WaitlistOffer[];
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header & Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
            <Link href="/dashboard/schedule" style={{ color: '#4f46e5', textDecoration: 'none' }}>
              ← Back to Schedule
            </Link>
            <span>/</span>
            <span>Cancellation Waitlist</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>
            Cancellation Waitlist & Priority Offerings
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#4b5563' }}>
            Automatically offer newly opened windows to qualified customers in priority order.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowFillSlotModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <span style={{ fontSize: 16 }}>⚡</span> Fill Opened Window
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <span>+</span> Add to Waitlist
          </button>
        </div>
      </div>

      {/* Action notification banner */}
      {actionMessage && (
        <div
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>✓ {actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#065f46', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#ffffff', padding: 18, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active in Queue
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 4 }}>
            {entries.filter((e) => e.status === 'active').length}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Ready for opening matches</div>
        </div>

        <div style={{ background: '#ffffff', padding: 18, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Live Pending Holds
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: activePendingOffers.length > 0 ? '#059669' : '#111827', marginTop: 4 }}>
            {activePendingOffers.length}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Awaiting client reply</div>
        </div>

        <div style={{ background: '#ffffff', padding: 18, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Fulfilled Slots
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
            {entries.filter((e) => e.status === 'fulfilled').length}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Successfully backfilled</div>
        </div>

        <div style={{ background: '#ffffff', padding: 18, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            High / Emergency
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706', marginTop: 4 }}>
            {entries.filter((e) => e.status === 'active' && (e.urgency === 'emergency' || e.urgency === 'high')).length}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Priority fast-track</div>
        </div>
      </div>

      {/* Active Pending Offers Section (If any) */}
      {activePendingOffers.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 18, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#16a34a', animation: 'pulse 1.5s infinite' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#166534', margin: 0 }}>
                Active Slot Holds in Progress ({activePendingOffers.length})
              </h2>
            </div>
            <span style={{ fontSize: 12, color: '#166534' }}>Auto-cascades to next candidate if not confirmed</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {activePendingOffers.map((offer) => {
              const expiresTime = new Date(offer.hold_expires_at).getTime();
              const minsLeft = Math.max(0, Math.round((expiresTime - Date.now()) / 60000));
              const entry = entries.find((e) => e.id === offer.waitlist_entry_id);

              return (
                <div
                  key={offer.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #86efac',
                    borderRadius: 8,
                    padding: 14,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                        {entry?.client_name || 'Customer'}
                      </div>
                      <div style={{ fontSize: 13, color: '#4b5563' }}>{offer.phone}</div>
                    </div>
                    <span
                      style={{
                        background: minsLeft < 10 ? '#fee2e2' : '#fef3c7',
                        color: minsLeft < 10 ? '#991b1b' : '#92400e',
                        padding: '3px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      ⏱ {minsLeft}m left
                    </span>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 13, color: '#374151', background: '#f9fafb', padding: 8, borderRadius: 6 }}>
                    <div><strong>Slot:</strong> {offer.opened_slot_date} ({formatWaitlistWindowLabel(offer.window_start, offer.window_end)})</div>
                    <div><strong>Rank:</strong> #{offer.priority_rank} (Score: {offer.priority_score})</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button
                      onClick={() => handleManualAccept(offer.id)}
                      disabled={isPending}
                      style={{
                        flex: 1,
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Customer Said YES
                    </button>
                    <button
                      onClick={() => handleManualDecline(offer.id)}
                      disabled={isPending}
                      style={{
                        flex: 1,
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Decline & Cascade
                    </button>
                    <button
                      onClick={() => handleCancelOffer(offer.id)}
                      disabled={isPending}
                      style={{
                        background: '#f3f4f6',
                        color: '#4b5563',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
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
      <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* Controls header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', padding: 3, borderRadius: 8 }}>
            {(['active', 'offered', 'fulfilled', 'all'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? '#ffffff' : 'transparent',
                  color: activeTab === tab ? '#111827' : '#6b7280',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: activeTab === tab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Search & Urgency filter */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#374151',
              }}
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
              style={{
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                width: 200,
              }}
            />
          </div>
        </div>

        {/* Entries Table */}
        {filteredEntries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>No waitlist entries found</div>
            <p style={{ fontSize: 14, margin: '4px 0 16px' }}>
              {activeTab === 'active'
                ? 'There are no active customers waiting for an earlier window.'
                : 'No records matching your search criteria.'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Customer to Waitlist
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>
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
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{entry.client_name}</div>
                        <div style={{ color: '#4b5563', fontSize: 12 }}>{entry.client_phone}</div>
                        {entry.address && (
                          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>📍 {entry.address}</div>
                        )}
                        {entry.service_name && (
                          <div style={{ color: '#4f46e5', fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                            {entry.service_name}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span
                            style={{
                              background: '#e0e7ff',
                              color: '#3730a3',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Window: {entry.preferred_window.toUpperCase()}
                          </span>
                        </div>
                        {entry.preferred_days && entry.preferred_days.length > 0 ? (
                          <div style={{ fontSize: 11, color: '#4b5563' }}>
                            Days: {entry.preferred_days.map((d) => WEEKDAY_NAMES[d]).join(', ')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Any day of week</div>
                        )}
                        {(entry.earliest_date || entry.latest_date) && (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                            Between {entry.earliest_date || 'now'} and {entry.latest_date || 'anytime'}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div>{entry.estimated_hours} hrs estimated</div>
                        {entry.estimated_value ? (
                          <div style={{ fontWeight: 600, color: '#059669', fontSize: 12 }}>
                            ${entry.estimated_value.toLocaleString()}
                          </div>
                        ) : (
                          <div style={{ color: '#9ca3af', fontSize: 11 }}>No budget set</div>
                        )}
                        <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                          Waiting {daysWaiting === 0 ? 'today' : `${daysWaiting}d`}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              entry.urgency === 'emergency'
                                ? '#fee2e2'
                                : entry.urgency === 'high'
                                ? '#ffedd5'
                                : entry.urgency === 'medium'
                                ? '#e0f2fe'
                                : '#f3f4f6',
                            color:
                              entry.urgency === 'emergency'
                                ? '#991b1b'
                                : entry.urgency === 'high'
                                ? '#9a3412'
                                : entry.urgency === 'medium'
                                ? '#075985'
                                : '#374151',
                          }}
                        >
                          {WAITLIST_URGENCY_LABELS[entry.urgency]}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              entry.status === 'active'
                                ? '#ecfdf5'
                                : entry.status === 'offered'
                                ? '#fef3c7'
                                : entry.status === 'fulfilled'
                                ? '#e0e7ff'
                                : '#f3f4f6',
                            color:
                              entry.status === 'active'
                                ? '#065f46'
                                : entry.status === 'offered'
                                ? '#92400e'
                                : entry.status === 'fulfilled'
                                ? '#3730a3'
                                : '#6b7280',
                          }}
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
                              style={{
                                background: '#059669',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Offer Slot
                            </button>
                          )}
                          <button
                            onClick={() => handleRemove(entry.id, entry.client_name)}
                            disabled={isPending}
                            style={{
                              background: 'transparent',
                              color: '#9ca3af',
                              border: 'none',
                              fontSize: 14,
                              cursor: 'pointer',
                              padding: '4px 6px',
                            }}
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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 720,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>
                  ⚡ Fill Newly Opened Window
                </h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>
                  Matches and ranks all qualified waitlist customers in priority order.
                </p>
              </div>
              <button
                onClick={() => setShowFillSlotModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* Slot definition controls */}
            <div
              style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Date of Opening
                </label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Window Start
                </label>
                <input
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Window End
                </label>
                <input
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Available Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>
            </div>

            {/* Candidates ranking section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  Qualified Candidates ({rankedCandidates.length})
                </span>
                {isLoadingCandidates && <span style={{ fontSize: 12, color: '#6b7280' }}>Calculating matches...</span>}
              </div>

              {rankedCandidates.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', background: '#f9fafb', borderRadius: 8, color: '#6b7280', fontSize: 13 }}>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                          background: isSelected ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              background: candidate.rank === 1 ? '#059669' : '#e5e7eb',
                              color: candidate.rank === 1 ? '#ffffff' : '#374151',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            #{candidate.rank}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                              {candidate.entry.client_name}
                            </div>
                            <div style={{ fontSize: 12, color: '#4b5563' }}>
                              {candidate.entry.service_name || 'General Service'} • {candidate.entry.estimated_hours}h required
                              {candidate.score.distanceMiles !== null && ` • ${candidate.score.distanceMiles} mi from route`}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                            Score: {candidate.score.totalScore}/100
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
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
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                  Score Breakdown for {selectedCandidate.entry.client_name} (Priority Rank #{selectedCandidate.rank})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 12, marginBottom: 12 }}>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>Proximity</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedCandidate.score.proximityScore}/35 pts</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>Wait Duration</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedCandidate.score.waitTimeScore}/25 pts</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>Urgency</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedCandidate.score.urgencyScore}/20 pts</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>Window Fit</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedCandidate.score.windowFitScore}/10 pts</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>Job Value</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedCandidate.score.valueScore}/10 pts</div>
                  </div>
                </div>

                {/* Offer Parameters */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Hold Reservation Timer
                    </label>
                    <select
                      value={holdMinutes}
                      onChange={(e) => setHoldMinutes(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
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
                    <label htmlFor="autoCascade" style={{ fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                      Auto-cascade to next candidate on expiry/decline
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Action Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowFillSlotModal(false)}
                style={{
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendOffer}
                disabled={!selectedCandidate || isPending}
                style={{
                  background: selectedCandidate ? '#059669' : '#9ca3af',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: selectedCandidate ? 'pointer' : 'not-allowed',
                }}
              >
                {isPending ? 'Sending...' : `Send Offer to ${selectedCandidate?.entry.client_name || 'Candidate'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add Customer to Waitlist */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>
                + Add Customer to Cancellation Waitlist
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. (555) 234-5678"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Street Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 742 Evergreen Terrace, Springfield"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Service / Trade
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Water Heater Repair"
                    value={formService}
                    onChange={(e) => setFormService(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Est. Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Est. Value ($)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 450"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Urgency Level
                  </label>
                  <select
                    value={formUrgency}
                    onChange={(e) => setFormUrgency(e.target.value as WaitlistUrgency)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  >
                    <option value="emergency">Emergency (Urgent)</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Standard</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Preferred Time Window
                  </label>
                  <select
                    value={formWindow}
                    onChange={(e) => setFormWindow(e.target.value as WaitlistWindow)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
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
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          background: isSelected ? '#4f46e5' : '#f3f4f6',
                          color: isSelected ? '#ffffff' : '#374151',
                          border: isSelected ? '1px solid #4f46e5' : '1px solid #d1d5db',
                          cursor: 'pointer',
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Earliest Acceptable Date
                  </label>
                  <input
                    type="date"
                    value={formEarliest}
                    onChange={(e) => setFormEarliest(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Latest Acceptable Date
                  </label>
                  <input
                    type="date"
                    value={formLatest}
                    onChange={(e) => setFormLatest(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Notes / Context
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Existing customer with flexible schedule on Thursdays"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    background: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
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
