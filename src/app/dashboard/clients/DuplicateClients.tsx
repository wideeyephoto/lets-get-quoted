import { DUPLICATE_REASON_LABEL, suggestSurvivor, type DuplicateGroup } from '@/lib/client-duplicates';
import DuplicateGroupForm, { type DuplicateMember } from './DuplicateGroupForm';

/**
 * The same customer, entered twice — and the one action that fixes it.
 *
 * WHY A PANEL AND NOT A BADGE ON EACH ROW. A duplicate is not a property of one
 * record, it is a relationship between two. Marking both rows "possible
 * duplicate" reports the problem twice and gives you nowhere to resolve it; the
 * pair has to be side by side, because choosing which one survives means
 * comparing them.
 *
 * WHY COLLAPSED, ABOVE THE LIST. Everything here is a suggestion, and
 * suggestions do not get to push the customer book down the page. Nothing
 * renders at all when the book is clean, which is the normal state.
 */
export default function DuplicateClients({
  groups,
  action,
  dismissAction,
  dismissError = false,
  onClose,
}: {
  groups: DuplicateGroup<DuplicateMember>[];
  action?: (formData: FormData) => Promise<void>;
  /** The dismissal could not be stored. See dismissDuplicateGroupAction. */
  dismissError?: boolean;
  /**
   * The other answer, and the one this panel had no way to give. A landlord and
   * their tenant on one phone number is correctly grouped and permanently
   * wrong — see dismissDuplicateGroupAction.
   */
  dismissAction?: (formData: FormData) => Promise<void>;
  onClose?: () => void;
}) {
  if (groups.length === 0) return null;

  const total = groups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <section className="panel workspace-section-card dupe-panel" aria-label="Possible duplicate customers">
      <div className="dupe-panel-head">
        <div className="dupe-panel-title-wrap">
          <span className="btn dupe-badge is-active">Possible duplicates · {groups.length}</span>
          <p className="dupe-panel-copy">
            {total} records look like {groups.length} customer{groups.length === 1 ? '' : 's'}. Nothing
            merges until you say so, and anything that isn&rsquo;t a duplicate can be dismissed.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="dupe-panel-close"
            onClick={onClose}
            aria-label="Close duplicate suggestions"
            title="Close duplicate suggestions"
          >
            &times;
          </button>
        ) : null}
      </div>

      {dismissError ? (
        <p className="dupe-dismiss-error">
          <strong>That dismissal wasn&rsquo;t saved.</strong> The table it lives in hasn&rsquo;t been created yet — apply{' '}
          <code>migrations/2026-08-16-duplicate-dismissals.sql</code> and try again. Both records are untouched.
        </p>
      ) : null}

      <div className="dupe-groups">
        {groups.map((group) => (
          <DuplicateGroupForm
            key={group.key}
            members={group.members}
            suggestedId={suggestSurvivor(group.members).id}
            reasonLabel={DUPLICATE_REASON_LABEL[group.reason]}
            sharedValue={group.sharedValue}
            reason={group.reason}
            action={action}
            dismissAction={dismissAction}
          />
        ))}
      </div>
    </section>
  );
}
