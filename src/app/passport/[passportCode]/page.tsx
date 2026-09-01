import { createAdminClient } from '@/lib/auth';
import { getPropertyPassportByCode } from '@/lib/property-passport-data';
import { shapeContractorBrand, CONTRACTOR_BRAND_COLUMNS } from '@/lib/contractor-brand';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Property & Equipment Passport · Let’s Get Quoted', robots: { index: false, follow: false } };

export default async function PropertyPassportPage({
  params: paramsPromise,
}: {
  params: Promise<{ passportCode: string }>;
}) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const passport = await getPropertyPassportByCode(admin, params.passportCode);

  if (!passport) {
    return (
      <main className="wide-shell workspace-shell payment-shell" style={{ maxWidth: '680px', margin: '4rem auto', padding: '1rem' }}>
        <section className="panel workspace-hero-solo" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.8rem' }}>🏷️</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem' }}>Passport Not Found</h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '440px', margin: '0 auto 1.5rem' }}>
            Passport code <code>{params.passportCode}</code> is not registered yet or has been updated. Check with your service contractor.
          </p>
          <Link href="/" className="btn secondary">Return Home</Link>
        </section>
      </main>
    );
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', passport.accountId).maybeSingle(),
    admin.from('sites').select(CONTRACTOR_BRAND_COLUMNS).eq('account_id', passport.accountId).maybeSingle(),
  ]);

  const brand = shapeContractorBrand(account, site);
  const health = passport.healthScore;

  return (
    <>
      <ContractorBrandBar brand={brand} context="Property Passport" />
      <main className="wide-shell workspace-shell payment-shell" style={{ maxWidth: '820px', margin: '1.5rem auto', padding: '0 1rem 3rem' }}>
        {/* Passport Hero Banner */}
        <section className="panel workspace-section-card" style={{ borderTop: '4px solid #0284c7', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ display: 'inline-block', background: '#0f172a', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '4px', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Durable Home Passport
              </span>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>{passport.address}</h1>
              {passport.unitNumber ? <p style={{ margin: '0.2rem 0 0', color: '#64748b' }}>Unit {passport.unitNumber}</p> : null}
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#475569' }}>
                Maintained by <strong>{brand.businessName}</strong> · Passport ID: <code style={{ fontWeight: 700, color: '#0369a1' }}>{passport.passportCode}</code>
              </p>
            </div>

            {/* Health Score Pill */}
            <div style={{ background: health.score >= 85 ? '#ecfdf5' : health.score >= 70 ? '#eff6ff' : '#fffbeb', border: `1.5px solid ${health.score >= 85 ? '#10b981' : health.score >= 70 ? '#3b82f6' : '#f59e0b'}`, padding: '0.75rem 1.1rem', borderRadius: '10px', textAlign: 'center', minWidth: '130px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', display: 'block' }}>Mechanical Health</span>
              <strong style={{ fontSize: '1.5rem', color: health.score >= 85 ? '#065f46' : health.score >= 70 ? '#1e40af' : '#92400e' }}>
                {health.grade} ({health.score}/100)
              </strong>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155' }}>
              {health.summaryText}
            </p>
            {brand.phone ? (
              <a
                href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${brand.businessName}, I am scanning the property passport at ${passport.address} (${passport.passportCode}) and need service: `)}`}
                className="btn primary"
                style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}
              >
                🔧 Request Service
              </a>
            ) : null}
          </div>
        </section>

        {/* Registered Equipment & Systems */}
        <section className="panel workspace-section-card" style={{ marginTop: '1.25rem' }}>
          <div className="section-heading compact-heading">
            <p className="eyebrow">Equipment Registry</p>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Installed Mechanical Equipment</h2>
          </div>

          {passport.equipment.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>No equipment records added to this passport yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {passport.equipment.map((eq) => (
                <div
                  key={eq.id}
                  style={{
                    padding: '1.1rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{eq.name}</h3>
                      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontWeight: 700, textTransform: 'capitalize' }}>
                        {eq.condition}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                      {eq.brand ? <div>Brand: <strong>{eq.brand}</strong></div> : null}
                      {eq.modelNumber ? <div>Model: <code style={{ fontSize: '0.82rem' }}>{eq.modelNumber}</code></div> : null}
                      {eq.serialNumber ? <div>Serial: <code style={{ fontSize: '0.82rem' }}>{eq.serialNumber}</code></div> : null}
                      {eq.location ? <div>Location: {eq.location}</div> : null}

                      {eq.specs?.filterSize ? (
                        <div style={{ marginTop: '0.4rem', padding: '0.35rem 0.6rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', color: '#0369a1', fontWeight: 700 }}>
                          🔍 Exact Filter Spec: {eq.specs.filterSize}
                        </div>
                      ) : null}

                      {eq.specs?.refrigerantType ? (
                        <div style={{ marginTop: '0.2rem', color: '#64748b' }}>
                          Refrigerant: <strong>{eq.specs.refrigerantType}</strong>
                        </div>
                      ) : null}

                      <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#64748b' }}>
                        Installed: {eq.installedOn} (approx. {eq.estimatedAgeYears} yrs old of {eq.expectedLifespanYears} yr lifespan)
                      </div>
                    </div>
                  </div>

                  {brand.phone ? (
                    <div style={{ paddingTop: '0.6rem', borderTop: '1px solid #f1f5f9' }}>
                      <a
                        href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${brand.businessName}, I would like to schedule a tune-up/filter change for my ${eq.name} at ${passport.address}.`)}`}
                        className="btn secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', width: '100%', textAlign: 'center' }}
                      >
                        📅 Book Maintenance for this Unit
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Maintenance Ledger */}
        {passport.ledger.length > 0 ? (
          <section className="panel workspace-section-card" style={{ marginTop: '1.25rem' }}>
            <div className="section-heading compact-heading">
              <p className="eyebrow">Service History</p>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Durable Maintenance Ledger</h2>
            </div>
            <ul className="portal-job-list portal-history" style={{ marginTop: '0.75rem' }}>
              {passport.ledger.map((entry) => (
                <li key={entry.id} className="portal-job" style={{ borderLeft: '3px solid #0284c7' }}>
                  <div className="portal-job-main">
                    <strong style={{ fontSize: '0.92rem' }}>{entry.title}</strong>
                    <span className="portal-job-meta">
                      {entry.date} · Performed by {entry.performedBy}
                      {entry.invoiceRef ? ` · Ref ${entry.invoiceRef}` : ''}
                    </span>
                    {entry.summary ? <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#475569' }}>{entry.summary}</p> : null}
                  </div>
                  {entry.cost ? <span className="portal-job-amount">${entry.cost.toFixed(2)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Homeowner Transfer Notice */}
        <section className="panel workspace-section-card" style={{ marginTop: '1.25rem', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.4rem' }}>🏡</span>
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>Transferable Property Asset</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.45 }}>
                When this property is sold, this durable passport record and all equipment warranties transfer with the home to provide the next owner with a complete verified service history.
              </p>
            </div>
          </div>
        </section>

        <ContractorBrandFoot businessName={brand.businessName} />
      </main>
    </>
  );
}
