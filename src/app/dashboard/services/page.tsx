import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listServices, SERVICE_UNITS, type Service } from '@/lib/services';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { createServiceAction, updateServiceAction, setServiceActiveAction, deleteServiceAction } from './actions';

const UNIT_LABEL: Record<string, string> = { each: 'each', hour: '/hr', sqft: '/sqft', visit: '/visit', job: '/job' };

function priceLabel(service: Service): string {
  return `${formatMoney(service.unit_price)}${service.unit && service.unit !== 'each' ? ` ${UNIT_LABEL[service.unit] ?? service.unit}` : ''}`;
}

export default async function ServicesPage({ searchParams }: { searchParams: { status?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const services = await listServices(supabase, accountId);

  const active = services.filter((s) => s.active);
  const filter = searchParams.status === 'archived' ? 'archived' : 'active';
  const visible = services.filter((s) => (filter === 'archived' ? !s.active : s.active));

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Price book</p>
          <h1 className="workspace-title">Your services &amp; prices</h1>
          <p className="workspace-lead">
            Save the services you sell once, and drop them into quotes and recurring plans with a tap — no more
            retyping prices. You can always tweak the amount per job.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Services{active.length > 0 ? ` · ${active.length} active` : ''}</p>
        </div>

        {services.length > 0 ? (
          <div className="status-tabs workspace-status-tabs">
            <Link href="/dashboard/services" className={`status-tab${filter === 'active' ? ' active' : ''}`}>Active ({active.length})</Link>
            <Link href="/dashboard/services?status=archived" className={`status-tab${filter === 'archived' ? ' active' : ''}`}>Archived ({services.length - active.length})</Link>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="empty-state">
            {filter === 'archived' ? 'No archived services.' : 'No services yet. Add your first one below — say “Gutter cleaning · $180”.'}
          </p>
        ) : (
          <div className="service-list">
            {visible.map((service) => (
              <div key={service.id} className={`service-row${service.active ? '' : ' is-archived'}`}>
                <div className="service-row-main">
                  <div className="service-row-head">
                    <strong>{service.name}</strong>
                    <span className="service-price">{priceLabel(service)}</span>
                  </div>
                  {service.description ? <p className="service-desc">{service.description}</p> : null}
                </div>
                <div className="service-row-actions">
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
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="panel workspace-section-card workspace-details" open={services.length === 0}>
        <summary className="workspace-details-summary">
          <span className="btn primary">+ Add a service</span>
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
