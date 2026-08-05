import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { AUDIENCE_DEFS, listCampaigns, loadListHealth, loadRecipients, matchesAudience } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';
import { campaignDraftForBeat } from '@/lib/marketing-draft-data';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { marketingCalendarAction } from './actions';
import MarketingWorkspace from './MarketingWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing' };

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: { sent?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string };
  // `draft` is 'extra-stop' or 'beat:<id>'. Both are looked up server-side.
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [view, recipients, campaigns, listHealth, { data: addressRow }, rebookCandidates] = await Promise.all([
    marketingCalendarAction(4),
    loadRecipients(supabase, accountId),
    listCampaigns(supabase, accountId),
    loadListHealth(supabase, accountId),
    supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle(),
    listRebookCandidates(supabase, accountId, DEFAULT_REBOOK_DAYS),
  ]);

  // Past customers overdue for another job. A summary only — the list and the
  // sending live on their own page. `uninvited` is the number that matters: the
  // rest have already been asked, and asking them again is how you become the
  // contractor somebody blocks.
  const rebook = {
    days: DEFAULT_REBOOK_DAYS,
    due: rebookCandidates.length,
    reachable: rebookCandidates.filter((candidate) => candidate.smsReady || candidate.hasEmail).length,
    uninvited: rebookCandidates.filter((candidate) => (candidate.smsReady || candidate.hasEmail) && !candidate.invitedAt).length,
  };

  const mailingAddress = resolveMarketingMailingAddress(addressRow?.mailing_address as string | null);

  // A summary only — the posts themselves are a page of their own. Null when
  // there is no website, because "0 drafts" would read as something to fix.
  const blogData = await loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com');
  const published = blogData?.posts.filter((post) => post.status === 'published') ?? [];
  const blogSummary = blogData
    ? {
        total: blogData.posts.length,
        live: published.length,
        drafts: blogData.posts.length - published.length,
        latest: published.map((post) => post.date).filter(Boolean).sort().at(-1) ?? null,
      }
    : null;

  // Precompute reachable counts per audience × channel so the composer can show
  // live numbers without pulling any contact data into the client bundle.
  const now = Date.now();
  const reach = Object.fromEntries(
    AUDIENCE_DEFS.map((audience) => {
      const matched = recipients.filter((recipient) => matchesAudience(recipient, audience.id, now));
      return [
        audience.id,
        {
          total: matched.length,
          email: matched.filter((recipient) => recipient.emailReady).length,
          sms: matched.filter((recipient) => recipient.smsReady).length,
          either: matched.filter((recipient) => recipient.emailReady || recipient.smsReady).length,
        },
      ];
    }),
  );

  // A draft handed over from another page. Built here rather than passed through
  // the URL: the message depends on the account's own settings, and a
  // querystring carrying prose is a querystring somebody can rewrite.
  //
  // The calendar above no longer needs this — it hands its draft across in the
  // browser — but a link arriving from elsewhere still does.
  let draft:
    | { channel: 'email' | 'sms' | 'both'; audience: string; subject: string; subjectOptions?: string[]; body: string; beatId?: string }
    | undefined;
  if (searchParams.draft === 'extra-stop') {
    const [{ data: account }, { data: site }] = await Promise.all([
      supabase.from('accounts').select('business_name, extra_stop_min_fee_cents, extra_stop_days_ahead').eq('id', accountId).maybeSingle(),
      supabase.from('sites').select('published, subdomain, company_name').eq('account_id', accountId).maybeSingle(),
    ]);
    const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
    const pitch = buildQuickStopPitch({
      businessName: (site?.company_name as string) || (account as { business_name?: string } | null)?.business_name || 'us',
      bookingUrl: site?.published && site?.subdomain ? `${origin}/book/${site.subdomain}` : origin,
      minFeeCents: Number((account as { extra_stop_min_fee_cents?: number } | null)?.extra_stop_min_fee_cents) || 0,
      daysAhead: Number((account as { extra_stop_days_ahead?: number } | null)?.extra_stop_days_ahead ?? 1),
    });
    // Past customers, because they already know whether they liked the work.
    draft = { channel: 'email', audience: 'past', subject: pitch.subject, body: pitch.body };
  } else if (searchParams.draft?.startsWith('beat:')) {
    draft = await campaignDraftForBeat(supabase, accountId, searchParams.draft.slice('beat:'.length));
  }

  const sentCount = searchParams.sent ? Number(searchParams.sent) : null;
  const showResult = sentCount !== null;
  const showTestFlash = searchParams.test === '1';

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing</p>
          <h1 className="workspace-title">What&apos;s worth saying, and when</h1>
          <p className="workspace-lead">
            Seasonal topics for {view.businessName}, timed to your trade and your weather — and the composer that
            sends them. Nothing here goes out on its own: it drafts, you decide, and every email carries its own
            unsubscribe. <a href="#new-campaign">Write a one-off →</a>
          </p>
        </div>
      </section>

      {showTestFlash ? (
        <section className="panel workspace-section-card flash-banner flash-info">
          <p>Test email sent to your inbox. Take a look, then send the real thing when it&apos;s ready.</p>
        </section>
      ) : null}

      {showResult ? (
        <section className="panel workspace-section-card flash-banner flash-success">
          <p>
            Campaign sent to <strong>{sentCount}</strong> {sentCount === 1 ? 'message' : 'messages'} across{' '}
            {searchParams.recipients ?? 0} {Number(searchParams.recipients) === 1 ? 'customer' : 'customers'}.
            {Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (not reachable).` : ''}
            {Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed to send.` : ''}
          </p>
        </section>
      ) : null}

      {/* Said before they write, not thrown as an error after. The send is
          blocked without it either way — being told at the end is being told
          once the work is done. */}
      {!mailingAddress ? (
        <section className="panel workspace-section-card flash-banner flash-warn">
          <p>
            Marketing email needs a physical postal address by law, and you don&apos;t have one on file — anything
            you write here can&apos;t be emailed until you add it.{' '}
            <Link href="/dashboard/settings">Add your mailing address →</Link>
          </p>
        </section>
      ) : null}

      <MarketingWorkspace
        view={view}
        campaigns={campaigns}
        hasRecipients={recipients.length > 0}
        blog={blogSummary}
        rebook={rebook}
        composer={{
          audiences: AUDIENCE_DEFS,
          reach,
          initial: draft,
          mailingAddress,
          daysSinceLastSend: listHealth.daysSinceLastSend,
          unsubscribesSinceLastSend: listHealth.unsubscribesSinceLastSend,
        }}
      />
    </main>
  );
}
