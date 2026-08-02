import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { expireStaleLeads, getLeadTriage } from '@/lib/leads';
import { listJobs } from '@/lib/jobs';
import { QUICK_STOP_SETTINGS_COLUMNS, quickStopSettingsFromAccount } from '@/lib/quick-stop';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';

// Lightweight status check used by the app shell to show persistent dashboard
// badges and alerts. Intentionally returns only minimal state needed for the
// shell since this is fetched client-side.
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false, onboarded: false, sitePublished: false, siteUrl: null, businessName: null, newQuoteRequestCount: 0, jobsNeedingAttentionCount: 0, unscheduledJobCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId) {
    return NextResponse.json({ loggedIn: true, onboarded: false, sitePublished: false, siteUrl: null, businessName: null, newQuoteRequestCount: 0, jobsNeedingAttentionCount: 0, unscheduledJobCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const admin = createAdminClient();
  await expireStaleLeads(admin, membership.accountId);
  const [{ data: account }, { data: site }, { data: newLeadRows }, { count: openLeadCount }, jobs] = await Promise.all([
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
    admin
      .from('leads')
      .select('id, created_at, triage')
      .eq('account_id', membership.accountId)
      .eq('source', 'website_form')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(50),
    // Pipeline inventory, not "needs you": every lead still being worked.
    // 'won' is excluded alongside 'lost' — a won lead IS the job sitting in the
    // Jobs total right beside it, so counting it here would bill the same work
    // to both circles.
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', membership.accountId)
      .not('status', 'in', '("won","lost")'),
      listJobs(admin, membership.accountId),
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
      const muteLowLeads = account?.mute_low_quality_leads !== false;
      const attentionLeads = (newLeadRows ?? [])
        .map((row) => ({ id: row.id as string, created_at: row.created_at as string, triage: getLeadTriage({ triage: (row as { triage: unknown }).triage as never }) }))
        .filter((row) => !muteLowLeads || row.triage.score !== 'low');
      const newQuoteRequestCount = attentionLeads.length;
      const newestLead = attentionLeads[0] ?? null;
      const newestQuoteRequestHighValue = newestLead ? newestLead.triage.flags.includes('high_value') : false;

  // Quick Stop is the one automation that puts a stranger on today's route, and
  // its switch lived three clicks deep in Settings. Whether it's ON is a thing
  // the owner should be able to see from anywhere in the app, so it rides along
  // with the rest of the shell state. 'paused' is support's lock, which
  // overrides `enabled` — showing green there would say the opposite of the truth.
  const quickStop = quickStopSettingsFromAccount((account ?? {}) as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const quickStopState: 'on' | 'off' | 'paused' = quickStop.locked ? 'paused' : quickStop.enabled ? 'on' : 'off';
  const bookingAvailability = bookingAvailabilityFromAccount(
    (account ?? {}) as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const sitePublished = site?.published ?? false;
  const siteUrl = sitePublished
    ? site?.custom_domain && site?.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site?.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null
    : null;

  return NextResponse.json({
    loggedIn: true,
    onboarded: account?.connect_onboarded ?? false,
    sitePublished,
    siteUrl,
    businessName: site?.company_name || account?.business_name || null,
    newQuoteRequestCount,
    jobsNeedingAttentionCount,
    unscheduledJobCount,
    openLeadCount: openLeadCount ?? 0,
    activeJobCount,
    newestQuoteRequestId: newestLead?.id ?? null,
    newestQuoteRequestCreatedAt: newestLead?.created_at ?? null,
    newestQuoteRequestHighValue,
    newestJobCreatedAt,
    quickStopState,
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
