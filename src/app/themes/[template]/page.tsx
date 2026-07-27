import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { Site, TemplateType } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';

// A fully-populated content object so each /themes/<id> demo renders the template
// with EVERY section filled in (services, reviews, gallery, stats, FAQs, process,
// service areas, blog, hero badges…), not the bare hero it showed with content:{}.
// getSiteContent normalizes this, so it only needs the raw fields each section
// reads. Shared across all themes — they all read the same schema.
const DEMO_CONTENT: Record<string, unknown> = {
  heroEyebrow: 'Built to last',
  heroBadge: { preset: 'licensed', showStats: true, style: 'soft', secondPreset: 'guarantee' },
  ratingBadge: { enabled: true, rating: 5, reviewCount: 139, sourceLabel: 'Verified reviews' },
  trustBadges: { enabled: true },
  stickyCallBar: { enabled: true, showQuote: true },
  services: {
    enabled: true,
    title: 'What we do',
    intro: 'From the first estimate to the final walkthrough, one accountable crew handles the whole job.',
    items: [
      { id: 'svc-1', icon: 'home', title: 'Custom home builds', description: 'Ground-up construction managed end to end, on schedule and on budget.' },
      { id: 'svc-2', icon: 'hammer', title: 'Kitchen & bath remodels', description: 'Layouts, cabinetry, tile, and fixtures that fit how you actually live.' },
      { id: 'svc-3', icon: 'ruler', title: 'Additions & extensions', description: 'More room without moving — permits, framing, and finish work included.' },
      { id: 'svc-4', icon: 'roller', title: 'Interior finishing', description: 'Trim, paint, flooring, and the details that make a space feel done.' },
      { id: 'svc-5', icon: 'wrench', title: 'Repairs & restoration', description: 'Fast, tidy fixes for water, storm, and everyday wear-and-tear damage.' },
      { id: 'svc-6', icon: 'trees', title: 'Decks & outdoor living', description: 'Durable decks, patios, and pergolas built for the long haul.' },
    ],
  },
  howItWorks: {
    enabled: true,
    title: 'How it works',
    intro: 'A simple, predictable process from the first call to the final walkthrough.',
    steps: [
      { id: 'step-1', title: 'Free consultation', description: 'Tell us about your project and we visit to measure and listen.' },
      { id: 'step-2', title: 'Clear written quote', description: 'You get a detailed, fixed quote — no vague ranges or hidden fees.' },
      { id: 'step-3', title: 'We build it', description: 'One accountable crew, a tidy job site, and updates the whole way.' },
      { id: 'step-4', title: 'Final walkthrough', description: 'We walk it together, and we are not done until you are happy.' },
    ],
  },
  showcase: {
    enabled: true,
    title: 'Featured projects',
    intro: 'A look at recent work — new builds, remodels, and outdoor spaces.',
    navLabel: 'Our work',
    layout: 'featured',
    items: STOCK_SITE_IMAGES.slice(0, 6),
  },
  projectShowcase: { enabled: true, eyebrow: 'Recent work', title: 'See our craft', style: 'coverflow', items: STOCK_SITE_IMAGES.slice(0, 6) },
  stats: {
    enabled: true,
    title: 'By the numbers',
    items: [
      { id: 'stat-1', value: '450+', label: 'Projects completed' },
      { id: 'stat-2', value: '18', label: 'Years in business' },
      { id: 'stat-3', value: '5.0', label: 'Average review score' },
      { id: 'stat-4', value: '100%', label: 'Licensed & insured' },
    ],
  },
  testimonials: {
    enabled: true,
    title: 'What homeowners say',
    sourceMode: 'manual',
    displayStyle: 'grid',
    items: [
      { id: 'tst-1', author: 'Marissa T.', text: 'They finished our kitchen a week early and treated the house like their own — spotless every night.', rating: 5, label: 'Kitchen remodel' },
      { id: 'tst-2', author: 'David R.', text: 'Clear quote, no surprise charges, and the quality is genuinely excellent. Already booked them for phase two.', rating: 5, label: 'Home addition' },
      { id: 'tst-3', author: 'Priya S.', text: 'Communication was the best part — I always knew what was happening and when. Highly recommend.', rating: 5, label: 'Bathroom renovation' },
      { id: 'tst-4', author: 'Andre K.', text: 'A storm took out our back deck; they rebuilt it better than before and handled the whole insurance side.', rating: 5, label: 'Deck rebuild' },
      { id: 'tst-5', author: 'Jenna M.', text: 'Professional from the first call. Fair pricing and the finish work is flawless.', rating: 5, label: 'Interior finishing' },
      { id: 'tst-6', author: 'Carlos V.', text: 'On time, on budget, and easy to work with. That is rare — we will absolutely use them again.', rating: 5, label: 'Full home build' },
    ],
  },
  faqs: {
    enabled: true,
    title: 'Frequently asked questions',
    items: [
      { id: 'faq-1', question: 'Are you licensed and insured?', answer: 'Yes — fully licensed, bonded, and insured. We are happy to share our certificate of insurance before any work begins.' },
      { id: 'faq-2', question: 'How do estimates work?', answer: 'Estimates are free and no-obligation. We visit, measure, and give you a clear written quote — no surprises later.' },
      { id: 'faq-3', question: 'How long will my project take?', answer: 'It depends on scope, but you will get a realistic timeline up front and regular updates as we go.' },
      { id: 'faq-4', question: 'Do you handle permits?', answer: 'We pull the required permits and coordinate inspections so you do not have to chase paperwork.' },
      { id: 'faq-5', question: 'What areas do you serve?', answer: 'We work throughout Riverton and the surrounding communities. Reach out and we will confirm we cover your address.' },
    ],
  },
  serviceAreas: {
    enabled: true,
    title: 'Areas we serve',
    intro: 'Proudly serving Riverton and the surrounding communities.',
    cities: ['Riverton', 'Oakdale', 'Fairview', 'Millbrook', 'Cedar Springs', 'Westport', 'Lakeside', 'Brookhaven'],
  },
  blog: {
    enabled: true,
    title: 'From the blog',
    layout: 'grid',
    posts: [
      { id: 'post-1', title: 'How to budget for a kitchen remodel', excerpt: 'The real cost drivers — and where you can save without regretting it.', coverImage: STOCK_SITE_IMAGES[4].url, status: 'published', date: '2026-06-02', body: 'A kitchen remodel budget usually breaks down into cabinetry, countertops, appliances, and labor. Knowing which of those you can flex on — and which you cannot — is the difference between a project that feels worth it and one that does not.\n\nWe walk every client through a line-item quote so there are no surprises halfway through.' },
      { id: 'post-2', title: '5 signs your deck needs replacing', excerpt: 'Catch these early and you can avoid a much bigger repair bill.', coverImage: STOCK_SITE_IMAGES[0].url, status: 'published', date: '2026-05-14', body: 'Soft or spongy boards, wobbly railings, rusted fasteners, and widespread rot are all signs your deck is past a simple repair. Left alone, they become a safety issue.\n\nA quick inspection tells you whether a refinish will do or a rebuild is the smarter long-term call.' },
      { id: 'post-3', title: 'Permits explained: what actually needs one', excerpt: 'A plain-English guide so your project does not get red-tagged.', coverImage: STOCK_SITE_IMAGES[2].url, status: 'published', date: '2026-04-28', body: 'Structural changes, new electrical or plumbing, additions, and most decks over a certain height need a permit. Cosmetic work like paint or flooring usually does not.\n\nWe handle the paperwork and inspections for you, so the job is done right and on the record.' },
    ],
  },
};

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
  content: DEMO_CONTENT,
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