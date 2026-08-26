import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { expireStaleLeads, getLeadTriage, type LeadStatus, type LeadTriage } from '@/lib/leads';
import { isLeadActive, needsResponse } from '@/lib/lead-queue';
import { leadRailTitle, leadSummary } from '@/lib/lead-summary';
import { listJobs } from '@/lib/jobs';
import { QUICK_STOP_SETTINGS_COLUMNS, quickStopSettingsFromAccount } from '@/lib/quick-stop';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import { countUnreadMessages } from '@/lib/messages';
import { quickStopNavState, quickStopState } from '@/lib/quick-stop-state';
import { pickBusinessName } from '@/lib/business-name';
import { applyTestRecordFilter } from '@/lib/test-records';

// Lightweight status check used by the app shell to show persistent dashboard
// badges and alerts. Intentionally returns only minimal state needed for the
// shell since this is fetched client-side.

// How many unanswered leads we read in order to judge them. Ten times the old
// figure, and deliberately unrelated to what the badge is willing to print —
// see the query below, and attentionBadgeLabel in lib/lead-queue.
const ATTENTION_LEAD_SCAN_LIMIT = 500;

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false, onboarded: false, sitePublished: false, siteUrl: null, businessName: null, newQuoteRequestCount: 0, jobsNeedingAttentionCount: 0, unscheduledJobCount: 0, openQuickStopRequestCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId) {
    return NextResponse.json({ loggedIn: true, onboarded: false, sitePublished: false, siteUrl: null, businessName: null, newQuoteRequestCount: 0, jobsNeedingAttentionCount: 0, unscheduledJobCount: 0, openQuickStopRequestCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const admin = createAdminClient();
  await expireStaleLeads(admin, membership.accountId);
  const [{ data: account }, { data: site }, { data: newLeadRows }, { data: openLeadRows }, jobs, { count: openQuickStopRequestCount }] = await Promise.all([
    admin
      .from('accounts')
      .select(
        `connect_onboarded, business_name, mute_low_quality_leads, booking_enabled, booking_weekdays, booking_windows, ${QUICK_STOP_SETTINGS_COLUMNS}`,
      )
      .eq('id', membership.accountId)
      .maybeSingle(),
    admin
      .from('sites')
      .select('published, subdomain, custom_domain, custom_domain_verified_at, company_name')
      .eq('account_id', membership.accountId)
      .maybeSingle(),
    // WHY THIS IS STILL ROWS AND NOT `head: true`.
    //
    // Two of the three things that disqualify a lead here — archived, snoozed,
    // low-quality-and-muted — live inside the `triage` JSONB blob, and the
    // account setting that decides the third is not known until the accounts
    // read beside this one resolves. A head count would have to spell the whole
    // predicate out again in PostgREST's JSON-path dialect, against unindexed
    // keys, which is precisely the fifth copy this change exists to delete. So
    // the rows come back and lib/lead-queue judges them in JS, once.
    //
    // The limit is a scan ceiling, not the badge's ceiling: it used to be 50,
    // which was ALSO what the badge counted, so past fifty the number silently
    // stuck while the Leads page's own totals kept climbing. Past 500 unanswered
    // new leads the count under-reads — but the badge is rendering "50+" long
    // before that, so the only thing lost is precision nobody was reading.
    applyTestRecordFilter(
      admin
        .from('leads')
        .select('id, created_at, status, triage')
        .eq('account_id', membership.accountId)
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(ATTENTION_LEAD_SCAN_LIMIT),
    ),
    // Pipeline inventory, not "needs you": every lead still being worked.
    // 'won' is excluded alongside 'lost' — a won lead IS the job sitting in the
    // Jobs total right beside it, so counting it here would bill the same work
    // to both circles.
    //
    // The ROWS rather than a head count, so the rail's tooltip can be built by
    // the same function the dashboard's card uses. The rail and the dashboard
    // telling different lead stories is the thing lib/lead-summary exists to
    // stop, and it can only be stopped by them sharing the arithmetic.
    //
    // `triage` rides along because archived and snoozed leads are still 'new'
    // in the status column — without it the rail's open count and its tooltip
    // keep counting work the owner has explicitly put down.
    applyTestRecordFilter(
      admin
        .from('leads')
        .select('status, source, triage')
        .eq('account_id', membership.accountId)
        .not('status', 'in', '("won","lost")'),
    ),
    listJobs(admin, membership.accountId),
    admin
      .from('extra_stop_requests')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', membership.accountId)
      .in('status', ['awaiting_contractor', 'more_information_requested']),
  ]);
      // Badges mean "needs YOUR attention", not inventory. Jobs = quotes still
      // in the approval stage (drop the moment they're approved -> in_progress);
      // Schedule = approved work with no date yet. Kept disjoint so one job never
      // lights up both badges.
      const jobsNeedingAttentionCount = jobs.filter((job) => job.status === 'new_lead').length;
      const unscheduledJobCount = jobs.filter((job) => job.status === 'in_progress' && !job.scheduled_for).length;
      // Inventory to the attention badge's "needs you" — but LIVE work only.
      // Counting 'complete' too meant the number only ever grew, so after a busy
      // season it would read 300-odd and stop meaning anything at a glance.
      const activeJobCount = jobs.filter((job) => job.status === 'new_lead' || job.status === 'in_progress').length;
      // When the newest job arrived, for the rail's "New" badge. Live work only,
      // matching activeJobCount: a job completed and archived months ago is not
      // something to go and look at. listJobs already sorts newest-first.
      const newestJobCreatedAt =
        jobs.find((job) => job.status === 'new_lead' || job.status === 'in_progress')?.created_at ?? null;

      // Muting low-quality leads (default on) keeps them off the dashboard nag —
      // the badge/banner only counts leads that actually deserve a response.
      // It stays an option on the shared predicate rather than a rule inside it:
      // the Leads page counts without it, because that page SHOWS those leads
      // and a total must never disagree with the list under it.
      const muteLowQuality = account?.mute_low_quality_leads !== false;
      // One clock for every lead in this response, so the badge and the tooltip
      // cannot land on opposite sides of a snooze that expires mid-request.
      const now = new Date();
      const attentionLeads = (newLeadRows ?? [])
        .map((row) => ({
          id: row.id as string,
          created_at: row.created_at as string,
          status: row.status as LeadStatus,
          triage: getLeadTriage({ triage: (row as { triage: unknown }).triage as never }),
        }))
        // The badge used to be "status new + source website_form" and nothing
        // else, so it went on counting a lead the owner had archived or snoozed
        // for up to thirty days — and clicking it landed them on a Leads page
        // that had already taken the lead off the board.
        .filter((lead) => needsResponse(lead, { muteLowQuality }, now));
      const newQuoteRequestCount = attentionLeads.length;
      const openLeads = ((openLeadRows ?? []) as { status: LeadStatus; source: string | null; triage: LeadTriage | null }[])
        .filter((lead) => isLeadActive({ status: lead.status, triage: getLeadTriage(lead) }, now));
      const leadStats = leadSummary(openLeads);
      const newestLead = attentionLeads[0] ?? null;
      const newestQuoteRequestHighValue = newestLead ? newestLead.triage.flags.includes('high_value') : false;

  // Quick Stop is the one automation that puts a stranger on today's route, and
  // its switch lived three clicks deep in Settings. Whether it's ON is a thing
  // the owner should be able to see from anywhere in the app, so it rides along
  // with the rest of the shell state. 'paused' is support's lock, which
  // overrides `enabled` — showing green there would say the opposite of the truth.
  const quickStop = quickStopSettingsFromAccount((account ?? {}) as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const bookingAvailability = bookingAvailabilityFromAccount(
    (account ?? {}) as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  // Unread customer texts. A text inbox with no signal anywhere in the app means
  // messages get missed, and for a contractor a missed text is a lost job — this
  // is the same rail slot Leads and Jobs already use.
  const unreadMessageCount = await countUnreadMessages(admin, membership.accountId);

  const sitePublished = site?.published ?? false;
  const siteUrl = sitePublished
    ? site?.custom_domain && site?.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site?.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null
    : null;

  // THE RAIL AND THE PAGE NOW AGREE.
  //
  // This was `locked ? 'paused' : enabled ? 'on' : 'off'` — a rule that knew
  // nothing about whether Quick Stops could actually take a request. So an owner
  // who flipped the switch with no published site, no fee band or no Stripe saw
  // a green ON in the rail from every page in the app, walked to Quick Stops,
  // and was told "Not live yet". Same five inputs as the page now, through the
  // same function; see lib/quick-stop-state.
  const quickStopNav = quickStopNavState(
    quickStopState({
      enabled: quickStop.enabled,
      locked: quickStop.locked,
      lockedUntil: quickStop.lockedUntil ?? null,
      // No lockReason on the settings row — the page reads it from a separate
      // lock record. The rail only needs the STATE, and quickStopNavState
      // collapses every non-live case to 'off' or 'paused' anyway.
      lockReason: '',
      feeSet: quickStop.maxFeeCents > 0,
      daysSet: quickStop.weekdays.length > 0,
      stripeConnected: Boolean(account?.connect_onboarded),
      hasBookingUrl: Boolean(siteUrl),
      maxPerDay: quickStop.maxPerDay,
    }),
  );

  return NextResponse.json({
    loggedIn: true,
    onboarded: account?.connect_onboarded ?? false,
    sitePublished,
    siteUrl,
    // The same ladder every outbound message uses, rather than a second one
    // spelled out by hand here. The difference is the placeholder: this used to
    // print the literal "My Business" that signup writes into
    // accounts.business_name, so the rail showed one name, the website showed
    // another and the texts showed a third — three identities for one business,
    // which is what a customer sees as inconsistency and we saw as three
    // different fields. '' as the fallback because the rail renders nothing at
    // all rather than a stand-in name.
    businessName: pickBusinessName(site, account, '') || null,
    newQuoteRequestCount,
    jobsNeedingAttentionCount,
    unscheduledJobCount,
    unreadMessageCount,
    openQuickStopRequestCount: openQuickStopRequestCount ?? 0,
    openLeadCount: leadStats.open,
    // The rail's tooltip, built here from the same function the dashboard card
    // uses, so the two can never drift into telling different stories.
    leadRailTitle: leadRailTitle(leadStats),
    activeJobCount,
    newestQuoteRequestId: newestLead?.id ?? null,
    newestQuoteRequestCreatedAt: newestLead?.created_at ?? null,
    newestQuoteRequestHighValue,
    newestJobCreatedAt,
    quickStopState: quickStopNav,
    // Online booking, judged the same way its own setup page judges it: the
    // switch being on is not the same as the page being able to take a booking.
    // Without a published site, or with no open days or no arrival windows,
    // there is nothing to book — so it reports 'paused' rather than claiming ON.
    bookingState: !bookingAvailability.enabled
      ? ('off' as const)
      : siteUrl && bookingAvailability.weekdays.length > 0 && bookingAvailability.windowTimes.length > 0
        ? ('on' as const)
        : ('paused' as const),
  });
}
