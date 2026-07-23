import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import { expireStaleLeads, formatDuration, formatElapsedTime, formatLeadSource, getAverageRequestResponseMs, getLeadTriage, isLeadSnoozed, LEAD_FLAG_LABELS, listLeads, type Lead, type LeadStatus } from '@/lib/leads';
import { archiveLeadAction, createLeadAction, unsnoozeLeadAction } from './actions';
import SaveButton from '@/components/save-button';
import styles from './leads.module.css';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'New request' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'quoted', label: 'Quote sent' },
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];

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

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading"><p className="eyebrow">Pipeline</p><h2>Current leads</h2></div>
        <div className="actions" style={{ marginBottom: '1rem' }}>
          <Link href="/dashboard/leads?add=1#add-lead" className="btn primary">+ Add lead</Link>
        </div>
        {leads.length === 0 ? <p className="empty-state">No leads yet. Website requests will appear here — or <Link href="/dashboard/leads?add=1#add-lead">add a lead manually</Link>.</p> : (
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column.status);
              return <section className={`${styles.column} ${styles[`col_${column.status}`]}`} key={column.status}><header className={styles.columnHeader}><h2>{column.status === 'new' ? 'Needs response' : column.label}</h2><span>{columnLeads.length}</span></header><div className={styles.cards}>{columnLeads.map((lead) => {
                const isUrgent = lead.status === 'new' && lead.source === 'website_form';
                return (
                  <div className={styles.leadCardWrap} key={lead.id}>
                    <Link className={`${styles.leadCard}${isUrgent ? ` ${styles.urgentCard}` : ''}`} href={`/dashboard/leads/${lead.id}`}>
                      <div className={styles.cardTopline}><strong>{lead.name || 'Unnamed request'}</strong><span className={isUrgent ? styles.needsBadge : styles.statusBadge}>{responseLabel(lead)}</span></div>
                      {(() => {
                        const triage = getLeadTriage(lead);
                        const flagChips = triage.flags.filter((flag) => flag !== 'phone_verified').slice(0, 2);
                        if (!lead.triage && flagChips.length === 0) return null;
                        return (
                          <div className={styles.cardChips}>
                            {lead.triage && <span className={styles.scoreChip} data-score={triage.score}>{triage.score === 'hot' ? '🔥 Hot' : triage.score === 'low' ? 'Low' : 'Warm'}</span>}
                            {triage.contactPreference === 'text_only' && <span className={styles.textOnlyChip}>💬 Text only</span>}
                            {flagChips.map((flag) => <span className={styles.flagChip} key={flag}>{LEAD_FLAG_LABELS[flag] || flag}</span>)}
                          </div>
                        );
                      })()}
                      <p>{lead.project_type || lead.message || 'Project details not provided'}</p>
                      <div className={styles.cardMetaGrid}>
                        <span>{formatLeadSource(lead.source)}</span>
                        <span>Estimated hours: {lead.estimated_hours ? `${lead.estimated_hours} hrs` : 'Not set'}</span>
                        <time dateTime={lead.created_at}>Received {formatElapsedTime(lead.created_at)} ago</time>
                      </div>
                      {(lead.phone || lead.email) && <div className={styles.contactHint}>{lead.phone || lead.email}</div>}
                    </Link>
                    {lead.phone || lead.converted_job ? (
                      <div className={styles.cardActions}>
                        {lead.phone ? <a className={styles.callLink} href={`tel:${lead.phone}`} aria-label={`Call ${lead.name || 'lead'}`}>📞 Call</a> : null}
                        {lead.converted_job ? <Link className={styles.openJobLink} href={`/dashboard/jobs/${lead.converted_job}`}>Open job →</Link> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}{columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}</div></section>;
            })}
          </div>
        )}
      </section>

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
        <details id="add-lead" className="workspace-details" open={leads.length === 0 || searchParams.add === '1'}>
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