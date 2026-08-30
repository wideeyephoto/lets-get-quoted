import ManagedAdsScreen from '@/app/dashboard/marketing/ads/ManagedAdsScreen';

export const metadata = { title: 'AI Advertising Autopilot — Live Demo' };

export default async function DemoManagedAdsPage() {
  return (
    <ManagedAdsScreen
      businessName="Apex Roofing & Restoration"
      trade="Roofing"
      tradeSlug="roofing"
      city="Austin, TX"
      domain="apexroofing.letsgetquoted.com"
      phone="(512) 555-0199"
      availableServices={[
        'Emergency Roof Leak Repair',
        'Asphalt Shingle Replacement',
        'Storm & Hail Damage Inspection',
        'Commercial Flat Roofing',
        'Gutter Installation & Repair',
      ]}
      basePath="/demo"
    />
  );
}
