import type { ReactNode } from 'react';

// A workspace panel that starts folded, showing only its name and a one-line
// state summary. Used where a page carries several setup surfaces that a
// contractor configures once and then rarely revisits — leaving them all
// expanded turns the page into a wall of forms you have to scroll past to reach
// the thing you actually came for.
//
// Native <details> on purpose: it works in a server component, survives with
// JavaScript disabled, and gets find-in-page and keyboard behavior for free.
// Passing the same `group` to several panels makes them mutually exclusive, so
// opening one folds its neighbours.
export default function WorkspaceDisclosure({
  eyebrow,
  title,
  summary,
  status,
  statusTone = 'neutral',
  id,
  group,
  defaultOpen = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  /** One line describing the current setting, readable while folded. */
  summary?: ReactNode;
  /** Short state pill — "On", "3 days", "Not set". */
  status?: string;
  statusTone?: 'neutral' | 'on' | 'warn';
  id?: string;
  group?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="workspace-disclosure" id={id} name={group} open={defaultOpen}>
      <summary className="workspace-disclosure-head">
        <span className="workspace-disclosure-copy">
          {eyebrow && <span className="workspace-disclosure-eyebrow">{eyebrow}</span>}
          <span className="workspace-disclosure-title">
            {title}
            {status && (
              <span className={`workspace-disclosure-pill tone-${statusTone}`}>{status}</span>
            )}
          </span>
          {summary && <span className="workspace-disclosure-summary">{summary}</span>}
        </span>
        <span className="workspace-disclosure-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="workspace-disclosure-body">{children}</div>
    </details>
  );
}
