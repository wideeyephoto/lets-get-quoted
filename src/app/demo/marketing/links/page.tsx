import { DEMO_COMPANY_NAME, DEMO_SITE_HOST } from '@/lib/demo-data';
import LinkBuilderScreen, { type EnrichedTrackingCampaign } from '@/app/dashboard/marketing/links/LinkBuilderScreen';

export const metadata = { title: 'Campaign Link & QR Builder — Live Demo' };

export default async function DemoMarketingLinksPage() {
  const defaultBaseUrl = 'https://' + DEMO_SITE_HOST;
  const rootDomain = DEMO_SITE_HOST;

  const demoInitialCampaigns: EnrichedTrackingCampaign[] = [
    {
      id: 'demo-yrd-1',
      shortCode: 'yrd26',
      name: 'Spring Yard Signs 2026',
      channelId: 'yard_sign',
      source: 'yard_sign',
      medium: 'print_qr',
      campaign: 'spring_yard_signs_2026',
      content: 'neighborhood_lawn',
      term: '',
      promo: '',
      destinationUrl: `${defaultBaseUrl}/estimate`,
      fullUrl: `${defaultBaseUrl}/estimate?utm_source=yard_sign&utm_medium=print_qr&utm_campaign=spring_yard_signs_2026&utm_content=neighborhood_lawn`,
      adSpend: 250,
      visits: 84,
      leads: 18,
      wonJobs: 7,
      revenue: 14200,
      roas: 56.8,
      createdAt: '2026-08-15T14:30:00.000Z',
    },
    {
      id: 'demo-trk-2',
      shortCode: 'trk99',
      name: 'Service Van Fleet Decals',
      channelId: 'truck_decal',
      source: 'truck_wrap',
      medium: 'print_qr',
      campaign: 'fleet_decals_2026',
      content: 'rear_tailgate',
      term: '',
      promo: '',
      destinationUrl: `${defaultBaseUrl}/estimate`,
      fullUrl: `${defaultBaseUrl}/estimate?utm_source=truck_wrap&utm_medium=print_qr&utm_campaign=fleet_decals_2026&utm_content=rear_tailgate`,
      adSpend: 400,
      visits: 62,
      leads: 9,
      wonJobs: 4,
      revenue: 8900,
      roas: 22.3,
      createdAt: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'demo-dor-3',
      shortCode: 'dor15',
      name: 'Neighborhood Door Hangers',
      channelId: 'door_hanger',
      source: 'door_hanger',
      medium: 'print_qr',
      campaign: 'spring_neighborhood_canvass',
      content: 'hvac_tuneup_offer',
      term: '',
      promo: '',
      destinationUrl: `${defaultBaseUrl}/estimate`,
      fullUrl: `${defaultBaseUrl}/estimate?utm_source=door_hanger&utm_medium=print_qr&utm_campaign=spring_neighborhood_canvass&utm_content=hvac_tuneup_offer`,
      adSpend: 150,
      visits: 39,
      leads: 6,
      wonJobs: 3,
      revenue: 5200,
      roas: 34.7,
      createdAt: '2026-08-28T16:15:00.000Z',
    },
  ];

  return (
    <LinkBuilderScreen
      defaultBaseUrl={defaultBaseUrl}
      businessName={DEMO_COMPANY_NAME}
      rootDomain={rootDomain}
      accountId="demo"
      basePath="/demo"
      initialCampaigns={demoInitialCampaigns}
    />
  );
}
