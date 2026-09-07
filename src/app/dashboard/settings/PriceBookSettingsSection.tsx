import Link from 'next/link';

export default function PriceBookSettingsSection() {
  return (
    <section className="panel workspace-section-card" id="price-book">
      <div className="section-heading workspace-section-heading compact-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📖</span>
          <p className="eyebrow" style={{ margin: 0 }}>Catalog &amp; Pricing</p>
        </div>
        <h2>Price book &amp; standard services</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Save the services and flat rates you sell once, and drop them into quotes and recurring plans with a single tap.
        You can also scan printed rate sheets or import vendor catalogs via OCR.
      </p>
      <div className="workspace-inline-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/dashboard/services" className="btn primary">
          Manage services &amp; prices &rarr;
        </Link>
        <Link href="/dashboard/services/import" className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>📥</span> Import CSV or scan rate sheet
        </Link>
      </div>
    </section>
  );
}
