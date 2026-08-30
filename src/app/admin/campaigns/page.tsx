import { requireAdmin } from '@/lib/auth';
import {
  listPlatformCampaignHistory,
  resolvePlatformCampaignRecipients,
  PLATFORM_AUDIENCES,
} from '@/lib/admin-platform-campaigns';
import AdminCampaignsClient from './AdminCampaignsClient';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email campaigns — Admin' };

export default async function AdminCampaignsPage() {
  const { admin, adminEmail } = await requireAdmin();

  // Load initial reach counts across all standard audiences
  const reachEntries = await Promise.all(
    PLATFORM_AUDIENCES.map(async (aud) => {
      if (aud.id === 'custom') return [aud.id, 0] as const;
      try {
        const recipients = await resolvePlatformCampaignRecipients(admin, aud.id);
        return [aud.id, recipients.length] as const;
      } catch {
        return [aud.id, 0] as const;
      }
    }),
  );

  const initialAudienceReach = Object.fromEntries(reachEntries);
  const totalContractors = initialAudienceReach['all_contractors'] ?? 0;
  const active30d = initialAudienceReach['active_30d'] ?? 0;

  // Load past campaign broadcasts
  const campaigns = await listPlatformCampaignHistory(admin, 50);

  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Platform Communications</p>
        <h1 className={styles.title}>Email campaigns</h1>
        <p className={styles.lead}>
          Create, test, and broadcast branded email campaigns directly from Let’s Get Quoted (<code>hello@letsgetquoted.com</code>) to contractors, active cohorts, paid subscribers, and custom recipient lists.
        </p>
      </header>

      {/* Top Headline Metric Cards */}
      <section className={styles.cardGrid} aria-label="Campaign broadcast summary" style={{ marginBottom: '1.4rem' }}>
        <div className={`${styles.panel} ${styles.statCard} ${styles.accentAmber}`}>
          <span className={styles.statValue}>{campaigns.length}</span>
          <span className={styles.statLabel}>Campaigns broadcast</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            {totalDelivered.toLocaleString('en-US')} total emails delivered
          </span>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentEmerald}`}>
          <span className={styles.statValue}>{totalContractors.toLocaleString('en-US')}</span>
          <span className={styles.statLabel}>Deliverable contractors</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            {active30d.toLocaleString('en-US')} active in last 30 days
          </span>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentIndigo}`}>
          <span className={styles.statValue}>100%</span>
          <span className={styles.statLabel}>Authenticated domain</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            SPF, DKIM &amp; RFC 8058 one-click unsub
          </span>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentNeutral}`}>
          <span className={styles.statValue}>5</span>
          <span className={styles.statLabel}>Branded email themes</span>
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            Spotlight, Studio, Blueprint &amp; more
          </span>
        </div>
      </section>

      {/* Interactive Tabs: Composer, History, Audiences */}
      <AdminCampaignsClient
        adminEmail={adminEmail}
        initialAudienceReach={initialAudienceReach}
        initialCampaigns={campaigns}
      />
    </>
  );
}
