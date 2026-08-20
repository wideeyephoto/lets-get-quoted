'use client';

import { useState, useTransition } from 'react';

import type { OfficeTeam } from '@/lib/office-team';
import { inviteOfficeUserAction, revokeOfficeInvitationAction } from './office-team-actions';

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
  const [issued, setIssued] = useState<{ email: string; link: string } | null>(null);
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
        setIssued({ email: result.email, link: result.link });
        setEmail('');
        setState('idle');
      } catch (error) {
        setState('error');
        setProblem(error instanceof Error ? error.message : 'The invitation could not be sent.');
      }
    });
  }

  function revoke(invitationId: string) {
    setProblem(null);
    startWork(async () => {
      try {
        await revokeOfficeInvitationAction({ invitationId });
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'That invitation could not be cancelled.');
      }
    });
  }

  return (
    <div className="office-team">
      <p className="office-team-state">
        Office users can be invited and will be connected to your business.{' '}
        <strong>They can&apos;t open anything yet</strong> — what they&apos;re allowed to see is
        still being built, so for now an invitation connects an account and nothing more.
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
          <p>
            <strong>Send this link to {issued.email}.</strong> It&apos;s shown once — we only keep a
            fingerprint of it, so it can&apos;t be looked up again. If it&apos;s lost, invite them
            again and this one stops working.
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
