import Link from 'next/link';

// The screen behind the screen.
//
// Precached at install (public/sw.js) and served only when a /field page is
// asked for with no network AND no cached copy of that particular page. It is
// deliberately static and deliberately unauthenticated: a page that needs a
// session to render is a page that cannot render when there is no network to
// check the session against, which would make it useless in the one situation
// it exists for.
//
// No apology, no spinner. It says which of their work is safe, because the
// question somebody actually has standing in a dead spot is "did I just lose
// the hours I logged".

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Offline · Field app' };

export default function FieldOfflinePage() {
  return (
    <main className="field-main field-offline">
      <h1 className="field-greeting">No signal 📡</h1>
      <p className="field-offline-lead">
        This screen hasn&apos;t been opened on this phone yet, so there&apos;s no saved copy to show you.
      </p>

      <section className="field-block">
        <h2 className="field-block-title">What&apos;s still safe</h2>
        <ul className="field-offline-list">
          <li>Jobs you&apos;ve already opened today, with their scope, address and checklist.</li>
          <li>Anything you clocked, noted or logged while offline — it&apos;s held on this phone and sends itself the
              moment you get a bar back.</li>
        </ul>
      </section>

      <p className="field-offline-hint">
        Try again once you&apos;re moving, or head back to today&apos;s route.
      </p>

      <Link href="/field" className="btn primary">Back to my jobs</Link>
    </main>
  );
}
