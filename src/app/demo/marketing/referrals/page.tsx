import { DEMO_CLIENT_ROWS, DEMO_EXTRA_STOP_ROWS, DEMO_JOB_ROWS, DEMO_SITE_ROW } from '@/lib/demo-rows';
import { DEMO_COMPANY_NAME } from '@/lib/demo-data';
import { buildReferralQueue, quickStopReferralStatus, type ReferralQueueLead } from '@/lib/referral-queue';
import { buildReferralShareText } from '@/lib/referrals';
import MarketingNav from '@/app/dashboard/marketing/MarketingNav';
import ReferralsClient, {
  type ClientLinkItem,
  type AdvocateItem,
  type RevenueMetrics,
} from '@/app/dashboard/marketing/referrals/ReferralsClient';

export const metadata = {
  title: 'Referrals — Live Demo',
  description: 'Explore the automated customer referral and reward system in the live demo.',
};

/**
 * Demo Referrals Page: A live interactive replica running over fixtures.
 */
export default async function DemoReferralsPage() {
  const origin = 'https://evergreenlawn.letsgetquoted.com';
  const bookingUrl = `${origin}/book/evergreenlawn`;
  const businessName = DEMO_COMPANY_NAME;
  const reward = '$50 off your next service';

  // Seed realistic demo referral leads derived from DEMO_CLIENT_ROWS
  const clients = DEMO_CLIENT_ROWS.slice(0, 15);
  const clientNames = new Map<string, string>();
  clients.forEach((c) => clientNames.set(c.id as string, c.name as string));

  // Build demo referral records
  const referred: ReferralQueueLead[] = [
    {
      id: 'demo-ref-lead-1',
      source: 'lead',
      name: 'Marcus Vance',
      phone: '(248) 555-0182',
      email: 'marcus.vance@example.com',
      status: 'won',
      client_id: 'demo-client-sub-1',
      created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      referral_settled_at: null,
      value: 1450,
    },
    {
      id: 'demo-ref-lead-2',
      source: 'lead',
      name: 'Emily Thornton',
      phone: '(248) 555-0133',
      email: 'emily.t@example.com',
      status: 'won',
      client_id: 'demo-client-sub-2',
      created_at: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
      referral_settled_at: null,
      value: 850,
    },
    {
      id: 'demo-ref-lead-3',
      source: 'lead',
      name: 'Brian Kowalski',
      phone: '(248) 555-0174',
      email: null,
      status: 'new',
      client_id: null,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      referral_settled_at: null,
      value: 600,
    },
    {
      id: 'demo-ref-stop-1',
      source: 'quick_stop',
      name: 'Chloe Bennett',
      phone: '(248) 555-0195',
      email: 'chloe.b@example.com',
      status: quickStopReferralStatus('confirmed'),
      client_id: 'demo-client-sub-3',
      created_at: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
      referral_settled_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      value: 350,
    },
  ];

  const referredByMap = new Map<string, string>([
    ['demo-ref-lead-1', (clients[0]?.id as string) || 'demo-client-1'],
    ['demo-ref-lead-2', (clients[1]?.id as string) || 'demo-client-2'],
    ['demo-ref-lead-3', (clients[0]?.id as string) || 'demo-client-1'],
    ['demo-ref-stop-1', (clients[2]?.id as string) || 'demo-client-3'],
  ]);

  const queue = buildReferralQueue(
    referred,
    (lead) => referredByMap.get(lead.id) ?? null,
    (clientId) => clientNames.get(clientId) || 'A past customer',
  );

  // Mint demo customer links
  const clientLinks: ClientLinkItem[] = clients.map((c, i) => {
    const code = `EVERGREEN-${(c.name as string).toUpperCase().slice(0, 4)}-${i + 1}0`;
    const url = `${bookingUrl}?ref=${code}`;
    return {
      id: c.id as string,
      name: c.name as string,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      referralCode: code,
      referralUrl: url,
      shareText: buildReferralShareText({
        referrerName: c.name as string,
        businessName,
        shareUrl: url,
      }),
    };
  });

  // Top advocates
  const advocates: AdvocateItem[] = [
    {
      clientId: clients[0]?.id as string || 'demo-client-1',
      name: (clients[0]?.name as string) || 'Sarah Jenkins',
      phone: (clients[0]?.phone as string) || null,
      email: (clients[0]?.email as string) || null,
      totalSent: 2,
      totalWon: 1,
      revenue: 1450,
      owedCount: 1,
      referralUrl: clientLinks[0]?.referralUrl || `${bookingUrl}?ref=DEMO-1`,
      shareText: clientLinks[0]?.shareText || '',
    },
    {
      clientId: clients[1]?.id as string || 'demo-client-2',
      name: (clients[1]?.name as string) || 'Mark Henderson',
      phone: (clients[1]?.phone as string) || null,
      email: (clients[1]?.email as string) || null,
      totalSent: 1,
      totalWon: 1,
      revenue: 850,
      owedCount: 1,
      referralUrl: clientLinks[1]?.referralUrl || `${bookingUrl}?ref=DEMO-2`,
      shareText: clientLinks[1]?.shareText || '',
    },
    {
      clientId: clients[2]?.id as string || 'demo-client-3',
      name: (clients[2]?.name as string) || 'Elena Ruiz',
      phone: (clients[2]?.phone as string) || null,
      email: (clients[2]?.email as string) || null,
      totalSent: 1,
      totalWon: 1,
      revenue: 350,
      owedCount: 0,
      referralUrl: clientLinks[2]?.referralUrl || `${bookingUrl}?ref=DEMO-3`,
      shareText: clientLinks[2]?.shareText || '',
    },
  ];

  const metrics: RevenueMetrics = {
    totalWonRevenue: 2650,
    totalReferrals: 4,
    totalWon: 3,
    totalOwed: queue.owed.length,
    totalThanked: queue.thanked.length,
  };

  // Demo no-op action handlers
  async function demoAction() {
    'use server';
  }

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath="/demo" referralsOwedCount={queue.owed.length} />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Referrals (Demo)</p>
          <h1 className="workspace-title">Who sent you work</h1>
          <p className="workspace-lead">
            Every customer who sends someone your way gets their own link. When that person books, they show up here — so you can say thank
            you, and track the revenue they created.
          </p>
        </div>
      </section>

      <ReferralsClient
        queue={queue}
        reward={reward}
        configured={true}
        bookingUrl={bookingUrl}
        businessName={businessName}
        clientLinks={clientLinks}
        advocates={advocates}
        metrics={metrics}
        basePath="/demo"
        leadsError={false}
        stopsError={false}
        onSettleAction={demoAction}
        onUnsettleAction={demoAction}
        onSetRewardAction={demoAction}
      />
    </main>
  );
}
