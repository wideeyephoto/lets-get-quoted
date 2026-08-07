import type { CSSProperties } from 'react';

/**
 * The spam trap that sits in every public form.
 *
 * A bot fills in every input it can find; a person never sees this one, so
 * anything in it means the submission was automated. `src/app/api/public/leads`
 * checks it and returns a cheerful `{ ok: true }` without writing anything,
 * because telling a bot it was caught is how it learns to stop falling for the
 * trap.
 *
 * THE NAME IS DELIBERATE NONSENSE. It used to be `company`, which password
 * managers and browser autofill fill in unprompted — so real visitors were
 * being silently discarded as bots. `lgq_trap` matches nothing any autofill
 * heuristic looks for.
 *
 * HIDDEN INLINE, ON PURPOSE. This used to be a CSS-module class holding
 * `position: absolute; left: -9999px`, wrapped around the words "Leave this
 * empty" — and those words turned up on a live customer site. Off-screen
 * positioning only works while every ancestor cooperates: it needs a
 * containing block where you think it is, and no ancestor transform, and the
 * stylesheet to have loaded at all. When any of that fails, the trap stops
 * being a trap and becomes a form field instructing visitors not to fill it in.
 *
 * Inline styles cannot fail to load, and belt and braces:
 *
 *   - `opacity: 0` hides it even if the positioning is neutralised
 *   - `pointer-events: none` means a stray click can never focus it
 *   - `tabIndex={-1}` keeps it out of the keyboard order
 *   - `aria-hidden` keeps it out of the accessibility tree
 *   - there is no visible text left to leak
 *
 * A screen reader never announces it, a sighted visitor never sees it, and a
 * bot parsing the HTML still finds an input worth filling.
 */

export const HONEYPOT_FIELD = 'lgq_trap';

const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  opacity: 0,
  pointerEvents: 'none',
};

export function HoneypotField() {
  return (
    <div aria-hidden="true" style={HIDDEN}>
      <input
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
      />
    </div>
  );
}
