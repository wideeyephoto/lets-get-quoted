'use client';

import { useMemo, useState } from 'react';
import ModalDialog, { CloseOnSuccess } from '@/components/modal-dialog';
import SaveButton from '@/components/save-button';
import {
  buildCrewMorningBriefingSms,
  buildCrewDailyRunSheetText,
  type CrewBriefingStop,
} from '@/lib/crew-briefing';
import { displayPhone, normalizeUsPhone } from '@/lib/phone';
import { sendCrewMorningBriefingAction } from './actions';

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
  portalUrl?: string | null;
};

export default function BriefCrewModal({
  dateKey,
  dateLabel,
  businessName,
  crew,
  activeCrewId,
  stops,
  assignmentsByJob = {},
  portalUrl = 'https://letsgetquoted.com/field',
}: BriefCrewModalProps) {
  // Initial selection: active filtered crew if set, otherwise all members
  const initialSelected = useMemo(() => {
    if (activeCrewId && crew.some((c) => c.id === activeCrewId)) {
      return new Set([activeCrewId]);
    }
    return new Set(crew.map((c) => c.id));
  }, [activeCrewId, crew]);

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(initialSelected);
  const [customNote, setCustomNote] = useState('');
  const [includePortal, setIncludePortal] = useState(true);
  const [copied, setCopied] = useState(false);

  // Filter stops per crew member based on assignment records
  const getMemberStops = (memberId: string): CrewBriefingStop[] => {
    if (crew.length <= 1) return stops;
    // Find job ids assigned to this member
    const assignedJobIds = new Set(
      Object.entries(assignmentsByJob)
        .filter(([, memberIds]) => memberIds.includes(memberId))
        .map(([jobId]) => jobId)
    );

    // If assignments exist for this member, filter
    if (assignedJobIds.size > 0) {
      return stops.filter((stop) => {
        // Match by job id from jobRef or stop data
        const idPart = stop.jobRef.replace(/^JOB-/, '').toLowerCase();
        return Array.from(assignedJobIds).some((jid) =>
          jid.toLowerCase().startsWith(idPart) || jid.toLowerCase().includes(idPart)
        );
      });
    }
    // Default to all stops if no specific assignments
    return stops;
  };

  // Preview member selection
  const activeMembersList = useMemo(() => {
    const list = crew.filter((c) => selectedMemberIds.has(c.id));
    return list.length > 0 ? list : crew;
  }, [crew, selectedMemberIds]);

  const [previewMemberId, setPreviewMemberId] = useState<string>(() => {
    if (activeCrewId && crew.some((c) => c.id === activeCrewId)) return activeCrewId;
    return crew[0]?.id ?? '';
  });

  const currentPreviewMember = useMemo(() => {
    return (
      crew.find((c) => c.id === previewMemberId) ??
      activeMembersList[0] ??
      crew[0] ?? {
        id: 'team',
        name: 'Team Member',
        phone: null,
        roleLabel: 'Crew',
      }
    );
  }, [crew, previewMemberId, activeMembersList]);

  const previewStops = useMemo(() => {
    return getMemberStops(currentPreviewMember.id);
  }, [currentPreviewMember.id, stops, assignmentsByJob, crew.length]);

  // Generate live preview text
  const previewSms = useMemo(() => {
    return buildCrewMorningBriefingSms({
      crewName: currentPreviewMember.name,
      businessName,
      date: dateLabel,
      stops: previewStops,
      portalUrl: includePortal ? portalUrl : null,
      customNote: customNote.trim() || null,
    });
  }, [currentPreviewMember.name, businessName, dateLabel, previewStops, includePortal, portalUrl, customNote]);

  // Generate full run-sheet for clipboard or print
  const fullRunSheetText = useMemo(() => {
    return buildCrewDailyRunSheetText({
      crewName: currentPreviewMember.name,
      businessName,
      date: dateLabel,
      stops: previewStops,
      portalUrl: includePortal ? portalUrl : null,
      customNote: customNote.trim() || null,
    });
  }, [currentPreviewMember.name, businessName, dateLabel, previewStops, includePortal, portalUrl, customNote]);

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

  const selectAll = () => setSelectedMemberIds(new Set(crew.map((c) => c.id)));
  const deselectAll = () => setSelectedMemberIds(new Set());

  // Count ready vs missing phones among selected
  const selectedWithPhone = useMemo(() => {
    return crew.filter((c) => selectedMemberIds.has(c.id) && Boolean(normalizeUsPhone(c.phone || '')));
  }, [crew, selectedMemberIds]);

  const selectedWithoutPhone = useMemo(() => {
    return crew.filter((c) => selectedMemberIds.has(c.id) && !normalizeUsPhone(c.phone || ''));
  }, [crew, selectedMemberIds]);

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

  // Print run-sheet
  const handlePrint = () => {
    window.print();
  };

  // SMS character & segment calculation
  const charCount = previewSms.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  return (
    <ModalDialog
      triggerLabel={
        <span className="brief-crew-trigger-inner">
          <span aria-hidden="true">📱</span>
          <span>Brief crew</span>
          {crew.length > 0 ? (
            <span className="brief-crew-badge" title={`${crew.length} active crew member${crew.length === 1 ? '' : 's'}`}>
              {crew.length}
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
        <input type="hidden" name="includePortal" value={includePortal ? '1' : '0'} />
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

        {/* Recipient Selection */}
        <section className="brief-crew-section">
          <div className="brief-crew-section-head">
            <div>
              <span className="brief-crew-section-title">Crew Recipients</span>
              <span className="brief-crew-section-meta">
                ({selectedWithPhone.length} of {selectedMemberIds.size} ready for SMS)
              </span>
            </div>
            {crew.length > 1 ? (
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

          {crew.length > 0 ? (
            <div className="brief-crew-roster" role="group" aria-label="Crew members to receive briefing">
              {crew.map((member) => {
                const isSelected = selectedMemberIds.has(member.id);
                const hasValidPhone = Boolean(normalizeUsPhone(member.phone || ''));
                const memberStops = getMemberStops(member.id);

                return (
                  <label
                    key={member.id}
                    className={`brief-crew-card ${isSelected ? 'is-selected' : ''} ${!hasValidPhone ? 'has-warning' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMember(member.id)}
                      className="brief-crew-checkbox"
                    />
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
                        ) : (
                          <span className="brief-crew-phone-missing">
                            <span className="phone-indicator warn">!</span> No mobile phone on file (SMS disabled)
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
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
        </section>

        {/* Custom Dispatch Notes */}
        <section className="brief-crew-section">
          <label className="brief-crew-field">
            <span className="brief-crew-section-title">Daily Notes & Instructions (Optional)</span>
            <span className="brief-crew-section-desc">
              Add gate codes, weather warnings, or priority instructions to include in the dispatch.
            </span>
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

        {/* Field Portal Link Option */}
        <section className="brief-crew-section compact">
          <label className="brief-crew-checkbox-label">
            <input
              type="checkbox"
              checked={includePortal}
              onChange={(e) => setIncludePortal(e.target.checked)}
            />
            <span>Include Field App navigation link ({portalUrl})</span>
          </label>
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

          <div className="brief-crew-sms-preview-bubble">
            <div className="brief-crew-sms-meta">
              <span>To: {currentPreviewMember.name} {currentPreviewMember.phone ? `(${displayPhone(currentPreviewMember.phone)})` : ''}</span>
              <span>{charCount} chars · ~{segmentCount} segment{segmentCount === 1 ? '' : 's'}</span>
            </div>
            <pre className="brief-crew-sms-body">{previewSms}</pre>
          </div>
        </section>

        {/* Modal Footer Actions */}
        <div className="brief-crew-footer">
          <div className="brief-crew-footer-status">
            {selectedWithPhone.length === 0 ? (
              <span className="brief-footer-warn">
                ⚠️ Select at least one crew member with a phone number to send SMS.
              </span>
            ) : (
              <span className="brief-footer-ready">
                Ready to dispatch SMS to {selectedWithPhone.length} crew {selectedWithPhone.length === 1 ? 'member' : 'members'}.
              </span>
            )}
          </div>

          <div className="brief-crew-footer-buttons">
            <SaveButton
              className="btn primary brief-send-btn"
              pendingLabel="Dispatching SMS…"
              savedLabel="Dispatched ✓"
              disabled={selectedWithPhone.length === 0}
              title={
                selectedWithPhone.length === 0
                  ? 'No selected crew members have phone numbers configured'
                  : `Send morning SMS dispatch to ${selectedWithPhone.length} crew member${selectedWithPhone.length === 1 ? '' : 's'}`
              }
            >
              📲 Send Morning Dispatch SMS ({selectedWithPhone.length})
            </SaveButton>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
