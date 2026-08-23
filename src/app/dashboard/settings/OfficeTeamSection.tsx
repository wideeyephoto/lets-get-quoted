'use client';

import { useState, useTransition } from 'react';

import type { OfficeTeam } from '@/lib/office-team';
import {
  inviteOfficeUserAction,
  removeOfficeUserAction,
  revokeOfficeInvitationAction,
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
 * NOBODY HAS ANY PERMISSIONS YET, and the card says that rather than implying a
 * working feature. Inviting somebody today connects their account and gives them
 * nothing to do, which is a strange thing to let an owner discover afterwards.
 */

type SaveState = 'idle' | 'working' | 'error';

export default function OfficeTeamSection({ team }: { team: OfficeTeam }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startWork] = useTransition();

  const full = team.seatLimit !== null && team.seatsUsed >= team.seatLimit;

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
        reply, triage and edit it. That is the whole of it for now — they cannot open
        clients, jobs, invoices or payments, and they cannot see billing or settings.
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
            {/* Owners get no button. The database refuses to remove one through
                this path anyway, and a control that always errors is worse than
                no control -- it invites the click and then explains. */}
            {member.role === 'office' ? (
              <button
                type="button"
                onClick={() => remove(member.userId, member.email ?? 'this person')}
              >
                Remove
              </button>
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
