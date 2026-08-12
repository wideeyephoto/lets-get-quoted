'use client';

import SaveButton from '@/components/save-button';
import { formatPhoneDashes } from '@/lib/phone';

export type DuplicateMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  jobCount: number;
  /** Breaks the tie in suggestSurvivor when two records are equally complete. */
  created_at?: string;
};

/**
 * One proposed merge: the records side by side, and the choice of which stays.
 *
 * A client component because the confirm has to happen on SUBMIT rather than on
 * a button's own click — the radio that names the survivor and the hidden ids
 * of the rest all live in this form, so the button cannot own its own form the
 * way ConfirmActionButton does. Nesting forms is invalid HTML and the browser
 * silently drops the inner one, which would post a merge with no survivor.
 */
export default function DuplicateGroupForm({
  members,
  suggestedId,
  reasonLabel,
  sharedValue,
  reason,
  action,
  dismissAction,
}: {
  members: DuplicateMember[];
  suggestedId: string;
  reasonLabel: string;
  sharedValue: string;
  /** The rule that grouped them, stored with a dismissal for reading later. */
  reason?: string;
  /** Absent on the demo, where nothing may write. */
  action?: (formData: FormData) => Promise<void>;
  /** The other answer: not the same customer. Also absent on the demo. */
  dismissAction?: (formData: FormData) => Promise<void>;
}) {
  const others = members.length - 1;
  const confirmMessage =
    `Merge these ${members.length} records into the one you selected?\n\n` +
    `Their jobs, leads, recurring plans and Quick Stop requests all move across, and the ` +
    `other ${others} record${others === 1 ? '' : 's'} will be deleted.\n\nThis cannot be undone.`;

  return (
    <form
      action={action}
      className="dupe-group"
      onSubmit={(event) => {
        // The dismiss button is a second submit in this same form (it has to
        // be — the ids it needs are these hidden inputs, and nesting forms is
        // invalid HTML). It carries its own formAction and gets NO merge
        // confirm: dismissing deletes nothing.
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === 'dismiss') return;
        if (!action || !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      <div className="dupe-group-head">
        <strong>{reasonLabel}</strong>
        {sharedValue ? <span>{sharedValue}</span> : null}
      </div>

      <ul className="dupe-members">
        {members.map((member) => (
          <li key={member.id}>
            {/* The radio names the survivor; every id in the group also rides
                along as a hidden duplicateId. The action drops whichever
                duplicateId equals the survivor, so the two may overlap. */}
            <label className="dupe-member">
              <input
                type="radio"
                name="survivorId"
                value={member.id}
                defaultChecked={member.id === suggestedId}
                required
              />
              <span className="dupe-member-body">
                <strong>{member.name || 'Unnamed'}</strong>
                <small>
                  {[member.phone ? formatPhoneDashes(member.phone) : null, member.email, member.address]
                    .filter(Boolean)
                    .join(' · ') || 'No contact details'}
                </small>
                <small className="dupe-member-stats">
                  {member.jobCount} job{member.jobCount === 1 ? '' : 's'}
                </small>
              </span>
            </label>
            <input type="hidden" name="duplicateId" value={member.id} />
          </li>
        ))}
      </ul>

      {action ? (
        <div className="dupe-group-actions">
          <SaveButton className="btn secondary" pendingLabel="Merging…" savedLabel="Merged ✓">
            Merge into the selected record
          </SaveButton>
          {/* THE OTHER ANSWER, and the one this panel never had.
              A landlord and their tenant on one number, a father and son at one
              address — correctly grouped, permanently wrong, and back at the top
              of the customer book on every load. A suggestion you cannot decline
              stops being a suggestion; the panel gets collapsed and never opened
              again, and the real duplicates go unfound with it.

              formNoValidate because the survivor radio is `required` and this
              button has no interest in which record would have survived. */}
          {dismissAction ? (
            <SaveButton
              className="btn ghost"
              formAction={dismissAction}
              formNoValidate
              name="intent"
              value="dismiss"
              pendingLabel="Dismissing…"
              savedLabel="Dismissed ✓"
              title="Keeps both records exactly as they are and stops suggesting this pairing."
            >
              Not duplicates
            </SaveButton>
          ) : null}
        </div>
      ) : (
        <span className="dupe-demo-note">Merging is disabled in the demo.</span>
      )}
    </form>
  );
}
