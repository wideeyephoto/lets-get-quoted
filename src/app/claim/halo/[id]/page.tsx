import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { createHaloClaimToken } from '@/lib/neighborhood-halo-claim-token';
import { getHaloCampaignById } from '@/lib/neighborhood-halo-service';
import HaloClaimForm from './HaloClaimForm';
import styles from './halo-claim.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();
  const campaign = await getHaloCampaignById(admin, id);
  if (!campaign) return { title: 'Neighbor Offer' };

  return {
    title: `Neighbor Discount on ${campaign.streetName} · Let’s Get Quoted`,
    description: `Claim a $100–$500 group cluster discount while crews are working on ${campaign.streetName} in ${campaign.city}.`,
  };
}

export default async function HaloClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const campaign = await getHaloCampaignById(admin, id);

  if (!campaign) {
    notFound();
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name, phone').eq('id', campaign.accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', campaign.accountId).maybeSingle(),
  ]);

  const businessName = (site?.company_name as string | undefined) || account?.business_name || 'Our Team';
  const phone = account?.phone || '';
  const claimToken = createHaloClaimToken(campaign.id, campaign.accountId);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.businessLogo}>{businessName}</div>
        {phone ? (
          <a href={`tel:${phone}`} className={styles.phoneLink}>
            📞 {phone}
          </a>
        ) : null}
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.badge}>📍 1-Mile Neighbor Cluster</div>
          <h1 className={styles.headline}>
            Just Completed on {campaign.streetName}!
          </h1>
          <p className={styles.subheadline}>
            {campaign.adCopy?.headline ||
              `Our crew just completed a high-craftsmanship project on ${campaign.streetName}. While our tools and trucks are in the neighborhood this week, neighbors qualify for exclusive group discounts.`}
          </p>
        </div>

        {campaign.beforePhotoUrl || campaign.afterPhotoUrl ? (
          <div className={styles.photoCard}>
            <div className={styles.photoGrid}>
              {campaign.beforePhotoUrl ? (
                <div className={styles.photoWrapper}>
                  <img src={campaign.beforePhotoUrl} alt="Before work on jobsite" />
                  <span className={styles.photoLabel}>Before Project</span>
                </div>
              ) : null}
              {campaign.afterPhotoUrl ? (
                <div className={styles.photoWrapper}>
                  <img src={campaign.afterPhotoUrl} alt="Completed craftsmanship" />
                  <span className={styles.photoLabel} style={{ background: '#10b981' }}>
                    Completed Craftsmanship ✓
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.tierCard}>
          <div className={styles.tierHeading}>
            <h3>🏘️ Street Cluster Group Savings</h3>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
              Batch Route Enabled
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1' }}>
            When neighbors on the same street schedule together, drive times drop to zero. We pass those crew savings directly back to you.
          </p>
          <div className={styles.tierGrid}>
            <div className={styles.tierItem}>
              <span className={styles.tierTitle}>2 Homes (Duo)</span>
              <span className={styles.tierDiscount}>$100 Off</span>
            </div>
            <div className={styles.tierItem} style={{ borderColor: '#10b981' }}>
              <span className={styles.tierTitle} style={{ color: '#10b981', fontWeight: 700 }}>3+ Homes (Cluster)</span>
              <span className={styles.tierDiscount}>$250 Off</span>
            </div>
            <div className={styles.tierItem}>
              <span className={styles.tierTitle}>5+ Homes (HOA)</span>
              <span className={styles.tierDiscount}>$500 Off</span>
            </div>
          </div>
        </div>

        <HaloClaimForm
          campaignId={campaign.id}
          claimToken={claimToken}
          streetName={campaign.streetName}
          city={campaign.city}
          businessName={businessName}
        />
      </main>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} {businessName}. Powered by Let’s Get Quoted Neighborhood Halo Network.
      </footer>
    </div>
  );
}
