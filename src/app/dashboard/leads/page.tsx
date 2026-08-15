import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import { expireStaleLeads, formatDuration, formatElapsedTime, formatLeadSource, getAverageRequestResponseMs, getLeadLostAfterDays, getLeadTriage, isLeadSnoozed, LEAD_FLAG_LABELS, LEAD_LOST_AFTER_CHOICES, LEAD_LOST_NEVER, leadLostAfterLabel, LEADS_VIEW_COOKIE, listLeads, normalizeLeadsView } from '@/lib/leads';
import { estimateRangeLabel, leadCityLabel, leadScoreLabel, leadStageLabel } from '@/lib/lead-detail-labels';
import { isSetAside, stageCounts, waitingFor } from '@/lib/lead-queue';
import { archiveLeadAction, createLeadAction, deleteLeadAction, setLeadLostAfterDaysAction, unsnoozeLeadAction } from './actions';
import DeleteLeadButton from './DeleteLeadButton';
import { shouldAutoOpenCreate } from '@/lib/nav-helpers';
import SaveButton from '@/components/save-button';
import { getMapPins } from '@/lib/map-pins';
import { MAP_THEME_COOKIE, mapViewCookie, normalizeMapTheme, normalizeMapView } from '@/lib/dashboard-views';
import LeadsWorkspace, { type LeadViewItem } from './LeadsWorkspace';
import styles from './leads.module.css';

export const metadata = { title: 'Leads' };


export default async function LeadsPage({ searchParams }: { searchParams: { add?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  // Read the window BEFORE expiring, and hand it over, so the number shown in
  // the selector is provably the one that just ran — not a second read that
  // could disagree with it.
  const leadLostAfterDays = await getLeadLostAfterDays(supabase, accountId);
  await expireStaleLeads(supabase, accountId, leadLostAfterDays);
  const allLeads = await listLeads(supabase, accountId);

  // One clock for the whole page. Called per lead it would drift across the
  // list, so two leads that arrived in the same minute could report different
  // waits — and a snooze expiring mid-render could land a lead in the board and
  // in the drawer at once.
  const now = new Date();

  // Snoozed/archived leads collapse into "Set aside" below the board; the
  // board itself sorts each column Hot → Warm → Low so junk sinks. The test for
  // "set aside" is the shared one from lib/lead-queue, which is the same one the
  // dashboard card, the rail badge and the alert banner now count with.
  const SCORE_ORDER = { hot: 0, warm: 1, low: 2 } as const;
  const triaged = allLeads.map((lead) => ({ lead, triage: getLeadTriage(lead) }));
  const setAside = triaged.filter(({ lead, triage }) => !['won', 'lost'].includes(lead.status) && isSetAside(triage, now));
  const setAsideIds = new Set(setAside.map(({ lead }) => lead.id));
  const leads = triaged
    .filter(({ lead }) => !setAsideIds.has(lead.id))
    .sort((a, b) => SCORE_ORDER[a.triage.score] - SCORE_ORDER[b.triage.score])
    .map(({ lead }) => lead);

  // Inventory, so it counts won and lost too — "how much has the website ever
  // brought in", not "what needs doing".
  const websiteRequests = allLeads.filter((lead) => lead.source === 'website_form').length;
  // Open work the owner can actually act on. Counted over `leads` rather than
  // every row, so a lead they archived or snoozed is not still sitting in the
  // total underneath a board that no longer shows it.
  const openRequests = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(allLeads));
  const mapView = normalizeMapView(cookies().get(mapViewCookie('leads'))?.value);
  const mapTheme = normalizeMapTheme(cookies().get(MAP_THEME_COOKIE)?.value);

  // Serialize the active leads into a display-ready shape for the client view
  // switcher (Smoothie / Focus / Board / Priority inbox / Table / Split), so it
  // never has to import the server-only leads module.
  const initialView = normalizeLeadsView(cookies().get(LEADS_VIEW_COOKIE)?.value);

  // Always fetched now that the map is a toolbar TOGGLE rather than a band
  // welded above one view. Opening it has to be instant and local — a round
  // trip to fetch pins would make a toggle feel like a navigation, and it is
  // one query on a page that already runs several.
  const mapPins = await getMapPins(supabase, accountId);

  const toViewItem = (lead: (typeof allLeads)[number]): LeadViewItem => {
    const triage = getLeadTriage(lead);
    const estimate = triage.estimate ?? null;
    return {
      id: lead.id,
      name: lead.name || 'Unnamed request',
      status: lead.status,
      statusLabel: leadStageLabel(lead.status),
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
      scoreLabel: leadScoreLabel(triage.score),
      flags: triage.flags.filter((flag) => flag !== 'phone_verified').map((key) => ({ key, label: LEAD_FLAG_LABELS[key] || key })),
      textOnly: triage.contactPreference === 'text_only',
      estimate,
      estimateLabel: estimateRangeLabel(estimate),
      timeline: triage.timeline ?? null,
      location: triage.location ?? null,
      city: leadCityLabel(lead.address, triage.location ?? null),
      contactLog: triage.contactLog ?? [],
      isUrgent: lead.status === 'new' && lead.source === 'website_form',
      projectType: lead.project_type,
      photoCount: (lead.photo_paths || []).length,
      // Null once the lead is won or lost — see waitingFor. Nobody is waiting
      // on a closed lead, and the clock used to keep running under a Won badge.
      waitingLong: waitingFor({ status: lead.status, createdAt: lead.created_at }, now)?.long ?? null,
      waitingShort: waitingFor({ status: lead.status, createdAt: lead.created_at }, now)?.short ?? null,
      // The last touchpoint, not the last UPDATE. updated_at moves when a score
      // is edited or a photo lands, so measuring "gone quiet" from it would
      // clear the flag on a lead nobody has actually spoken to.
      lastTouchAt: (triage.contactLog ?? []).at(-1)?.at ?? null,
      snoozedUntilLabel:
        triage.snoozedUntil && isLeadSnoozed(triage, now)
          ? new Date(triage.snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null,
    };
  };

  const viewLeads: LeadViewItem[] = leads.map(toViewItem);

  // The ticker's "Needs response" is now the SAME arithmetic as the Smoothie
  // stage chip that sits a few hundred pixels above it — one call, on the array
  // both of them render. They were two numbers under one label: this counted
  // website forms only while the chip counted every new lead, and non-website
  // new leads demonstrably exist (manual entry, missed calls).
  const stages = stageCounts(viewLeads);

  // Snoozed leads, kept apart from the open queue but no longer only reachable
  // through a drawer at the foot of the page. They are not work you are doing
  // today and they are not closed either, which is exactly what a "Snoozed"
  // group is for. Archived leads are NOT here — those were set aside on
  // purpose, and the drawer below is where they belong.
  const snoozedViewLeads: LeadViewItem[] = setAside
    .filter(({ triage }) => !triage.archived && isLeadSnoozed(triage, now))
    .map(({ lead }) => toViewItem(lead));

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        {/* The heading matches the nav item that got you here. It read "Work
            pipeline" under a rail item called "Leads", so the one page in the
            app whose job is to tell you where a request has got to could not
            agree with the link you clicked on what it was called. The eyebrow
            keeps the wider sense — this board does carry work past the lead
            stage — without the title contradicting the navigation. */}
        <div className="section-heading workspace-section-heading"><p className="eyebrow">Work pipeline</p><h1>Leads</h1></div>
        {leads.length === 0 ? <p className="empty-state">No leads yet. Website requests will appear here — or <Link href="/dashboard/leads?add=1#add-lead">add a lead manually</Link>.</p> : (
          <LeadsWorkspace leads={viewLeads} snoozedLeads={snoozedViewLeads} initialView={initialView} mapView={mapView} mapTheme={mapTheme} mapPins={mapPins} />
        )}
      </section>


      {/* Renders whether or not anything is set aside. The lost-after selector
          lives at the top of it, and a setting that governs the whole queue
          cannot be reachable only once a lead has already been archived. */}
      <section className="panel workspace-section-card">
        <details className={styles.adminDetails}>
          <summary className={styles.adminSummary}>
            <span>Lead settings &amp; archive</span>
            <small>
              Auto-close: {leadLostAfterLabel(leadLostAfterDays)} · {setAside.length} archived or snoozed
            </small>
          </summary>
          <div className={styles.adminBody}>
        <form action={setLeadLostAfterDaysAction} className={styles.lostAfter}>
          <label htmlFor="leadLostAfterDays" className={styles.lostAfterLabel}>
            Mark a lead <strong>Lost</strong> after
          </label>
          <select id="leadLostAfterDays" name="days" defaultValue={String(leadLostAfterDays)}>
            {/* The saved value first if it is not one of the presets — an
                account set to 45 by hand must not silently read as 30. */}
            {(LEAD_LOST_AFTER_CHOICES as readonly number[]).includes(leadLostAfterDays) ? null : (
              <option value={String(leadLostAfterDays)}>{leadLostAfterLabel(leadLostAfterDays)}</option>
            )}
            {LEAD_LOST_AFTER_CHOICES.map((days) => (
              <option key={days} value={String(days)}>{leadLostAfterLabel(days)}</option>
            ))}
          </select>
          <SaveButton className="btn ghost" pendingLabel="Saving…" onlyWhenChanged>Save</SaveButton>
          <p className={styles.lostAfterNote}>
            {leadLostAfterDays === LEAD_LOST_NEVER
              ? 'Nothing is closed automatically — leads stay in the queue until you move them.'
              : `Counted from when the lead arrived. Only leads still New, Contacted or Quoted are touched, and changing this doesn’t reopen anything already marked lost.`}
          </p>
        </form>

        {setAside.length > 0 ? (
          <details className="workspace-details">
            <summary className="workspace-details-summary">
              <span className="btn secondary">Archived Leads ({setAside.length})</span>
              {/* The drawer holds snoozed leads too, so the copy still says so —
                  a label can be shorter than what it opens, but it should not
                  contradict it. */}
              <span className="workspace-details-copy">Archived and snoozed leads — out of the way, never lost.</span>
            </summary>
            <div className={styles.setAsideList}>
              {setAside.map(({ lead, triage }) => (
                <div className={styles.setAsideRow} key={lead.id}>
                  <Link href={`/dashboard/leads/${lead.id}`} className={styles.setAsideName}>{lead.name || 'Unnamed request'}</Link>
                  <span className={styles.setAsideWhy}>
                    {triage.archived ? 'Archived' : `Snoozed until ${new Date(triage.snoozedUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {triage.declinedReason ? ' · declined' : ''}
                  </span>
                  <div className={styles.setAsideActions}>
                    {triage.archived ? (
                      <form action={archiveLeadAction.bind(null, lead.id, false)}><button type="submit" className="btn ghost">Restore</button></form>
                    ) : (
                      <form action={unsnoozeLeadAction.bind(null, lead.id)}><button type="submit" className="btn ghost">Wake up</button></form>
                    )}
                    {/* The only permanent delete on this page, and it is here
                        because this is the one list where a lead has already
                        been judged not worth keeping. Everything else archives
                        or snoozes, which is why this drawer could only grow. */}
                    <DeleteLeadButton
                      action={deleteLeadAction.bind(null, lead.id)}
                      name={lead.name || 'this request'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <p className="empty-state">Nothing archived. Leads you set aside or snooze collect here.</p>
        )}
          </div>
        </details>
      </section>

      <div className={`stat-ticker panel ${styles.requestStats}`}>
        <div className={styles.urgentStat}>
          <span className="stat-ticker-value">{stages.new}</span>
          <span className="stat-ticker-label">Needs response</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{websiteRequests}</span>
          <span className="stat-ticker-label">Website leads · all time</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{openRequests}</span>
          <span className="stat-ticker-label">Open leads</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{averageResponse}</span>
          <span className="stat-ticker-label">Avg response time</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{stages.won}</span>
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
              <input id="name" name="name" required autoComplete="name" placeholder="Sarah Whitfield" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(248) 555-0117" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="sarah@example.com" />
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
