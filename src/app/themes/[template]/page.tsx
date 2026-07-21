import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { Site, TemplateType } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';

const DEMO_SITE: Site = {
  id: 'theme-demo',
  account_id: 'theme-demo',
  subdomain: null,
  custom_domain: null,
  custom_domain_verified_at: null,
  published: false,
  template: 'carbon',
  header_font: null,
  button_style: 'solid',
  accent_override: null,
  company_name: 'Northline Builders',
  headline: 'Built with purpose. Finished with care.',
  tagline: 'Residential construction and renovations shaped around real homes and real life.',
  phone: '(555) 014-2018',
  license: 'LIC #482901',
  hours: 'Monday-Friday, 7am-5pm',
  service_area: 'Riverton and surrounding communities',
  logo_url: null,
  hero_url: null,
  seo_title: null,
  seo_description: null,
  sections: {},
  content: {},
  chrome: {},
  reviews_cache: null,
  portal_mode: 'light',
  updated_at: new Date(0).toISOString(),
};

type ThemeDemoPageProps = {
  params: { template: string };
};

export default function ThemeDemoPage({ params }: ThemeDemoPageProps) {
  const Template = getTemplate(params.template);
  if (!Template) notFound();

  const site = { ...DEMO_SITE, template: params.template as TemplateType };
  return <Template site={site} galleryImages={STOCK_SITE_IMAGES.slice(0, 5)} />;
}

export function generateMetadata({ params }: ThemeDemoPageProps): Metadata {
  // These are internal placeholder demos ('Northline Builders') — keep them out
  // of the index so they don't compete with or dilute real client sites.
  return {
    title: `${params.template} theme preview | Let's Get Quoted`,
    robots: { index: false, follow: false },
  };
}