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
  action,
}: {
  members: DuplicateMember[];
  suggestedId: string;
  reasonLabel: string;
  sharedValue: string;
  /** Absent on the demo, where nothing may write. */
  action?: (formData: FormData) => Promise<void>;
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
        if (!action || !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
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
        <SaveButton className="btn secondary" pendingLabel="Merging…" savedLabel="Merged ✓">
          Merge into the selected record
        </SaveButton>
      ) : (
        <span className="dupe-demo-note">Merging is disabled in the demo.</span>
      )}
    </form>
  );
}
