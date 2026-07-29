import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import { expireStaleLeads, formatDuration, formatElapsedTime, formatLeadSource, getAverageRequestResponseMs, getLeadTriage, isLeadSnoozed, LEAD_FLAG_LABELS, LEADS_VIEW_COOKIE, listLeads, normalizeLeadsView, type Lead } from '@/lib/leads';
import { archiveLeadAction, createLeadAction, unsnoozeLeadAction } from './actions';
import { shouldAutoOpenCreate } from '@/lib/nav-helpers';
import SaveButton from '@/components/save-button';
import MapSection from '@/components/map-section';
import { getMapPins } from '@/lib/map-pins';
import LeadsWorkspace, { type LeadViewItem } from './LeadsWorkspace';
import styles from './leads.module.css';

function responseLabel(lead: Lead) {
  if (lead.status === 'new' && lead.source === 'website_form') return 'Needs response';
  if (lead.status === 'new') return 'New request';
  if (lead.status === 'contacted') return 'Contacted';
  if (lead.status === 'quoted') return 'Quote sent';
  if (lead.status === 'won') return 'Won';
  return 'Lost';
}

export default async function LeadsPage({ searchParams }: { searchParams: { add?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  await expireStaleLeads(supabase, accountId);
  const allLeads = await listLeads(supabase, accountId);

  // Snoozed/archived leads collapse into "Set aside" below the board; the
  // board itself sorts each column Hot → Warm → Low so junk sinks.
  const SCORE_ORDER = { hot: 0, warm: 1, low: 2 } as const;
  const triaged = allLeads.map((lead) => ({ lead, triage: getLeadTriage(lead) }));
  const setAside = triaged.filter(({ lead, triage }) => !['won', 'lost'].includes(lead.status) && (triage.archived || isLeadSnoozed(triage)));
  const setAsideIds = new Set(setAside.map(({ lead }) => lead.id));
  const leads = triaged
    .filter(({ lead }) => !setAsideIds.has(lead.id))
    .sort((a, b) => SCORE_ORDER[a.triage.score] - SCORE_ORDER[b.triage.score])
    .map(({ lead }) => lead);

  const websiteRequests = allLeads.filter((lead) => lead.source === 'website_form').length;
  const openRequests = allLeads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const needsResponse = leads.filter((lead) => lead.status === 'new' && lead.source === 'website_form').length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(allLeads));
  const mapPins = await getMapPins(supabase, accountId);

  // Serialize the active leads into a display-ready shape for the client view
  // switcher (Board / Priority inbox / Table / Split), so it never has to import
  // the server-only leads module.
  const initialView = normalizeLeadsView(cookies().get(LEADS_VIEW_COOKIE)?.value);
  const viewLeads: LeadViewItem[] = leads.map((lead) => {
    const triage = getLeadTriage(lead);
    const estimate = triage.estimate ?? null;
    return {
      id: lead.id,
      name: lead.name || 'Unnamed request',
      status: lead.status,
      statusLabel: responseLabel(lead),
      sourceLabel: formatLeadSource(lead.source),
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      detail: lead.project_type || lead.message || 'Project details not provided',
      estimatedHours: lead.estimated_hours,
      createdAt: lead.created_at,
      ageLabel: formatElapsedTime(lead.created_at),
      convertedJob: lead.converted_job,
      score: triage.score,
      hasTriage: Boolean(lead.triage),
      scoreLabel: triage.score === 'hot' ? '🔥 Hot' : triage.score === 'low' ? 'Low' : 'Warm',
      flags: triage.flags.filter((flag) => flag !== 'phone_verified').map((key) => ({ key, label: LEAD_FLAG_LABELS[key] || key })),
      textOnly: triage.contactPreference === 'text_only',
      estimate,
      estimateLabel: estimate ? `$${estimate.min.toLocaleString('en-US')}–$${estimate.max.toLocaleString('en-US')}` : null,
      timeline: triage.timeline ?? null,
      location: triage.location ?? null,
      contactLog: triage.contactLog ?? [],
      isUrgent: lead.status === 'new' && lead.source === 'website_form',
    };
  });

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading"><p className="eyebrow">Pipeline</p><h2>Current leads</h2></div>
        <div className="actions" style={{ marginBottom: '1rem' }}>
          <Link href="/dashboard/leads?add=1#add-lead" className="btn primary">+ Add lead</Link>
        </div>
        {leads.length === 0 ? <p className="empty-state">No leads yet. Website requests will appear here — or <Link href="/dashboard/leads?add=1#add-lead">add a lead manually</Link>.</p> : (
          <LeadsWorkspace leads={viewLeads} initialView={initialView} />
        )}
      </section>

      <MapSection pins={mapPins} subtitle="Orange pins need a response; gold need scheduling; green are already on the calendar." />


      {setAside.length > 0 && (
        <section className="panel workspace-section-card">
          <details className="workspace-details">
            <summary className="workspace-details-summary">
              <span className="btn secondary">Set aside ({setAside.length})</span>
              <span className="workspace-details-copy">Snoozed and archived leads — out of the way, never lost.</span>
            </summary>
            <div className={styles.setAsideList}>
              {setAside.map(({ lead, triage }) => (
                <div className={styles.setAsideRow} key={lead.id}>
                  <Link href={`/dashboard/leads/${lead.id}`} className={styles.setAsideName}>{lead.name || 'Unnamed request'}</Link>
                  <span className={styles.setAsideWhy}>
                    {triage.archived ? 'Archived' : `Snoozed until ${new Date(triage.snoozedUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {triage.declinedReason ? ' · declined' : ''}
                  </span>
                  {triage.archived ? (
                    <form action={archiveLeadAction.bind(null, lead.id, false)}><button type="submit" className="btn ghost">Restore</button></form>
                  ) : (
                    <form action={unsnoozeLeadAction.bind(null, lead.id)}><button type="submit" className="btn ghost">Wake up</button></form>
                  )}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <div className={`stat-ticker panel ${styles.requestStats}`}>
        <div className={styles.urgentStat}>
          <span className="stat-ticker-value">{needsResponse}</span>
          <span className="stat-ticker-label">Needs response</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{websiteRequests}</span>
          <span className="stat-ticker-label">Website requests</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{openRequests}</span>
          <span className="stat-ticker-label">Open requests</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{averageResponse}</span>
          <span className="stat-ticker-label">Avg response time</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{leads.filter((lead) => lead.status === 'won').length}</span>
          <span className="stat-ticker-label">Won</span>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <details id="add-lead" className="workspace-details" open={shouldAutoOpenCreate(leads.length, searchParams.add)}>
          <summary className="workspace-details-summary">
            <span className="btn primary">+ Add manual lead</span>
            <span className="workspace-details-copy">Log a lead that came in by phone, in person, or referral.</span>
          </summary>
          <form action={createLeadAction} className="form-grid">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="Sarah Whitfield" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" placeholder="(248) 555-0117" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="sarah@example.com" />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <AddressAutocomplete id="address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
            </div>
            <div className="field full">
              <label htmlFor="projectType">Project type</label>
              <input id="projectType" name="projectType" placeholder="Roof replacement" />
            </div>
            <div className="field">
              <label htmlFor="estimatedHours">Estimated hours</label>
              <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" placeholder="16" />
            </div>
            <div className="field full">
              <label htmlFor="message">Notes</label>
              <textarea id="message" name="message" placeholder="Details from the call or conversation..." />
            </div>
            <div className="field full">
              <label htmlFor="photos">Photos</label>
              <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
            </div>
            <div className="field full">
              <SaveButton>Add lead</SaveButton>
            </div>
          </form>
        </details>
      </section>
    </main>
  );
}