import Link from 'next/link';

// Field-app top bar: business + crew name, with a back link on detail pages and
// a native sign-out (POST to the shared /auth/signout route).
export default function FieldHeader({
  businessName,
  crewName,
  backHref,
  /**
   * This person is on more than one roster. The business name stops being
   * decoration and becomes the control that changes which one you're looking
   * at — rendered ONLY in that case, because a "switch" affordance on a screen
   * with nothing to switch to is a dead end wearing a button.
   */
  switchable = false,
}: {
  businessName: string;
  crewName: string;
  backHref?: string;
  switchable?: boolean;
}) {
  return (
    <header className="field-header">
      {backHref ? (
        <Link href={backHref} className="field-back" aria-label="Back to my jobs">‹ Jobs</Link>
      ) : (
        <div className="field-header-id">
          {switchable ? (
            <Link href="/field/choose" className="field-brand field-brand-switch">
              {businessName} <span aria-hidden="true">⇄</span>
              <span className="sr-only">Switch business</span>
            </Link>
          ) : (
            <span className="field-brand">{businessName}</span>
          )}
          <span className="field-crew">{crewName}</span>
        </div>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="field-signout">Sign out</button>
      </form>
    </header>
  );
}
