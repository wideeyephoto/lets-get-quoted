import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { expireStaleLeads } from '@/lib/leads';
import { listJobs } from '@/lib/jobs';

// Lightweight status check used by the app shell to show persistent dashboard
// badges and alerts. Intentionally returns only minimal state needed for the
// shell since this is fetched client-side.
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false, onboarded: false, sitePublished: false, siteUrl: null, newQuoteRequestCount: 0, activeJobCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId) {
    return NextResponse.json({ loggedIn: true, onboarded: false, sitePublished: false, siteUrl: null, newQuoteRequestCount: 0, activeJobCount: 0, newestQuoteRequestId: null, newestQuoteRequestCreatedAt: null });
  }

  const admin = createAdminClient();
  await expireStaleLeads(admin, membership.accountId);
  const [{ data: account }, { data: site }, { data: newQuoteRequests, count: newQuoteRequestCount }, jobs] = await Promise.all([
    admin.from('accounts').select('connect_onboarded').eq('id', membership.accountId).maybeSingle(),
    admin
      .from('sites')
      .select('published, subdomain, custom_domain, custom_domain_verified_at')
      .eq('account_id', membership.accountId)
      .maybeSingle(),
    admin
      .from('leads')
      .select('id, created_at', { count: 'exact' })
      .eq('account_id', membership.accountId)
      .eq('source', 'website_form')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(1),
      listJobs(admin, membership.accountId),
  ]);
      const activeJobCount = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived').length;

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
    newQuoteRequestCount: newQuoteRequestCount ?? 0,
    activeJobCount,
    newestQuoteRequestId: newQuoteRequests?.[0]?.id ?? null,
    newestQuoteRequestCreatedAt: newQuoteRequests?.[0]?.created_at ?? null,
  });
}
