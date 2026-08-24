import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { listServices, SERVICE_UNITS, type Service } from '@/lib/services';
import { formatUnitPrice, glyphsForServices, priceBookStats, unitSuffix } from '@/lib/price-book';
import { listTradeStarterCatalogs } from '@/lib/trade-catalogs';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import PriceBookStats from '@/components/price-book-stats';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import {
  createServiceAction,
  updateServiceAction,
  setServiceActiveAction,
  deleteServiceAction,
  loadTradeStarterCatalogAction,
} from './actions';

export const metadata = { title: 'Price book' };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  const services = await listServices(supabase, accountId);
  const starterCatalogs = listTradeStarterCatalogs();

  const active = services.filter((s) => s.active);
  const filter = searchParams.status === 'archived' ? 'archived' : 'active';
  const query = (searchParams.q ?? '').trim().toLowerCase();

  const baseVisible = services.filter((s) => (filter === 'archived' ? !s.active : s.active));
  const visible = query
    ? baseVisible.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query))
      )
    : baseVisible;

  // Icons are resolved for the whole book at once so an unmatched service inherits
  // the trade its neighbours imply rather than a generic mark.
  const glyphs = glyphsForServices(visible.map((s) => s.name));
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
          <div className="workspace-inline-row" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Link href="/dashboard/services/import" className="btn secondary">
              📥 Import CSV / Excel file
            </Link>
          </div>
        </div>
        {stats ? <PriceBookStats stats={stats} /> : null}
      </section>

      {services.length === 0 ? (
        <section className="panel workspace-section-card starter-catalogs-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Quick Start</p>
            <h2>Load a 1-tap trade starter pack</h2>
          </div>
          <p className="workspace-lead" style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
            Start with industry-standard services, market rates, and healthy profit margins for your trade. You can customize every price and description anytime.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {starterCatalogs.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: '1.1rem',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: '10px',
                  background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.35rem' }}>{cat.icon}</span>
                    <strong style={{ fontSize: '1.05rem' }}>{cat.name}</strong>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', margin: 0, lineHeight: 1.4 }}>
                    {cat.description}
                  </p>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-muted, #64748b)' }}>
                    Includes {cat.items.length} pre-costed items
                  </small>
                </div>
                <form action={loadTradeStarterCatalogAction}>
                  <input type="hidden" name="tradeId" value={cat.id} />
                  <SaveButton pendingLabel="Loading…" savedLabel="Loaded ✓" className="btn primary">
                    Load {cat.name} Pack
                  </SaveButton>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Services{active.length > 0 ? ` · ${active.length} active` : ''}</p>
        </div>

        {services.length > 0 ? (
          <div className="status-tabs workspace-status-tabs">
            <Link href="/dashboard/services" className={`status-tab${filter === 'active' ? ' active' : ''}`}>
              Active ({active.length})
            </Link>
            <Link href="/dashboard/services?status=archived" className={`status-tab${filter === 'archived' ? ' active' : ''}`}>
              Archived ({services.length - active.length})
            </Link>
          </div>
        ) : null}

        {visible.length === 0 && services.length > 0 ? (
          <p className="empty-state">
            {query ? `No services matching “${query}”.` : filter === 'archived' ? 'No archived services.' : 'No active services.'}
          </p>
        ) : visible.length === 0 ? (
          <p className="empty-state">
            No services yet. Choose a starter pack above or add your first custom service below.
          </p>
        ) : (
          <div className="service-list">
            {visible.map((service, index) => (
              <div key={service.id} className={`service-row${service.active ? '' : ' is-archived'}`}>
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
                  {service.active ? (
                    <details className="service-edit workspace-details">
                      <summary className="workspace-details-summary">
                        <span className="btn secondary">Edit</span>
                      </summary>
                      <form action={updateServiceAction.bind(null, service.id)} className="service-form">
                        <ServiceFields prefix={`svc-${service.id}`} service={service} />
                        <SaveButton>Save service</SaveButton>
                      </form>
                    </details>
                  ) : null}
                  <form action={setServiceActiveAction.bind(null, service.id, !service.active)}>
                    <button type="submit" className="btn secondary">{service.active ? 'Archive' : 'Reactivate'}</button>
                  </form>
                  {!service.active ? (
                    <ConfirmActionButton
                      action={deleteServiceAction.bind(null, service.id)}
                      confirmMessage={`Delete “${service.name}” from your price book? This can't be undone.`}
                      className="linklike danger"
                      pendingLabel="Deleting…"
                      savedLabel="Deleted ✓"
                    >
                      Delete
                    </ConfirmActionButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {services.length > 0 ? (
        <details className="panel workspace-section-card workspace-details">
          <summary className="workspace-details-summary">
            <span className="btn secondary">⚡ Add Trade Starter Packs</span>
            <span className="workspace-details-copy">Add more pre-built trade services without overwriting existing ones.</span>
          </summary>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            {starterCatalogs.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: '8px',
                  background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <span>{cat.icon}</span>
                    <strong>{cat.name}</strong>
                  </div>
                  <small style={{ color: 'var(--text-muted, #64748b)' }}>{cat.items.length} items</small>
                </div>
                <form action={loadTradeStarterCatalogAction}>
                  <input type="hidden" name="tradeId" value={cat.id} />
                  <SaveButton pendingLabel="Loading…" savedLabel="Loaded ✓" className="btn secondary">
                    + Load {cat.name}
                  </SaveButton>
                </form>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details className="panel workspace-section-card workspace-details" open={services.length === 0}>
        <summary className="workspace-details-summary">
          <span className="btn primary">+ Add a custom service</span>
          <span className="workspace-details-copy">Reusable in quotes and recurring plans.</span>
        </summary>
        <form action={createServiceAction} className="service-form" style={{ marginTop: '1rem' }}>
          <ServiceFields prefix="new" />
          <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">Add service</SaveButton>
        </form>
      </details>
    </main>
  );
}

function ServiceFields({ prefix, service }: { prefix: string; service?: Service }) {
  return (
    <>
      <div className="service-form-grid">
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Service name</label>
          <input id={`${prefix}-name`} name="name" required defaultValue={service?.name ?? ''} placeholder="Gutter cleaning" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-price`}>Price</label>
          <input id={`${prefix}-price`} name="unitPrice" type="number" min="0" step="0.01" defaultValue={service?.unit_price ?? ''} placeholder="180" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-cost`}>Your cost</label>
          <input
            id={`${prefix}-cost`}
            name="unitCost"
            type="number"
            min="0"
            step="0.01"
            defaultValue={service?.unit_cost ?? ''}
            placeholder="Optional"
          />
          {/* Leaving it blank is a real answer. An un-costed line shows margin
              as "—" rather than as 100%, which is what a $0 cost would imply. */}
          <small className="field-hint">Materials and labour this line costs you. Leave blank if you don&apos;t know yet.</small>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-unit`}>Per</label>
          <select id={`${prefix}-unit`} name="unit" defaultValue={service?.unit ?? 'each'}>
            {SERVICE_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-desc`}>Description (optional)</label>
        <input id={`${prefix}-desc`} name="description" defaultValue={service?.description ?? ''} placeholder="Clear gutters + downspouts, bag debris" />
      </div>
    </>
  );
}
