import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import WebsiteBuilderMockupExperience from '@/app/website-builder-mockup/WebsiteBuilderMockupExperience';

export const metadata: Metadata = {
  title: 'AI Website Builder for Contractors (Pricing Theme Mockup) · Let’s Get Quoted',
  description:
    'Launch a complete, editable contractor website with Smart Intake and instant estimates, connected to your back office from day one.',
  alternates: { canonical: 'https://letsgetquoted.com/features/website-builder-mockup' },
};

export default function WebsiteBuilderMockupFeaturePage() {
  return (
    <>
      <WebsiteBuilderMockupExperience />
      <SiteFooter />
    </>
  );
}
