import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { SiteImage } from '@/lib/site-images';
import type { Site, TemplateType } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';

// Build a stock SiteImage from a bare Unsplash photo id. Every id below was
// pulled from an Unsplash trade search and verified to return HTTP 200 with
// these exact params, so the demos hotlink real, trade-relevant photography.
const img = (
  id: string,
  alt: string,
  category: SiteImage['category'],
  caption?: string,
): SiteImage => ({
  id: `demo-${id}`,
  url: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1800&q=85`,
  alt,
  category,
  source: 'stock',
  ...(caption ? { caption } : {}),
});

type DemoService = { id: string; icon: string; title: string; description: string };

type ThemeDemo = {
  company: string;
  city: string;
  accent: string;
  eyebrow: string;
  headline: string;
  tagline: string;
  servicesTitle: string;
  services: DemoService[];
  photos: SiteImage[];
};

// Per-theme branding map. The rich sections (how-it-works, stats, reviews, FAQs,
// badges) are shared and trade-neutral; each theme layers its own business
// identity + trade-specific services + trade photography on top so every
// /themes/<id> reads like a real, distinct company instead of one generic demo.
const THEME_DEMOS: Record<string, ThemeDemo> = {
  // carbon = Forge (industrial dark) → tree removal
  carbon: {
    company: 'Timberline Tree & Land',
    city: 'Riverton',
    accent: '#5aa469',
    eyebrow: 'Tree & land services',
    headline: 'Big trees down safely.',
    tagline: 'Licensed arborists for removals, trimming, and storm cleanup — with every branch hauled away.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'tree', title: 'Tree removal', description: 'Safe, controlled takedowns of any size — right down to the stump.' },
      { id: 'svc-2', icon: 'axe', title: 'Trimming & pruning', description: 'Shape and thin canopies to keep trees healthy, safe, and off the roof.' },
      { id: 'svc-3', icon: 'treestump', title: 'Stump grinding', description: 'Ground-level stump removal so you get the full yard back.' },
      { id: 'svc-4', icon: 'chainsaw', title: 'Emergency storm work', description: 'Fast response for fallen and hazardous limbs, day or night.' },
      { id: 'svc-5', icon: 'truck', title: 'Lot & land clearing', description: 'Clear brush and trees for builds, fences, and fresh starts.' },
      { id: 'svc-6', icon: 'leaf', title: 'Cleanup & hauling', description: 'We haul every branch and chip away — cleaner than we found it.' },
    ],
    photos: [
      img('1657730391002-bf55ff069a80', 'Arborist high in a tree with a chainsaw', 'craft', 'Precision removals'),
      img('1574359173269-291f060e6fe1', 'Felled logs stacked after a clearing job', 'exterior', 'Land clearing'),
      img('1608682783991-ca8bd491fad2', 'Chainsaw cutting through a large trunk', 'craft', 'Storm cleanup'),
      img('1621532860549-e5ebe6da26b6', 'Tall trees against an open sky', 'exterior', 'Trimming & pruning'),
    ],
  },
  // professional = Guild (refined) → lawn care & landscaping
  professional: {
    company: 'Emerald Edge Landscape',
    city: 'Oakdale',
    accent: '#2f9e5c',
    eyebrow: 'Lawn & landscape',
    headline: 'A lawn the whole street slows down for.',
    tagline: 'Full-service lawn care and landscaping on a schedule you can set and forget.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'scissors', title: 'Mowing & edging', description: 'Crisp, striped cuts on a schedule you never have to think about.' },
      { id: 'svc-2', icon: 'sprout', title: 'Fertilization & weed control', description: 'Season-long programs for a thick, green, weed-free lawn.' },
      { id: 'svc-3', icon: 'leafyGreen', title: 'Landscape design', description: 'Beds, borders, and plantings designed for your yard and light.' },
      { id: 'svc-4', icon: 'shrub', title: 'Trimming & hedges', description: 'Shaped shrubs and clean hedge lines that hold their form.' },
      { id: 'svc-5', icon: 'shovel', title: 'Mulch & bed refresh', description: 'Fresh mulch and edged beds that make the whole yard pop.' },
      { id: 'svc-6', icon: 'clover', title: 'Aeration & overseeding', description: 'Loosen compacted soil and overseed for a fuller lawn.' },
    ],
    photos: [
      img('1458245201577-fc8a130b8829', 'Freshly mowed striped green lawn', 'exterior', 'Mowing & edging'),
      img('1605117882932-f9e32b03fea9', 'Landscaped garden beds and greenery', 'exterior', 'Landscape design'),
      img('1629575063988-881596e38d31', 'Manicured backyard with lawn and plantings', 'exterior', 'Full-service care'),
      img('1526392587392-d1627b6c134a', 'Lush green grass close up', 'exterior', 'Fertilization'),
    ],
  },
  // modern = Vista (sleek) → roofing
  modern: {
    company: 'Apex Roofing Co.',
    city: 'Fairview',
    accent: '#2f6fd0',
    eyebrow: 'Roofing done right',
    headline: 'A roof that shrugs off whatever the sky sends.',
    tagline: 'Replacements, repairs, and storm damage handled by a licensed local crew.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'home', title: 'Roof replacement', description: 'Full tear-offs and new roofs built to shrug off the weather.' },
      { id: 'svc-2', icon: 'wrench', title: 'Roof repair', description: 'Fast fixes for leaks, missing shingles, and storm damage.' },
      { id: 'svc-3', icon: 'shield', title: 'Inspections & maintenance', description: 'Catch small problems before they turn into expensive ones.' },
      { id: 'svc-4', icon: 'droplets', title: 'Gutters & drainage', description: 'Seamless gutters and guards that move water away from the house.' },
      { id: 'svc-5', icon: 'sun', title: 'Skylights & ventilation', description: 'Better airflow and natural light, sealed watertight.' },
      { id: 'svc-6', icon: 'layers', title: 'Flat & metal roofing', description: 'Durable low-slope and standing-seam systems done right.' },
    ],
    photos: [
      img('1635424824849-1b09bdcc55b1', 'Roofer installing shingles on a new roof', 'craft', 'Roof replacement'),
      img('1590365876016-da05ac533e83', 'Rooftop with new shingles under blue sky', 'exterior', 'New roofs'),
      img('1633759593085-1eaeb724fc88', 'Close up of roof shingle detail work', 'craft', 'Repairs'),
      img('1635424709845-3a85ad5e1f5e', 'Roofing crew working on a house roof', 'craft', 'Licensed crew'),
    ],
  },
  // handy = Haven (friendly handyman) → handyman
  handy: {
    company: 'Neighborly Home Repair',
    city: 'Millbrook',
    // Haven's whole palette (text, gradients, bands) is teal-derived — an orange
    // accent runs muddy through it, so the demo uses Haven's native teal.
    accent: '#10b0b8',
    eyebrow: 'Handyman services',
    headline: 'Your whole to-do list, handled by one trusted pro.',
    tagline: 'From mounting to minor repairs — the odd jobs you never get to, done in one visit.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'wrench', title: 'General repairs', description: 'The whole to-do list handled by one accountable pro.' },
      { id: 'svc-2', icon: 'drill', title: 'Mounting & assembly', description: 'TVs, shelves, furniture, and fixtures hung level and solid.' },
      { id: 'svc-3', icon: 'droplet', title: 'Small plumbing fixes', description: 'Leaky faucets, running toilets, and clogs — sorted fast.' },
      { id: 'svc-4', icon: 'lightbulb', title: 'Light electrical', description: 'Fixtures, switches, and outlets swapped out safely.' },
      { id: 'svc-5', icon: 'roller', title: 'Drywall & touch-ups', description: 'Patch, sand, and paint so walls look new again.' },
      { id: 'svc-6', icon: 'home', title: 'Doors & trim', description: 'Sticking doors, loose trim, and hardware made right.' },
    ],
    photos: [
      img('1581783898377-1c85bf937427', 'Handyman with a tool belt and drill', 'craft', 'General repairs'),
      img('1505798577917-a65157d3320a', 'Assorted hand tools on a workbench', 'craft', 'Every odd job'),
      img('1562259929-b4e1fd3aef09', 'Worker fixing a fixture indoors', 'interior', 'Mounting & assembly'),
      img('1523413363574-c30aa1c2a516', 'Tools and hardware laid out for a repair', 'craft', 'Done in one visit'),
    ],
  },
  // coat = Foundry → painting
  coat: {
    company: 'TrueCoat Painting Co.',
    city: 'Cedar Springs',
    accent: '#4a5fd0',
    eyebrow: 'Interior & exterior painting',
    headline: 'Color that lands crisp and holds for years.',
    tagline: 'Clean lines, tough coatings, and a tidy crew that respects your home.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'roller', title: 'Interior painting', description: 'Crisp walls, ceilings, and trim with clean, lasting lines.' },
      { id: 'svc-2', icon: 'home', title: 'Exterior painting', description: 'Weather-tough coatings that keep their color for years.' },
      { id: 'svc-3', icon: 'brush', title: 'Cabinet refinishing', description: 'A smooth factory-style finish without replacing cabinets.' },
      { id: 'svc-4', icon: 'spray', title: 'Fences & decks', description: 'Stain and seal that protects the wood and looks sharp.' },
      { id: 'svc-5', icon: 'palette', title: 'Color consultation', description: 'Help picking shades that actually work in your light.' },
      { id: 'svc-6', icon: 'sparkles', title: 'Prep & repair', description: 'Patch, caulk, and sand so the finish lands flawless.' },
    ],
    photos: [
      img('1600508774764-4ce704363d66', 'Painter rolling fresh paint on a wall', 'craft', 'Interior painting'),
      img('1530049080396-450947c04fcd', 'Freshly painted bright interior room', 'interior', 'Clean lines'),
      img('1572097000793-d77caa6399b3', 'Paint rollers and color swatches', 'craft', 'Color consultation'),
      img('1603801705834-e653954f39aa', 'Painter cutting in a crisp edge', 'craft', 'Prep & finish'),
    ],
  },
  // fixit = Tinker → plumbing
  fixit: {
    company: 'Mainline Plumbing',
    city: 'Westport',
    accent: '#1a9dd4',
    eyebrow: 'Licensed plumbing',
    headline: 'Fast, tidy plumbing fixes — right the first time.',
    tagline: 'Leaks, water heaters, drains, and emergencies answered by a licensed local plumber.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'droplet', title: 'Leak detection & repair', description: 'Find and fix leaks before they damage your home.' },
      { id: 'svc-2', icon: 'faucet', title: 'Fixtures & faucets', description: 'Install and repair sinks, faucets, and toilets.' },
      { id: 'svc-3', icon: 'flame', title: 'Water heaters', description: 'Repair and replacement for tank and tankless units.' },
      { id: 'svc-4', icon: 'droplets', title: 'Drain cleaning', description: 'Clear stubborn clogs and slow drains for good.' },
      { id: 'svc-5', icon: 'showerhead', title: 'Repipes & remodels', description: 'New lines and rough-ins for baths and kitchens.' },
      { id: 'svc-6', icon: 'wrench', title: 'Emergency plumbing', description: 'Burst pipes and no-water calls answered fast.' },
    ],
    photos: [
      img('1585704032915-c3400ca199e7', 'Plumber working under a sink', 'craft', 'Leak repair'),
      img('1542013936693-884638332954', 'Copper pipes and plumbing fittings', 'craft', 'Repipes'),
      img('1607472586893-edb57bdc0e39', 'Plumber fixing a fixture with a wrench', 'craft', 'Fixtures & faucets'),
      img('1545193329-4a052e14eb8f', 'Plumbing tools and fittings on site', 'craft', 'Emergency service'),
    ],
  },
  // reno = Blueprint → kitchen & bath remodeling
  reno: {
    company: 'Blueprint Remodeling',
    city: 'Lakeside',
    accent: '#b8843a',
    eyebrow: 'Kitchen & bath remodeling',
    headline: 'Kitchens and baths designed around how you live.',
    tagline: 'Full remodels managed end to end — design, build, and finish under one roof.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'home', title: 'Kitchen remodels', description: 'Layouts, cabinetry, and counters shaped around how you cook.' },
      { id: 'svc-2', icon: 'droplet', title: 'Bathroom renovations', description: 'Spa-worthy baths with tile, fixtures, and smart storage.' },
      { id: 'svc-3', icon: 'brickwall', title: 'Cabinetry & counters', description: 'Custom cabinets and stone tops built to fit and last.' },
      { id: 'svc-4', icon: 'layers', title: 'Flooring & tile', description: 'Precise tile and flooring that ties the whole room together.' },
      { id: 'svc-5', icon: 'ruler', title: 'Layout changes', description: 'Open up walls and add the space you actually need.' },
      { id: 'svc-6', icon: 'lightbulb', title: 'Lighting & finishes', description: 'The details that make a remodel feel truly done.' },
    ],
    photos: [
      img('1556912173-46c336c7fd55', 'Modern remodeled kitchen with island', 'kitchen', 'Kitchen remodels'),
      img('1565538810643-b5bdb714032a', 'Renovated kitchen with cabinetry', 'kitchen', 'Cabinetry & counters'),
      img('1601760561441-16420502c7e0', 'Bright finished bathroom renovation', 'interior', 'Bathroom renovations'),
      img('1591924450983-b8f7587ea332', 'Tile and finish detail in a remodel', 'interior', 'Flooring & tile'),
    ],
  },
  // shine = Lustre → pressure washing / exterior cleaning
  shine: {
    company: 'Lustre Exterior Cleaning',
    city: 'Brookhaven',
    accent: '#12b3c2',
    eyebrow: 'Exterior cleaning',
    headline: 'Driveways, decks, and siding brought back to new.',
    tagline: 'Pressure and soft-washing that lifts years of grime without the damage.',
    servicesTitle: 'What we do',
    services: [
      { id: 'svc-1', icon: 'droplets', title: 'Driveways & concrete', description: 'Lift years of grime, oil, and stains from hard surfaces.' },
      { id: 'svc-2', icon: 'home', title: 'House & siding wash', description: 'Gentle soft-washing that brightens siding without damage.' },
      { id: 'svc-3', icon: 'spray', title: 'Decks & patios', description: 'Restore wood and pavers back to like-new.' },
      { id: 'svc-4', icon: 'waves', title: 'Roof & gutter cleaning', description: 'Clear moss, algae, and buildup safely.' },
      { id: 'svc-5', icon: 'sparkles', title: 'Window cleaning', description: 'Streak-free glass, inside and out.' },
      { id: 'svc-6', icon: 'sun', title: 'Fleet & commercial', description: 'Scheduled exterior cleaning that keeps your property sharp.' },
    ],
    photos: [
      img('1592365559101-19adfefdf294', 'Pressure washing a concrete surface clean', 'exterior', 'Driveways & concrete'),
      img('1605146768851-eda79da39897', 'Power washer spraying a hard surface', 'exterior', 'Decks & patios'),
      img('1586501599751-58c582c907d7', 'Exterior surface being cleaned', 'exterior', 'House & siding'),
      img('1663832871970-ce04419ea2ee', 'Pressure washer removing grime', 'craft', 'Like-new results'),
    ],
  },
};

// Shared, trade-neutral sections. Every field here reads correctly for any of
// the trades above; the per-theme map supplies the trade-specific pieces
// (services + photography) that get merged in by buildContent().
const SHARED_CONTENT: Record<string, unknown> = {
  heroBadge: { preset: 'licensed', showStats: true, style: 'soft', secondPreset: 'guarantee' },
  ratingBadge: { enabled: true, rating: 5, reviewCount: 139, sourceLabel: 'Verified reviews' },
  trustBadges: { enabled: true },
  stickyCallBar: { enabled: true, showQuote: true },
  howItWorks: {
    enabled: true,
    title: 'How it works',
    intro: 'A simple, predictable process from the first call to the final walkthrough.',
    steps: [
      { id: 'step-1', title: 'Free consultation', description: 'Tell us about your project and we come out to look and listen.' },
      { id: 'step-2', title: 'Clear written quote', description: 'You get a detailed, fixed quote — no vague ranges or hidden fees.' },
      { id: 'step-3', title: 'We get to work', description: 'One accountable crew, a tidy site, and updates the whole way.' },
      { id: 'step-4', title: 'Final walkthrough', description: 'We walk it together, and we are not done until you are happy.' },
    ],
  },
  stats: {
    enabled: true,
    title: 'By the numbers',
    items: [
      { id: 'stat-1', value: '450+', label: 'Jobs completed' },
      { id: 'stat-2', value: '18', label: 'Years in business' },
      { id: 'stat-3', value: '5.0', label: 'Average review score' },
      { id: 'stat-4', value: '100%', label: 'Licensed & insured' },
    ],
  },
  testimonials: {
    enabled: true,
    title: 'What customers say',
    sourceMode: 'manual',
    displayStyle: 'grid',
    items: [
      { id: 'tst-1', author: 'Marissa T.', text: 'They showed up when they said they would, did exactly what was quoted, and left everything spotless.', rating: 5, label: 'Verified homeowner' },
      { id: 'tst-2', author: 'David R.', text: 'Clear pricing, no surprise charges, and the quality speaks for itself. Already booked them again.', rating: 5, label: 'Repeat customer' },
      { id: 'tst-3', author: 'Priya S.', text: 'Communication was the best part — I always knew what was happening and when.', rating: 5, label: 'Verified homeowner' },
      { id: 'tst-4', author: 'Andre K.', text: 'Fast response and honest advice. They could have upsold me and did not. That earns trust.', rating: 5, label: 'Verified homeowner' },
      { id: 'tst-5', author: 'Jenna M.', text: 'Professional from the first call. Fair price and the results look fantastic.', rating: 5, label: 'Verified homeowner' },
      { id: 'tst-6', author: 'Carlos V.', text: 'On time, on budget, and easy to deal with. That is rare these days — we will use them again.', rating: 5, label: 'Repeat customer' },
    ],
  },
  faqs: {
    enabled: true,
    title: 'Frequently asked questions',
    items: [
      { id: 'faq-1', question: 'Are you licensed and insured?', answer: 'Yes — fully licensed, bonded, and insured. We are happy to share proof before any work begins.' },
      { id: 'faq-2', question: 'How do estimates work?', answer: 'Estimates are free and no-obligation. We look at the job and give you a clear written quote — no surprises later.' },
      { id: 'faq-3', question: 'How soon can you start?', answer: 'For urgent jobs we can often get out same or next day. Either way you will get a realistic date up front.' },
      { id: 'faq-4', question: 'Do you stand behind your work?', answer: 'Always. If something is not right, we come back and make it right — that is the whole point of hiring a local pro.' },
      { id: 'faq-5', question: 'What areas do you serve?', answer: 'We work throughout the local area and surrounding communities. Reach out and we will confirm we cover your address.' },
    ],
  },
  blog: {
    enabled: true,
    title: 'From the blog',
    layout: 'grid',
    posts: [
      { id: 'post-1', title: '5 questions to ask before you hire', excerpt: 'A quick checklist that separates the pros from the risky bets.', status: 'published', date: '2026-06-02', body: 'Before you sign anything, ask whether they are licensed and insured, how they handle change orders, and what their timeline really looks like. The answers tell you a lot.\n\nA good contractor welcomes these questions. If someone gets defensive or vague, that is your answer.' },
      { id: 'post-2', title: 'What a fair written quote includes', excerpt: 'Know exactly what you are paying for — and what should never be vague.', status: 'published', date: '2026-05-14', body: 'A fair quote spells out scope, materials, timeline, and price as fixed line items — not a single hand-wavy number. You should be able to see what each part of the job costs.\n\nWe write every quote this way so there are no surprises halfway through.' },
      { id: 'post-3', title: 'Why the cheapest bid usually costs more', excerpt: 'The hidden price of cutting corners, and how to spot it early.', status: 'published', date: '2026-04-28', body: 'The lowest bid often skips prep, uses cheaper materials, or leaves out steps you only notice later. The redo costs more than doing it right once.\n\nWe price the whole job honestly up front so the number you see is the number you pay.' },
    ],
  },
};

function buildContent(demo: ThemeDemo): Record<string, unknown> {
  const photos = demo.photos;
  return {
    ...SHARED_CONTENT,
    heroEyebrow: demo.eyebrow,
    services: {
      enabled: true,
      title: demo.servicesTitle,
      intro: 'Everything we do, handled by one accountable crew that treats your property like our own.',
      items: demo.services,
    },
    showcase: {
      enabled: true,
      title: 'Featured work',
      intro: 'A look at recent jobs around the area.',
      navLabel: 'Our work',
      layout: 'featured',
      items: photos,
    },
    projectShowcase: { enabled: true, eyebrow: 'Recent work', title: 'See our work', style: 'coverflow', items: photos },
    serviceAreas: {
      enabled: true,
      title: 'Areas we serve',
      intro: `Proudly serving ${demo.city} and the surrounding communities.`,
      cities: [demo.city, 'Oakdale', 'Fairview', 'Millbrook', 'Cedar Springs', 'Westport', 'Lakeside', 'Brookhaven'],
    },
    // Give the shared blog posts trade-relevant cover art from this theme's photos.
    blog: {
      ...(SHARED_CONTENT.blog as Record<string, unknown>),
      posts: (((SHARED_CONTENT.blog as Record<string, unknown>).posts as Record<string, unknown>[]) || []).map(
        (post, i) => ({ ...post, coverImage: photos[i % photos.length].url }),
      ),
    },
  };
}

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
  // The /demo/sites customizer drives these so a prospect can recolor the live
  // preview: accent = a hex; scheme = a COLOR_SCHEMES key ('' = theme default).
  searchParams: { accent?: string; scheme?: string };
};

export default function ThemeDemoPage({ params, searchParams }: ThemeDemoPageProps) {
  const Template = getTemplate(params.template);
  if (!Template) notFound();

  const demo = THEME_DEMOS[params.template] ?? THEME_DEMOS.carbon;
  const accent = /^#[0-9a-fA-F]{6}$/.test(searchParams.accent ?? '') ? searchParams.accent! : demo.accent;
  const scheme = typeof searchParams.scheme === 'string' ? searchParams.scheme : '';
  const site: Site = {
    ...DEMO_SITE,
    template: params.template as TemplateType,
    company_name: demo.company,
    headline: demo.headline,
    tagline: demo.tagline,
    accent_override: accent,
    service_area: `${demo.city} and surrounding communities`,
    hero_url: demo.photos[0].url,
    // getSiteContent (inside the template) validates the scheme key, so an unknown
    // value just falls back to the theme's own palette.
    content: { ...buildContent(demo), colorScheme: scheme },
  };
  return <Template site={site} galleryImages={demo.photos} />;
}

export function generateMetadata({ params }: ThemeDemoPageProps): Metadata {
  // These are internal placeholder demos — keep them out of the index so they
  // don't compete with or dilute real client sites.
  const demo = THEME_DEMOS[params.template];
  return {
    title: demo
      ? `${demo.company} — ${params.template} theme preview | Let's Get Quoted`
      : `${params.template} theme preview | Let's Get Quoted`,
    robots: { index: false, follow: false },
  };
}
