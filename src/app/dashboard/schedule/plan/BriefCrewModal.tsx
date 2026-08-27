'use client';

import { useMemo, useState, useTransition } from 'react';
import ModalDialog, { CloseOnSuccess } from '@/components/modal-dialog';
import SaveButton from '@/components/save-button';
import {
  buildCrewMorningBriefingSms,
  buildCrewDailyRunSheetText,
  buildNavUrl,
  type CrewBriefingStop,
  type NavProvider,
} from '@/lib/crew-briefing';
import type { CrewBriefingHistory } from '@/lib/crew';
import { displayPhone, normalizeUsPhone } from '@/lib/phone';
import { sendCrewMorningBriefingAction, updateCrewPhoneQuickAction } from './actions';

export type CrewBriefMember = {
  id: string;
  name: string;
  phone: string | null;
  roleLabel?: string | null;
};

export type BriefCrewModalProps = {
  dateKey: string;
  dateLabel: string;
  businessName: string;
  crew: CrewBriefMember[];
  activeCrewId: string | null;
  stops: CrewBriefingStop[];
  assignmentsByJob?: Record<string, string[]>;
  homeBaseAddress?: string | null;
  weatherSummary?: string | null;
  lastBriefing?: CrewBriefingHistory | null;
  portalUrl?: string | null;
};

const NOTE_PRESETS = [
  { label: '🌦️ Rain forecast', text: 'Rain in forecast — please start exterior jobs first.' },
  { label: '🪜 Extension ladder', text: 'Bring 32ft extension ladder and safety gear.' },
  { label: '🔒 Gate codes in notes', text: 'Check individual job notes for gate codes and pet alerts.' },
  { label: '🚚 Fuel & restock', text: 'Fuel up truck and restock fittings before leaving shop.' },
  { label: '💧 Heat advisory', text: 'Heat advisory today — stay hydrated and take shade breaks.' },
  { label: '📞 Call on way', text: 'Please call client 15 minutes before arrival window.' },
];

function formatTimeOnly(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return 'earlier';
  }
}

export default function BriefCrewModal({
  dateKey,
  dateLabel,
  businessName,
  crew: initialCrew,
  activeCrewId,
  stops,
  assignmentsByJob = {},
  homeBaseAddress = null,
  weatherSummary = null,
  lastBriefing = null,
  portalUrl = 'https://letsgetquoted.com/field',
}: BriefCrewModalProps) {
  // Local roster state so inline phone additions update immediately without full reload
  const [roster, setRoster] = useState<CrewBriefMember[]>(initialCrew);

  // Selection states
  const initialSelected = useMemo(() => {
    if (activeCrewId && roster.some((c) => c.id === activeCrewId)) {
      return new Set([activeCrewId]);
    }
    return new Set(roster.map((c) => c.id));
  }, [activeCrewId, roster]);

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(initialSelected);
  const [customNote, setCustomNote] = useState('');
  const [navProvider, setNavProvider] = useState<NavProvider>('google');
  const [includeFullRoute, setIncludeFullRoute] = useState(true);
  const [includePortal, setIncludePortal] = useState(true);
  const [isUrgentUpdate, setIsUrgentUpdate] = useState(false);
  const [includeMaterialsChecklist, setIncludeMaterialsChecklist] = useState(false);
  const [scheduledTiming, setScheduledTiming] = useState<'now' | 'scheduled_7am'>('now');
  const [copied, setCopied] = useState(false);

  // Inline phone editing state
  const [editingPhoneMemberId, setEditingPhoneMemberId] = useState<string | null>(null);
  const [inlinePhoneInput, setInlinePhoneInput] = useState('');
  const [inlinePhoneError, setInlinePhoneError] = useState<string | null>(null);
  const [isUpdatingPhone, startPhoneTransition] = useTransition();

  // Filter stops per crew member based on assignment records
  const getMemberStops = (memberId: string): CrewBriefingStop[] => {
    if (roster.length <= 1) return stops;
    const assignedJobIds = new Set(
      Object.entries(assignmentsByJob)
        .filter(([, memberIds]) => memberIds.includes(memberId))
        .map(([jobId]) => jobId)
    );

    if (assignedJobIds.size > 0) {
      return stops.filter((stop) => {
        const idPart = stop.jobRef.replace(/^JOB-/, '').toLowerCase();
        return Array.from(assignedJobIds).some((jid) =>
          jid.toLowerCase().startsWith(idPart) || jid.toLowerCase().includes(idPart)
        );
      });
    }
    return stops;
  };

  // Preview member selection
  const activeMembersList = useMemo(() => {
    const list = roster.filter((c) => selectedMemberIds.has(c.id));
    return list.length > 0 ? list : roster;
  }, [roster, selectedMemberIds]);

  const [previewMemberId, setPreviewMemberId] = useState<string>(() => {
    if (activeCrewId && roster.some((c) => c.id === activeCrewId)) return activeCrewId;
    return roster[0]?.id ?? '';
  });

  const currentPreviewMember = useMemo(() => {
    return (
      roster.find((c) => c.id === previewMemberId) ??
      activeMembersList[0] ??
      roster[0] ?? {
        id: 'team',
        name: 'Team Member',
        phone: null,
        roleLabel: 'Crew',
      }
    );
  }, [roster, previewMemberId, activeMembersList]);

  const previewStops = useMemo(() => {
    return getMemberStops(currentPreviewMember.id);
  }, [currentPreviewMember.id, stops, assignmentsByJob, roster.length]);

  // Generate live preview text
  const previewSms = useMemo(() => {
    return buildCrewMorningBriefingSms({
      crewName: currentPreviewMember.name,
      businessName,
      date: dateLabel,
      stops: previewStops,
      portalUrl: includePortal ? portalUrl : null,
      customNote: customNote.trim() || null,
      weatherSummary,
      navProvider,
      includeFullRoute,
      homeBaseAddress,
      isUrgentUpdate,
      includeMaterialsChecklist,
      scheduledTiming,
    });
  }, [
    currentPreviewMember.name,
    businessName,
    dateLabel,
    previewStops,
    includePortal,
    portalUrl,
    customNote,
    weatherSummary,
    navProvider,
    includeFullRoute,
    homeBaseAddress,
    isUrgentUpdate,
    includeMaterialsChecklist,
    scheduledTiming,
  ]);

  // Generate full run-sheet for clipboard or print
  const fullRunSheetText = useMemo(() => {
    return buildCrewDailyRunSheetText({
      crewName: currentPreviewMember.name,
      businessName,
      date: dateLabel,
      stops: previewStops,
      portalUrl: includePortal ? portalUrl : null,
      customNote: customNote.trim() || null,
      weatherSummary,
      navProvider,
      includeFullRoute,
      homeBaseAddress,
      isUrgentUpdate,
      includeMaterialsChecklist,
      scheduledTiming,
    });
  }, [
    currentPreviewMember.name,
    businessName,
    dateLabel,
    previewStops,
    includePortal,
    portalUrl,
    customNote,
    weatherSummary,
    navProvider,
    includeFullRoute,
    homeBaseAddress,
    isUrgentUpdate,
    includeMaterialsChecklist,
    scheduledTiming,
  ]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedMemberIds(new Set(roster.map((c) => c.id)));
  const deselectAll = () => setSelectedMemberIds(new Set());

  // Count ready vs missing phones among selected
  const selectedWithPhone = useMemo(() => {
    return roster.filter((c) => selectedMemberIds.has(c.id) && Boolean(normalizeUsPhone(c.phone || '')));
  }, [roster, selectedMemberIds]);

  const selectedWithoutPhone = useMemo(() => {
    return roster.filter((c) => selectedMemberIds.has(c.id) && !normalizeUsPhone(c.phone || ''));
  }, [roster, selectedMemberIds]);

  // Add preset note
  const applyPreset = (presetText: string) => {
    setCustomNote((prev) => {
      const clean = prev.trim();
      if (!clean) return presetText;
      if (clean.includes(presetText)) return clean;
      return `${clean} ${presetText}`;
    });
  };

  // Inline phone save
  const handleSaveInlinePhone = (memberId: string) => {
    setInlinePhoneError(null);
    startPhoneTransition(async () => {
      const res = await updateCrewPhoneQuickAction(memberId, inlinePhoneInput);
      if (!res.ok) {
        setInlinePhoneError(res.error || 'Failed to save number.');
        return;
      }
      setRoster((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, phone: res.phone ?? inlinePhoneInput } : m))
      );
      setEditingPhoneMemberId(null);
      setInlinePhoneInput('');
    });
  };

  // Copy run-sheet to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullRunSheetText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Print run-sheet popup
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      window.print();
      return;
    }
    const safeWeather = weatherSummary
      ? `<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;margin-bottom:12px;border-radius:4px;font-size:14px;color:#1e40af;"><strong>🌤️ Weather Outlook:</strong> ${weatherSummary.replace(/</g, '&lt;')}</div>`
      : '';
    const safeNote = customNote.trim()
      ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 14px;margin-bottom:18px;border-radius:4px;font-size:14px;color:#92400e;"><strong>📌 Daily Note:</strong> ${customNote.trim().replace(/</g, '&lt;')}</div>`
      : '';

    const materialsChecklistHtml =
      includeMaterialsChecklist && previewStops.some((s) => s.scope)
        ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px 16px;margin-bottom:16px;border-radius:6px;page-break-inside:avoid;">
        <strong style="display:block;font-size:14px;margin-bottom:8px;color:#0f172a;">🧰 Truck Packing & Materials Checklist:</strong>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.6;">
          ${previewStops
            .map(
              (s, i) =>
                `<li><strong>Stop #${i + 1} (${s.clientName || 'Job'}):</strong> ${s.scope || 'Standard tools / materials'}</li>`
            )
            .join('')}
        </ul>
      </div>`
        : '';

    const stopsHtml =
      previewStops.length === 0
        ? '<p>No scheduled stops for this day.</p>'
        : previewStops
            .map((stop, i) => {
              const navLink = buildNavUrl(navProvider, stop.address, stop.lat, stop.lng);
              return `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:14px;page-break-inside:avoid;">
          <div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin-bottom:6px;">
            <span>Stop #${i + 1} [${stop.jobRef}] - ${stop.clientName || 'Client'}</span>
            <span style="color:#2563eb;font-weight:600;">${stop.scheduledTime || 'Anytime'}</span>
          </div>
          ${stop.phone ? `<div style="font-size:14px;margin-bottom:4px;"><span style="color:#6b7280;font-weight:500;">Phone:</span> ${stop.phone}</div>` : ''}
          <div style="font-size:14px;margin-bottom:4px;"><span style="color:#6b7280;font-weight:500;">Address:</span> ${stop.address || 'No address specified'}</div>
          <div style="font-size:14px;margin-bottom:4px;"><span style="color:#6b7280;font-weight:500;">Navigation (${navProvider.toUpperCase()}):</span> <a style="color:#2563eb;text-decoration:none;word-break:break-all;" href="${navLink}" target="_blank">${navLink}</a></div>
          ${stop.scope ? `<div style="font-size:14px;margin-bottom:4px;"><span style="color:#6b7280;font-weight:500;">Scope:</span> ${stop.scope}</div>` : ''}
          ${stop.notes ? `<div style="font-size:14px;margin-bottom:4px;"><span style="color:#6b7280;font-weight:500;">Notes:</span> ${stop.notes}</div>` : ''}
        </div>
      `;
            })
            .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${isUrgentUpdate ? 'URGENT ' : ''}Daily Dispatch Run-Sheet - ${dateLabel}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background: #fff; line-height: 1.5; }
    h1 { font-size: 20px; margin: 0 0 4px; color: #111827; }
    .meta { font-size: 14px; color: #4b5563; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${isUrgentUpdate ? '🚨 URGENT ' : '📋 '}Daily Dispatch Run-Sheet: ${dateLabel}</h1>
  <div class="meta">
    <strong>Assigned:</strong> ${currentPreviewMember.name} (${businessName}) &nbsp;·&nbsp;
    <strong>Total Stops:</strong> ${previewStops.length}
  </div>
  ${safeWeather}
  ${safeNote}
  ${materialsChecklistHtml}
  ${stopsHtml}
  <div class="footer">${businessName} · Dispatch Run-Sheet</div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // WhatsApp & Native SMS URLs
  const whatsAppUrl = useMemo(() => {
    const rawDigits = currentPreviewMember.phone ? currentPreviewMember.phone.replace(/\D/g, '') : '';
    const phoneParam = rawDigits.length === 10 ? `1${rawDigits}` : rawDigits;
    return `https://api.whatsapp.com/send?${phoneParam ? `phone=${phoneParam}&` : ''}text=${encodeURIComponent(previewSms)}`;
  }, [currentPreviewMember.phone, previewSms]);

  const nativeSmsUrl = useMemo(() => {
    const phone = currentPreviewMember.phone ? normalizeUsPhone(currentPreviewMember.phone) ?? '' : '';
    return `sms:${phone}?&body=${encodeURIComponent(previewSms)}`;
  }, [currentPreviewMember.phone, previewSms]);

  // SMS character & segment calculation
  const charCount = previewSms.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  return (
    <ModalDialog
      triggerLabel={
        <span className="brief-crew-trigger-inner">
          <span aria-hidden="true">📱</span>
          <span>Brief crew</span>
          {roster.length > 0 ? (
            <span
              className={`brief-crew-badge ${lastBriefing ? 'was-briefed' : ''}`}
              title={
                lastBriefing
                  ? `Briefed today at ${formatTimeOnly(lastBriefing.dispatchedAt)} (${lastBriefing.recipientCount} members)`
                  : `${roster.length} active crew member${roster.length === 1 ? '' : 's'}`
              }
            >
              {lastBriefing ? '✓' : roster.length}
            </span>
          ) : null}
        </span>
      }
      triggerClassName="btn ghost brief-crew-btn"
      title="Morning Crew Dispatch & Briefing"
    >
      <form action={sendCrewMorningBriefingAction} className="brief-crew-form">
        <CloseOnSuccess />
        <input type="hidden" name="dateKey" value={dateKey} />
        <input type="hidden" name="crewId" value={activeCrewId ?? ''} />
        <input type="hidden" name="customNote" value={customNote} />
        <input type="hidden" name="weatherSummary" value={weatherSummary ?? ''} />
        <input type="hidden" name="navProvider" value={navProvider} />
        <input type="hidden" name="includeFullRoute" value={includeFullRoute ? '1' : '0'} />
        <input type="hidden" name="includePortal" value={includePortal ? '1' : '0'} />
        <input type="hidden" name="isUrgentUpdate" value={isUrgentUpdate ? '1' : '0'} />
        <input type="hidden" name="includeMaterialsChecklist" value={includeMaterialsChecklist ? '1' : '0'} />
        <input type="hidden" name="scheduledTiming" value={scheduledTiming} />
        {Array.from(selectedMemberIds).map((id) => (
          <input key={id} type="hidden" name="memberId" value={id} />
        ))}

        <div className="brief-crew-header-summary">
          <div>
            <h3 className="brief-crew-day-title">{dateLabel}</h3>
            <p className="brief-crew-day-subtitle">
              {stops.length} stop{stops.length === 1 ? '' : 's'} scheduled · {businessName}
            </p>
          </div>
          <div className="brief-crew-quick-actions">
            <button
              type="button"
              className={`btn ghost sm brief-copy-btn ${copied ? 'is-copied' : ''}`}
              onClick={handleCopy}
              title="Copy formatted run-sheet to clipboard for WhatsApp, iMessage, Slack, or email"
            >
              {copied ? '✓ Copied to clipboard' : '📋 Copy run-sheet'}
            </button>
            <button
              type="button"
              className="btn ghost sm brief-print-btn"
              onClick={handlePrint}
              title="Print daily run-sheet for the truck clipboard"
            >
              🖨️ Print
            </button>
          </div>
        </div>

        {/* Dispatch History Banner if Previously Sent */}
        {lastBriefing ? (
          <div className="brief-crew-history-banner">
            <span className="history-icon">📜</span>
            <span className="history-text">
              <strong>Last dispatched:</strong> Today at {formatTimeOnly(lastBriefing.dispatchedAt)} to{' '}
              {lastBriefing.recipientCount} crew member{lastBriefing.recipientCount === 1 ? '' : 's'}
              {lastBriefing.isUrgent ? ' (Urgent Update)' : ''}.
            </span>
          </div>
        ) : null}

        {/* Live Weather Outlook Banner if Available */}
        {weatherSummary ? (
          <div className="brief-crew-weather-card">
            <div className="brief-crew-weather-info">
              <span className="brief-crew-weather-icon">🌤️</span>
              <span className="brief-crew-weather-text">
                <strong>Weather:</strong> {weatherSummary}
              </span>
            </div>
            <button
              type="button"
              className="btn ghost xs brief-crew-weather-btn"
              onClick={() => applyPreset(`🌤️ Weather: ${weatherSummary}.`)}
              title="Add morning weather advisory into dispatch notes"
            >
              + Add to notes
            </button>
          </div>
        ) : null}

        {/* Dispatch Mode: Urgent Update & Timing Options */}
        <section className="brief-crew-section compact">
          <div className="brief-crew-mode-row">
            <label className={`brief-crew-toggle-pill urgent ${isUrgentUpdate ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={isUrgentUpdate}
                onChange={(e) => setIsUrgentUpdate(e.target.checked)}
              />
              <span>🚨 Urgent Mid-Day Route Update</span>
            </label>

            <div className="brief-crew-timing-selector" role="radiogroup" aria-label="Dispatch timing">
              <label className={`brief-crew-timing-pill ${scheduledTiming === 'now' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="timing_choice"
                  checked={scheduledTiming === 'now'}
                  onChange={() => setScheduledTiming('now')}
                />
                <span>⚡ Send Now</span>
              </label>
              <label
                className={`brief-crew-timing-pill ${scheduledTiming === 'scheduled_7am' ? 'active' : ''}`}
                title="Schedules dispatch for 7:00 AM on the morning of work"
              >
                <input
                  type="radio"
                  name="timing_choice"
                  checked={scheduledTiming === 'scheduled_7am'}
                  onChange={() => setScheduledTiming('scheduled_7am')}
                />
                <span>⏰ 7:00 AM Auto-Send</span>
              </label>
            </div>
          </div>
        </section>

        {/* Recipient Selection & Phone Verification */}
        <section className="brief-crew-section">
          <div className="brief-crew-section-head">
            <div>
              <span className="brief-crew-section-title">Crew Recipients</span>
              <span className="brief-crew-section-meta">
                ({selectedWithPhone.length} of {selectedMemberIds.size} ready for SMS)
              </span>
            </div>
            {roster.length > 1 ? (
              <div className="brief-crew-select-tools">
                <button type="button" className="text-btn" onClick={selectAll}>
                  Select all
                </button>
                <span>·</span>
                <button type="button" className="text-btn" onClick={deselectAll}>
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          {roster.length > 0 ? (
            <div className="brief-crew-roster" role="group" aria-label="Crew members to receive briefing">
              {roster.map((member) => {
                const isSelected = selectedMemberIds.has(member.id);
                const hasValidPhone = Boolean(normalizeUsPhone(member.phone || ''));
                const memberStops = getMemberStops(member.id);
                const isEditingThisPhone = editingPhoneMemberId === member.id;

                return (
                  <div
                    key={member.id}
                    className={`brief-crew-card ${isSelected ? 'is-selected' : ''} ${!hasValidPhone ? 'has-warning' : ''}`}
                  >
                    <label className="brief-crew-card-checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMember(member.id)}
                        className="brief-crew-checkbox"
                      />
                    </label>

                    <div className="brief-crew-card-info">
                      <div className="brief-crew-card-top">
                        <span className="brief-crew-member-name">{member.name}</span>
                        {member.roleLabel ? (
                          <span className="brief-crew-member-role">{member.roleLabel}</span>
                        ) : null}
                        <span className="brief-crew-stops-pill">
                          {memberStops.length} stop{memberStops.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="brief-crew-card-contact">
                        {hasValidPhone ? (
                          <span className="brief-crew-phone-valid">
                            <span className="phone-indicator ok">●</span> {displayPhone(member.phone || '')}
                          </span>
                        ) : isEditingThisPhone ? (
                          <div className="brief-crew-inline-phone-form" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="tel"
                              placeholder="(555) 000-0000"
                              value={inlinePhoneInput}
                              onChange={(e) => setInlinePhoneInput(e.target.value)}
                              className="brief-crew-inline-phone-input"
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn primary xs"
                              disabled={isUpdatingPhone || !inlinePhoneInput.trim()}
                              onClick={() => handleSaveInlinePhone(member.id)}
                            >
                              {isUpdatingPhone ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn ghost xs"
                              onClick={() => {
                                setEditingPhoneMemberId(null);
                                setInlinePhoneInput('');
                                setInlinePhoneError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="brief-crew-phone-missing-row">
                            <span className="brief-crew-phone-missing">
                              <span className="phone-indicator warn">!</span> No mobile phone on file
                            </span>
                            <button
                              type="button"
                              className="text-btn brief-crew-add-phone-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPhoneMemberId(member.id);
                                setInlinePhoneInput('');
                                setInlinePhoneError(null);
                              }}
                            >
                              + Add number
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditingThisPhone && inlinePhoneError ? (
                        <p className="brief-crew-error-text">{inlinePhoneError}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="brief-crew-empty-roster">
              <p>No crew members are currently registered in your roster.</p>
              <p className="subtext">
                You can still copy or print the daily run-sheet above, or add crew members under{' '}
                <a href="/dashboard/crew" className="link" target="_blank" rel="noreferrer">
                  Settings → Crew
                </a>
                .
              </p>
            </div>
          )}

          {selectedWithoutPhone.length > 0 && selectedWithPhone.length > 0 ? (
            <p className="brief-crew-warning-inline">
              ⚠️ {selectedWithoutPhone.length} selected member{selectedWithoutPhone.length === 1 ? '' : 's'} ({selectedWithoutPhone.map((m) => m.name).join(', ')}) will be skipped from SMS delivery due to missing phone numbers.
            </p>
          ) : null}

          <div style={{
            marginTop: '0.85rem',
            padding: '0.75rem 1rem',
            background: 'rgba(147, 51, 234, 0.08)',
            border: '1px solid rgba(147, 51, 234, 0.25)',
            borderRadius: '0.65rem',
            fontSize: '0.82rem',
            color: '#d1d5db',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}>
            <span style={{ fontSize: '1.15rem' }}>🎙️</span>
            <span>
              <strong style={{ color: '#e9d5ff' }}>Crew Voice Hotline:</strong> Saved mobile numbers can call your business number anytime to verbally update job notes, log materials, and record change orders on the road.
            </span>
          </div>
        </section>

        {/* Custom Dispatch Notes & Quick Presets */}
        <section className="brief-crew-section">
          <label className="brief-crew-field">
            <div className="brief-crew-section-head">
              <span className="brief-crew-section-title">Daily Notes & Instructions (Optional)</span>
              <span className="brief-crew-char-meta">{280 - customNote.length} left</span>
            </div>
            <span className="brief-crew-section-desc">
              Add gate codes, weather warnings, or equipment reminders to include in the briefing.
            </span>

            {/* Quick Preset Pills */}
            <div className="brief-crew-presets" role="group" aria-label="Quick note shortcuts">
              {NOTE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="brief-crew-preset-pill"
                  onClick={() => applyPreset(preset.text)}
                  title={`Insert: ${preset.text}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <textarea
              className="brief-crew-textarea"
              rows={2}
              placeholder="e.g. Gate code #4012 at stop 2. Rain forecast at 2 PM — please complete exterior work first."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              maxLength={280}
            />
          </label>
        </section>

        {/* Map App, Materials & Route Link Preferences */}
        <section className="brief-crew-section compact">
          <div className="brief-crew-options-grid">
            <label className="brief-crew-option-select-label">
              <span className="option-title">🧭 Map App:</span>
              <select
                value={navProvider}
                onChange={(e) => setNavProvider(e.target.value as NavProvider)}
                className="brief-crew-select"
              >
                <option value="google">🗺️ Google Maps</option>
                <option value="apple">🍎 Apple Maps</option>
                <option value="waze">🚙 Waze</option>
              </select>
            </label>

            <label className="brief-crew-checkbox-label">
              <input
                type="checkbox"
                checked={includeMaterialsChecklist}
                onChange={(e) => setIncludeMaterialsChecklist(e.target.checked)}
              />
              <span>🧰 Include truck packing & materials checklist</span>
            </label>

            {stops.length > 1 ? (
              <label className="brief-crew-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeFullRoute}
                  onChange={(e) => setIncludeFullRoute(e.target.checked)}
                />
                <span>Include full-day master route link</span>
              </label>
            ) : null}

            <label className="brief-crew-checkbox-label">
              <input
                type="checkbox"
                checked={includePortal}
                onChange={(e) => setIncludePortal(e.target.checked)}
              />
              <span>Include Field App portal link</span>
            </label>
          </div>
        </section>

        {/* Live SMS Dispatch Preview */}
        <section className="brief-crew-section">
          <div className="brief-crew-section-head">
            <span className="brief-crew-section-title">Live SMS Preview</span>
            {activeMembersList.length > 1 ? (
              <label className="brief-crew-preview-select">
                <span>Preview for:</span>
                <select
                  value={currentPreviewMember.id}
                  onChange={(e) => setPreviewMemberId(e.target.value)}
                >
                  {activeMembersList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({getMemberStops(m.id).length} stops)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className={`brief-crew-sms-preview-bubble ${isUrgentUpdate ? 'is-urgent' : ''}`}>
            <div className="brief-crew-sms-meta">
              <span>To: {currentPreviewMember.name} {currentPreviewMember.phone ? `(${displayPhone(currentPreviewMember.phone)})` : ''}</span>
              <span>{charCount} chars · ~{segmentCount} segment{segmentCount === 1 ? '' : 's'}</span>
            </div>
            <pre className="brief-crew-sms-body">{previewSms}</pre>
          </div>

          {/* Alternative 1-Tap App Actions (WhatsApp / Native Messages) */}
          <div className="brief-crew-alt-channels">
            <span className="brief-crew-alt-label">Or send directly:</span>
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost xs brief-channel-btn whatsapp"
              title="Open WhatsApp with prefilled morning dispatch"
            >
              💬 WhatsApp
            </a>
            <a
              href={nativeSmsUrl}
              className="btn ghost xs brief-channel-btn imessage"
              title="Open in Apple Messages / Device SMS app"
            >
              📱 Device Messages (iMessage)
            </a>
          </div>
        </section>

        {/* Modal Footer Actions */}
        <div className="brief-crew-footer">
          <div className="brief-crew-footer-status">
            {selectedWithPhone.length === 0 ? (
              <span className="brief-footer-warn">
                ⚠️ Add or select at least one crew member with a phone number to send SMS.
              </span>
            ) : scheduledTiming === 'scheduled_7am' ? (
              <span className="brief-footer-ready">
                ⏰ Ready to schedule dispatch for 7:00 AM to {selectedWithPhone.length} crew {selectedWithPhone.length === 1 ? 'member' : 'members'}.
              </span>
            ) : isUrgentUpdate ? (
              <span className="brief-footer-ready urgent">
                🚨 Ready to broadcast urgent update to {selectedWithPhone.length} crew {selectedWithPhone.length === 1 ? 'member' : 'members'}.
              </span>
            ) : (
              <span className="brief-footer-ready">
                Ready to dispatch SMS to {selectedWithPhone.length} crew {selectedWithPhone.length === 1 ? 'member' : 'members'}.
              </span>
            )}
          </div>

          <div className="brief-crew-footer-buttons">
            <SaveButton
              className={`btn ${isUrgentUpdate ? 'warn' : 'primary'} brief-send-btn`}
              pendingLabel={scheduledTiming === 'scheduled_7am' ? 'Scheduling…' : 'Dispatching SMS…'}
              savedLabel={scheduledTiming === 'scheduled_7am' ? 'Scheduled ✓' : 'Dispatched ✓'}
              disabled={selectedWithPhone.length === 0}
              title={
                selectedWithPhone.length === 0
                  ? 'No selected crew members have phone numbers configured'
                  : `${scheduledTiming === 'scheduled_7am' ? 'Schedule' : 'Send'} dispatch to ${selectedWithPhone.length} crew member${selectedWithPhone.length === 1 ? '' : 's'}`
              }
            >
              {scheduledTiming === 'scheduled_7am'
                ? `⏰ Schedule for 7:00 AM (${selectedWithPhone.length})`
                : isUrgentUpdate
                ? `🚨 Send Urgent Update (${selectedWithPhone.length})`
                : `📲 Send Morning Dispatch SMS (${selectedWithPhone.length})`}
            </SaveButton>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
