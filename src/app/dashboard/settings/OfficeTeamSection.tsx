'use client';

import { useState, useTransition } from 'react';

import type { OfficeTeam } from '@/lib/office-team';
import {
  OFFICE_CAPABILITIES_REQUIRING_DELIBERATION,
  officeCapabilitiesByBand,
} from '@/lib/office-permissions';
import {
  inviteOfficeUserAction,
  removeOfficeUserAction,
  revokeOfficeInvitationAction,
  updateOfficeMemberCapabilitiesAction,
} from './office-team-actions';

/**
 * The team list: who has office access, who has been asked, and how many seats.
 *
 * THE LINK IS SHOWN ONCE AND SAID TO BE SHOWN ONCE. The database holds only a
 * hash, so this is not a UI convention that could be relaxed later — it is the
 * only moment the token exists in a readable form anywhere. A screen that
 * displayed it casually, or let it scroll away without saying so, would produce
 * a support conversation nobody can resolve.
 *
 * Granular permissions can be assigned to each office user from the roster below.
 */

type SaveState = 'idle' | 'working' | 'error';

const PRESETS: Record<string, string[]> = {
  'Leads Only': ['leads.read', 'leads.write'],
  'Front Office': [
    'leads.read',
    'leads.write',
    'schedule.write',
    'jobs.read',
    'jobs.write',
    'messages.read',
    'messages.send',
    'clients.read',
    'clients.write',
  ],
  'Billing & Invoices': ['quotes.read', 'invoices.read', 'invoices.write', 'payments.read'],
  'All Operational': [
    'leads.read',
    'leads.write',
    'clients.read',
    'clients.write',
    'jobs.read',
    'jobs.write',
    'schedule.write',
    'messages.read',
    'messages.send',
    'quotes.read',
    'invoices.read',
    'payments.read',
    'crew.read',
  ],
};

export default function OfficeTeamSection({ team }: { team: OfficeTeam }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [, startWork] = useTransition();

  const bands = officeCapabilitiesByBand();

  const full = team.seatLimit !== null && team.seatsUsed >= team.seatLimit;

  function applyPreset(presetCaps: string[]) {
    setSelectedCaps(new Set(presetCaps));
  }

  function toggleCap(key: string) {
    setSelectedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleEditing(memberId: string, currentCaps: readonly string[]) {
    if (editingUserId === memberId) {
      setEditingUserId(null);
    } else {
      setEditingUserId(memberId);
      setSelectedCaps(new Set(currentCaps));
      setProblem(null);
    }
  }

  function savePermissions(userId: string) {
    setProblem(null);
    startWork(async () => {
      try {
        const result = await updateOfficeMemberCapabilitiesAction({
          targetUserId: userId,
          capabilities: Array.from(selectedCaps),
        });
        if (!result.ok) {
          setProblem(result.message);
          return;
        }
        setEditingUserId(null);
      } catch {
        setProblem('That permission change could not be saved. Try again in a moment.');
      }
    });
  }

  function invite() {
    const value = email.trim();
    if (!value) return;
    setState('working');
    setProblem(null);
    setIssued(null);
    setCopied(false);
    startWork(async () => {
      try {
        const result = await inviteOfficeUserAction({ email: value });
        // A refusal arrives as a VALUE. Thrown messages do not survive the
        // server boundary in production -- Next.js redacts them into a digest --
        // so 'That person is already on your team' only ever reached a dev
        // console. The catch below is for a genuinely unexpected failure.
        if (!result.ok) {
          setState('error');
          setProblem(result.message);
          return;
        }
        setIssued({ email: result.email, link: result.link, emailed: result.emailed });
        setEmail('');
        setState('idle');
      } catch {
        setState('error');
        setProblem('The invitation could not be sent. Try again in a moment.');
      }
    });
  }

  function remove(userId: string, who: string) {
    // A browser confirm rather than a modal: this removes somebody's access to a
    // business, and the one thing that must not happen is a misplaced click
    // doing it silently. A custom dialog would be prettier and is not the
    // difference between a mistake and a mistake nobody noticed.
    if (!window.confirm(`Remove office access for ${who}? They'll be signed out of this business.`)) return;
    setProblem(null);
    startWork(async () => {
      try {
        const result = await removeOfficeUserAction({ userId });
        if (!result.ok) setProblem(result.message);
      } catch {
        setProblem('That access could not be removed. Try again in a moment.');
      }
    });
  }

  function revoke(invitationId: string) {
    setProblem(null);
    startWork(async () => {
      try {
        const result = await revokeOfficeInvitationAction({ invitationId });
        if (!result.ok) setProblem(result.message);
      } catch {
        setProblem('That invitation could not be cancelled. Try again in a moment.');
      }
    });
  }

  return (
    <div className="office-team">
      {/* THIS PARAGRAPH SAID AN INVITATION GRANTED NOTHING.
          It granted read, write and DELETE on clients and jobs as well as leads,
          because RLS honours the capability table and the dashboard is not the
          boundary — the anon key ships to the browser, so an office user's own
          session token reaches PostgREST directly. Migration 20260823140000 took
          the clients and jobs capabilities back, because neither page works for
          an office user anyway. What is left is real, and is what this now
          describes. Say what the seat grants; do not round it to zero. */}
      <p className="office-team-state">
        An office user gets your <strong>leads board</strong>: they can see every lead,
        reply, triage and edit it. That is the whole of it by default — unless granted custom permissions below,
        they cannot open clients, jobs, invoices or payments, and they cannot see billing or settings.
      </p>

      <div className="office-team-seats">
        <strong>{team.seatsUsed}</strong>
        <span>
          {team.seatLimit === null
            ? 'people with office access'
            : `of ${team.seatLimit} ${team.seatLimit === 1 ? 'seat' : 'seats'} used`}
        </span>
        {/* Owners count toward the limit, which is what the database enforces.
            Saying so here stops the number looking off by one when it fills. */}
        <small>You count as one.</small>
      </div>

      <ul className="office-team-list">
        {team.members.map((member) => (
          <li key={member.membershipId}>
            <span>{member.email ?? 'Account with no email on file'}</span>
            <span className="office-team-role">{member.role === 'owner' ? 'Owner' : 'Office'}</span>
            {member.role === 'owner' ? (
              <span className="office-caps-tag">Full access</span>
            ) : (
              <span className="office-caps-tag">
                {member.capabilities.length === 0
                  ? 'No permissions'
                  : `${member.capabilities.length} ${member.capabilities.length === 1 ? 'permission' : 'permissions'}`}
              </span>
            )}
            {/* Owners get no button. The database refuses to remove one through
                this path anyway, and a control that always errors is worse than
                no control -- it invites the click and then explains. */}
            {member.role === 'office' ? (
              <>
                <button
                  type="button"
                  className="office-btn-perm"
                  onClick={() => toggleEditing(member.userId, member.capabilities)}
                >
                  {editingUserId === member.userId ? 'Close' : 'Permissions'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(member.userId, member.email ?? 'this person')}
                >
                  Remove
                </button>
              </>
            ) : null}

            {editingUserId === member.userId && member.role === 'office' ? (
              <div className="office-permissions-editor">
                <div className="office-perm-header">
                  <h4>Custom Permissions · {member.email ?? 'Office User'}</h4>
                  <div className="office-presets">
                    <span className="office-presets-label">Presets:</span>
                    {Object.entries(PRESETS).map(([name, pCaps]) => (
                      <button
                        key={name}
                        type="button"
                        className="office-preset-btn"
                        onClick={() => applyPreset(pCaps)}
                      >
                        {name}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="office-preset-btn"
                      onClick={() => setSelectedCaps(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="office-bands-grid">
                  {bands.map((band) => (
                    <div key={band.band} className="office-band-card">
                      <div className="office-band-title">{band.label}</div>
                      <div className="office-caps-list">
                        {band.capabilities.map((cap) => {
                          const isDeliberation = OFFICE_CAPABILITIES_REQUIRING_DELIBERATION.includes(cap.key);
                          const checked = selectedCaps.has(cap.key);
                          return (
                            <label key={cap.key} className="office-cap-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCap(cap.key)}
                              />
                              <div className="office-cap-content">
                                <div className="office-cap-label-row">
                                  <span className="office-cap-name">{cap.label}</span>
                                  {isDeliberation ? (
                                    <span className="office-deliberation-badge">⚠️ High Consequence</span>
                                  ) : null}
                                </div>
                                <span className="office-cap-desc">{cap.grants}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="office-perm-actions">
                  <button
                    type="button"
                    className="office-perm-cancel-btn"
                    onClick={() => setEditingUserId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="office-perm-save-btn"
                    onClick={() => savePermissions(member.userId)}
                  >
                    Save Permissions
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {team.invitations.length > 0 ? (
        <>
          <p className="office-team-subhead">Invited, not yet accepted</p>
          <ul className="office-team-list">
            {team.invitations.map((invitation) => (
              <li key={invitation.id}>
                <span>{invitation.email}</span>
                <span className="office-team-role" data-status={invitation.status}>
                  {invitation.status === 'expired' ? 'Expired' : 'Waiting'}
                </span>
                <button type="button" onClick={() => revoke(invitation.id)}>Cancel</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="office-team-invite">
        <label htmlFor="office-invite-email">Invite someone</label>
        <div className="office-team-invite-row">
          <input
            id="office-invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="bookkeeper@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={full}
          />
          <button type="button" onClick={invite} disabled={full || state === 'working' || !email.trim()}>
            {state === 'working' ? 'Creating…' : 'Create invite'}
          </button>
        </div>
        <small>
          {full
            ? 'Every seat on your plan is in use. Cancel an invitation or remove someone first.'
            : 'They sign in with this address. The invitation only works for it.'}
        </small>
      </div>

      {issued ? (
        <div className="office-team-link">
          {/* Which of these shows is decided by whether the send actually
              happened, not by whether one was attempted. The invitation is real
              either way, so the difference the owner needs is whether anybody
              has been told about it. */}
          <p>
            {issued.emailed ? (
              <>
                <strong>Invitation emailed to {issued.email}.</strong> Here is the same link in case
                it lands in spam, or you would rather send it yourself. It&apos;s shown once — we
                only keep a fingerprint of it, so it can&apos;t be looked up again.
              </>
            ) : (
              <>
                <strong>We couldn&apos;t email {issued.email}, so send them this link.</strong> The
                invitation itself is fine — only the message failed. It&apos;s shown once — we only
                keep a fingerprint of it, so it can&apos;t be looked up again. If it&apos;s lost,
                invite them again and this one stops working.
              </>
            )}
          </p>
          <code>{issued.link}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(issued.link).then(
                () => setCopied(true),
                () => setProblem('Couldn\'t copy — select the link and copy it by hand.'),
              );
            }}
          >
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      {problem ? <p className="office-team-problem">{problem}</p> : null}
    </div>
  );
}
