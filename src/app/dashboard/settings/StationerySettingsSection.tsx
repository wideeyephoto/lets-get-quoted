import Link from 'next/link';

export default function StationerySettingsSection() {
  return (
    <section className="panel workspace-section-card" id="stationery">
      <div className="section-heading workspace-section-heading compact-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📇</span>
          <p className="eyebrow" style={{ margin: 0 }}>Print &amp; Branding Studio</p>
        </div>
        <h2>Cards &amp; carbonless work orders</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Design and order heavy 16pt commercial business cards and 2-part carbonless NCR work order pads printed with your
        verified company branding, trade license, and contact details.
      </p>
      <div className="workspace-inline-row">
        <Link href="/dashboard/merchandise" className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
          <span>🎨</span> Open print design studio &rarr;
        </Link>
      </div>
    </section>
  );
}
