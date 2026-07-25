import Link from 'next/link';

// Field-app top bar: business + crew name, with a back link on detail pages and
// a native sign-out (POST to the shared /auth/signout route).
export default function FieldHeader({
  businessName,
  crewName,
  backHref,
}: {
  businessName: string;
  crewName: string;
  backHref?: string;
}) {
  return (
    <header className="field-header">
      {backHref ? (
        <Link href={backHref} className="field-back" aria-label="Back to my jobs">‹ Jobs</Link>
      ) : (
        <div className="field-header-id">
          <span className="field-brand">{businessName}</span>
          <span className="field-crew">{crewName}</span>
        </div>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="field-signout">Sign out</button>
      </form>
    </header>
  );
}
