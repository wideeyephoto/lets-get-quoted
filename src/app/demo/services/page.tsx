import Link from 'next/link';
import type { Service } from '@/lib/services';
import { formatUnitPrice, glyphsForServices, priceBookStats, unitSuffix } from '@/lib/price-book';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import PriceBookStats from '@/components/price-book-stats';

export const dynamic = 'force-dynamic';

function demoService(
  id: string,
  name: string,
  unit_price: number,
  unit: string,
  description: string | null,
  sort_order: number,
): Service {
  return {
    id,
    account_id: 'demo',
    name,
    description,
    unit_price,
    unit,
    active: true,
    sort_order,
    created_at: '2026-03-01T12:00:00.000Z',
    updated_at: '2026-03-01T12:00:00.000Z',
  };
}

const DEMO_SERVICES: Service[] = [
  demoService('svc-1', 'Weekly mowing', 45, 'visit', 'Mow, string-trim, edge, and blow down all hard surfaces.', 1),
  demoService('svc-2', 'Bi-weekly mowing', 55, 'visit', 'Every-other-week mow for lighter-growth lawns.', 2),
  demoService('svc-3', 'Spring cleanup', 350, 'job', 'Debris haul-off, bed cutback, first-cut mow, and edging.', 3),
  demoService('svc-4', 'Fall cleanup', 325, 'job', 'Full leaf removal, bed cleanout, and final-season mow.', 4),
  demoService('svc-5', 'Mulch install', 85, 'each', 'Premium double-shredded hardwood mulch, per cubic yard installed.', 5),
  demoService('svc-6', 'Sod install', 1.2, 'sqft', 'Grade, lay, and roll new sod. Priced per square foot.', 6),
  demoService('svc-7', 'Core aeration', 180, 'job', 'Relieve compaction and boost root growth across the lawn.', 7),
  demoService('svc-8', 'Bed maintenance', 65, 'visit', 'Weed, cultivate, and tidy planting beds each visit.', 8),
  demoService('svc-9', 'Paver patio', 18, 'sqft', 'Base prep and paver install. Priced per square foot.', 9),
  demoService('svc-10', 'Irrigation start-up', 120, 'job', 'Activate system, set zones, and check every head for spring.', 10),
  demoService('svc-11', 'Fertilization treatment', 75, 'visit', 'Season-appropriate granular feed with spot weed control.', 11),
];

export default function DemoServicesPage() {
  const services = DEMO_SERVICES;
  const active = services.filter((s) => s.active);
  const glyphs = glyphsForServices(services.map((s) => s.name));
  const stats = priceBookStats(active.map((s) => s.unit_price));

  return (
    <main className="wide-shell workspace-shell">
      <section className={`workspace-hero panel${stats ? '' : ' workspace-hero-solo'}`}>
        <div className="workspace-hero-copy">
          <p className="eyebrow">Price book</p>
          <h1 className="workspace-title">Your services &amp; prices</h1>
          <p className="workspace-lead">
            Save the services you sell once, and drop them into quotes and recurring plans with a tap — no more
            retyping prices. You can always tweak the amount per job.
          </p>
        </div>
        {stats ? <PriceBookStats stats={stats} /> : null}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Services{active.length > 0 ? ` · ${active.length} active` : ''}</p>
        </div>

        <div className="status-tabs workspace-status-tabs">
          <span className="status-tab active">Active ({active.length})</span>
          <span className="status-tab">Archived (0)</span>
        </div>

        <div className="service-list">
          {services.map((service, index) => (
            <div key={service.id} className="service-row">
              <div className="service-row-top">
                <span className="service-glyph"><ServiceIcon name={glyphs[index]} /></span>
                <div className="service-row-main">
                  <span className="service-price">
                    {formatUnitPrice(service.unit_price)}
                    {unitSuffix(service.unit) ? <span className="service-price-unit">{unitSuffix(service.unit)}</span> : null}
                  </span>
                  <strong className="service-name">{service.name}</strong>
                </div>
              </div>
              {service.description ? <p className="service-desc">{service.description}</p> : null}
              <div className="service-row-actions">
                <span className="btn secondary" aria-disabled="true">Edit</span>
                <button type="button" className="btn secondary" disabled>Archive</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>+ Add a service</h2>
        </div>
        <p className="workspace-card-copy">
          Build your own price book once, then reuse every service in quotes and recurring plans. This demo
          account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
