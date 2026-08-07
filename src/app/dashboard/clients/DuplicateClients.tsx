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
}: {
  groups: DuplicateGroup<DuplicateMember>[];
  action?: (formData: FormData) => Promise<void>;
}) {
  if (groups.length === 0) return null;

  const total = groups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <section className="panel workspace-section-card dupe-panel">
      <details className="workspace-details">
        <summary className="workspace-details-summary">
          <span className="btn secondary">Possible duplicates · {groups.length}</span>
          <span className="workspace-details-copy">
            {total} records look like {groups.length} customer{groups.length === 1 ? '' : 's'}. Nothing
            merges until you say so.
          </span>
        </summary>

        <div className="dupe-groups">
          {groups.map((group) => (
            <DuplicateGroupForm
              key={group.key}
              members={group.members}
              suggestedId={suggestSurvivor(group.members).id}
              reasonLabel={DUPLICATE_REASON_LABEL[group.reason]}
              sharedValue={group.sharedValue}
              action={action}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
