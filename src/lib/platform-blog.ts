import { createAdminClient } from '@/lib/supabase-admin';

export interface PlatformBlogAuthor {
  name: string;
  role: string;
  avatarUrl?: string;
  bio?: string;
}

export type PlatformBlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string; id?: string }
  | { type: 'h3'; text: string; id?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; title?: string; text: string; kind?: 'info' | 'warning' | 'tip' }
  | { type: 'quote'; quote: string; author?: string };

export interface PlatformBlogLink {
  href: string;
  label: string;
  blurb: string;
}

export interface PlatformBlogPost {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  category: string;
  author: PlatformBlogAuthor;
  coverImage?: string;
  coverAlt?: string;
  readMinutes: number;
  datePublished: string; // ISO date YYYY-MM-DD
  dateModified?: string;
  status: 'published' | 'draft' | 'scheduled';
  tags: string[];
  blocks: PlatformBlogBlock[];
  featured?: boolean;
  targetKeyword?: string;
  featureLinks?: PlatformBlogLink[];
}

export const BLOG_CATEGORIES = [
  'Software Economics',
  'Lead Acquisition',
  'Speed-to-Lead',
  'Cash Flow & Margin',
  'Reputation & SEO',
  'Operations & Crew',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const DEFAULT_AUTHOR: PlatformBlogAuthor = {
  name: 'Brett',
  role: "Founder, Let's Get Quoted",
  avatarUrl: '/apple-icon.png',
  bio: 'Building modern business tools for independent trade contractors without monthly subscription bloat.',
};

/**
 * High-impact Wave 1 editorial articles pre-loaded for the public blog.
 */
export const SEED_BLOG_POSTS: PlatformBlogPost[] = [
  {
    id: 'post-per-seat-trap',
    slug: 'per-seat-software-trap-field-crew',
    title: 'The Per-Seat Trap: Why Adding Field Crew Shouldn’t Hike Your Software Bill',
    subtitle: 'Hiring an apprentice or helper shouldn’t cost you $40/month in extra software licensing.',
    excerpt:
      'Legacy contractor software charges by the head. When you hire apprentices or helpers, your software bill explodes. Here is why per-seat pricing penalizes trade growth and how to avoid it.',
    category: 'Software Economics',
    author: DEFAULT_AUTHOR,
    readMinutes: 6,
    datePublished: '2026-09-12',
    dateModified: '2026-09-13',
    status: 'published',
    featured: true,
    tags: ['software pricing', 'contractor overhead', 'field crew', 'margins'],
    targetKeyword: 'field service management per seat pricing',
    blocks: [
      {
        type: 'p',
        text: 'You finally win enough work to bring on an apprentice or an extra helper. You celebrate the growth, buy their uniforms, and then log into your field service software to get them on the dispatch calendar. That’s when the reality of modern SaaS kicks in: an extra $29 to $49 every single month, just for granting them an app login.',
      },
      {
        type: 'h2',
        text: 'The fundamental flaw of per-seat software pricing',
        id: 'fundamental-flaw',
      },
      {
        type: 'p',
        text: 'Per-seat pricing was designed for corporate accounting firms and law offices where every worker sits at a desk using spreadsheets all day. In the trades, labor is physical, seasonal, and variable. A junior helper who only looks at the schedule twice a day shouldn’t cost the same software fee as your lead sales estimator.',
      },
      {
        type: 'callout',
        kind: 'warning',
        title: 'The Math Behind Seat Bloat',
        text: 'A contractor with 6 field crew members paying $350/mo on Jobber or ServiceTitan pays over $4,200 annually just to keep employees on the dispatch roster — whether jobs are booked or winter weather halts exterior work.',
      },
      {
        type: 'h2',
        text: 'How contractors get trapped into software rationing',
        id: 'software-rationing',
      },
      {
        type: 'p',
        text: 'When software charges per user, contractors start rationing accounts. They share passwords across three trucks, screenshot customer addresses over WhatsApp, or write timesheets on scraps of 2x4. Password sharing leads to security issues, broken audit trails, and customer miscommunication.',
      },
      {
        type: 'ul',
        items: [
          'Shared credentials make it impossible to know which tech marked a job complete or took a deposit.',
          'Employees leaving the company still have access to customer records until passwords get reset.',
          'Field staff don’t have access to live job attachments, photos, or change orders.',
        ],
      },
      {
        type: 'h2',
        text: 'Performance-aligned pricing vs. fixed seat penalties',
        id: 'performance-aligned-pricing',
      },
      {
        type: 'p',
        text: 'Software should scale with your revenue, not your head count. If you have a slow weather week in January, your software bill should decrease. When you ramp up crew for a busy summer roofing season, you shouldn’t be penalized for creating jobs.',
      },
      {
        type: 'p',
        text: 'At Let’s Get Quoted, we built the platform on an entirely different economic premise: every plan, starting from our $0/month Flex tier, includes unlimited crew members and unlimited dispatch logins. You only pay a small platform fee when you actually collect money from customers.',
      },
    ],
    featureLinks: [
      {
        href: '/pricing',
        label: 'Zero Per-Seat Software Fees',
        blurb: 'Add as many helpers and field technicians as you need without extra monthly user fees.',
      },
      {
        href: '/features/crew',
        label: 'Crew GPS & Dispatch Workbench',
        blurb: 'Live location tracking, geofenced timesheets, and mobile dispatch portals.',
      },
    ],
  },
  {
    id: 'post-shared-lead-trap',
    slug: 'shared-lead-trap-angie-thumbtack-margins',
    title: 'The Shared Lead Trap: Why Buying from Angie & Thumbtack Destroys Contractor Margins',
    subtitle: 'Paying $90 for a lead sold to 4 other contractors in the same minute forces a race to the bottom.',
    excerpt:
      'Shared lead marketplaces sell the exact same homeowner contact info to 4–5 contractors at once. Here is the true economic cost and how to build owned lead capture.',
    category: 'Lead Acquisition',
    author: DEFAULT_AUTHOR,
    readMinutes: 7,
    datePublished: '2026-09-10',
    status: 'published',
    featured: false,
    tags: ['lead generation', 'angie', 'thumbtack', 'marketing', 'local seo'],
    targetKeyword: 'why stop buying shared leads',
    blocks: [
      {
        type: 'p',
        text: 'Every contractor has felt the sting: your phone buzzes with a new lead notification from a lead broker. You drop your tape measure, race to call the customer, and the homeowner sighs: “You’re the fourth person who called me in the last three minutes.”',
      },
      {
        type: 'h2',
        text: 'The unit economics of shared lead brokers',
        id: 'unit-economics',
      },
      {
        type: 'p',
        text: 'Lead aggregators like Angie, HomeAdvisor, and Thumbtack do not make money by helping you build a sustainable local brand. They make money by monetizing homeowner search intent as many times as possible. If a homeowner requests a quote for a water heater replacement, that single lead is sold to four or five different contractors at $60–$120 each.',
      },
      {
        type: 'quote',
        quote:
          'When five contractors bid on the same homeowner within 10 minutes, the customer stops asking about quality, warranty, or reputation — they pick the lowest number.',
        author: 'Let’s Get Quoted Contractor Survey',
      },
      {
        type: 'h2',
        text: 'The 3-pillar owned lead capture strategy',
        id: 'owned-lead-capture',
      },
      {
        type: 'p',
        text: 'To escape the shared lead treadmill, you must build exclusive inbound pipelines where prospective customers contact only your business:',
      },
      {
        type: 'ul',
        items: [
          'High-converting SEO website with instant ballpark estimates: Give homeowners immediate clarity so they don’t need to browse marketplaces.',
          'Google Maps 3-Pack prominence: Built-in Schema.org LocalBusiness markup and authentic post-job review collection.',
          'Neighborhood proximity halo: When working on a street, notify nearby homeowners with verified local job alerts.',
        ],
      },
      {
        type: 'p',
        text: 'Every Let’s Get Quoted account comes with a free, high-performance contractor website loaded with interactive estimate calculators, custom domain support, and automated review collection that drives direct, exclusive inquiries.',
      },
    ],
    featureLinks: [
      {
        href: '/features/website-builder',
        label: 'Free High-Converting Contractor Website',
        blurb: 'Turn local search visitors into exclusive, qualified leads with instant estimate calculators.',
      },
      {
        href: '/features/reviews',
        label: 'Automated Google Review Collection',
        blurb: 'Earn authentic 5-star reviews to dominate the Google Maps 3-Pack.',
      },
    ],
  },
  {
    id: 'post-after-hours-intake',
    slug: 'after-hours-intake-8pm-homeowner',
    title: 'The 8:00 PM Homeowner: How After-Hours Digital Intake Captures High-Ticket Jobs',
    subtitle: 'Over 48% of home improvement research happens between 7:00 PM and 11:00 PM.',
    excerpt:
      'Homeowners don’t browse for contractors during your work hours. They research from their couch in the evening. Here is how 24/7 AI intake wins quotes while you sleep.',
    category: 'Speed-to-Lead',
    author: DEFAULT_AUTHOR,
    readMinutes: 5,
    datePublished: '2026-09-08',
    status: 'published',
    featured: false,
    tags: ['speed to lead', 'ai receptionist', 'intake', 'customer experience'],
    targetKeyword: 'after hours contractor lead capture',
    blocks: [
      {
        type: 'p',
        text: 'When a homeowner notices a damp spot on their ceiling or decides their master bath needs a remodel, they don’t call contractors at 10:00 AM on Tuesday — they’re busy at work. They research at 8:30 PM with a laptop on the sofa.',
      },
      {
        type: 'h2',
        text: 'The graveyard of the “Contact Us” form',
        id: 'contact-us-graveyard',
      },
      {
        type: 'p',
        text: 'If your website only has a static contact form that says “We’ll get back to you in 2 business days,” the homeowner will leave your site and find a competitor who provides immediate interaction. Instant feedback satisfies the shopper’s urgency.',
      },
      {
        type: 'callout',
        kind: 'tip',
        title: 'The Power of Ballpark Calculations',
        text: 'Providing an interactive estimated range (e.g. $4,200 – $5,800 based on square footage and materials) establishes instant trust without locking you into an uninspected bid.',
      },
      {
        type: 'h2',
        text: 'Combining 24/7 web intake with AI voice reception',
        id: 'ai-voice-reception',
      },
      {
        type: 'p',
        text: 'Capturing after-hours leads requires two channels working in harmony: digital interactive scoping on your website, and an AI voice receptionist answering emergency night calls on the first ring. If someone’s basement is flooding at 9:00 PM, they won’t wait for morning email.',
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted gives you both: an AI-driven website with instant estimate widgets, and a dedicated 24/7 AI Receptionist that triages calls, captures project details, and sends direct booking links.',
      },
    ],
    featureLinks: [
      {
        href: '/features/ai-voice',
        label: '24/7 AI Phone Receptionist',
        blurb: 'Answer every after-hours call, filter spam, and triage emergencies to your mobile phone.',
      },
      {
        href: '/features/ai-intake',
        label: 'Smart Lead Scoring & Intake',
        blurb: 'Qualify after-hours web requests and collect project photos automatically.',
      },
    ],
  },
  {
    id: 'post-zero-conflict-change-order',
    slug: 'zero-conflict-change-orders-contractor-guide',
    title: 'The Zero-Conflict Change Order: How to Price Mid-Project Scope Creep and Get Paid',
    subtitle: 'Stop giving away free labor on “while you’re here” customer requests.',
    excerpt:
      'Homeowners love asking for extra fixes mid-job, but verbal agreements lead to billing disputes. Here is the text-to-approve change order protocol that protects your profit.',
    category: 'Cash Flow & Margin',
    author: DEFAULT_AUTHOR,
    readMinutes: 6,
    datePublished: '2026-09-05',
    status: 'published',
    featured: false,
    tags: ['change orders', 'cash flow', 'margin', 'pricing'],
    targetKeyword: 'contractor change order process',
    blocks: [
      {
        type: 'p',
        text: '“Hey, while you have the floor open, could you also swap out the plumbing under the sink?” It sounds simple, polite, and reasonable. But without a written, signed change order before you touch the pipes, that five-minute favor turns into an unpaid dispute on the final invoice.',
      },
      {
        type: 'h2',
        text: 'Why verbal change orders fail every time',
        id: 'why-verbal-fails',
      },
      {
        type: 'p',
        text: 'Contractors often hesitate to break out paper forms mid-day because it feels confrontational. But homeowners experience selective memory: by the time the final bill arrives with an extra $450 for the sink, they remember it as “something the crew tossed in for free.”',
      },
      {
        type: 'h2',
        text: 'The 3-minute text-to-approve protocol',
        id: 'text-to-approve',
      },
      {
        type: 'ul',
        items: [
          'Pause before starting the work: Never buy parts or turn a wrench until approval is recorded.',
          'Send a digital change order text: An itemized line item showing the scope adjustment and the exact dollar difference.',
          'One-tap digital approval: The homeowner approves and e-signs directly on their mobile phone in 10 seconds.',
        ],
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted enables instant mobile change orders. Technicians or owners can append an itemized add-on to an active job record, which immediately texts the customer an interactive approval link with card-on-file billing.',
      },
    ],
    featureLinks: [
      {
        href: '/features/quotes',
        label: 'Digital Quotes & Change Orders',
        blurb: 'Amend active job quotes on mobile with instant e-signatures.',
      },
      {
        href: '/features/payments',
        label: 'Card-on-File Billing',
        blurb: 'Automatically collect approved change order balances without chasing checks.',
      },
    ],
  },
];

// In-memory store for runtime post modifications in environments without DB tables
const memoryPostStore = new Map<string, PlatformBlogPost>();

// Initialize memory store with seed posts
for (const post of SEED_BLOG_POSTS) {
  memoryPostStore.set(post.id, { ...post });
}

export interface ListBlogOptions {
  status?: 'all' | 'published' | 'draft' | 'scheduled';
  category?: string;
  search?: string;
  tag?: string;
  limit?: number;
}

/**
 * Synchronous in-memory lookup for static generation, sitemap, and test runner.
 */
export function getPlatformBlogPostsSync(options: ListBlogOptions = {}): PlatformBlogPost[] {
  const { status = 'published', category, search, tag, limit } = options;
  const allPosts = Array.from(memoryPostStore.values()).sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  let filtered = allPosts;
  if (status !== 'all') {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (category) {
    filtered = filtered.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  filtered = filterPosts(filtered, { search, tag });

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

/**
 * Fetch blog posts, reading from Supabase table `platform_blog_posts` if present,
 * otherwise falling back cleanly to in-memory/seed catalog.
 */
export async function getPlatformBlogPosts(options: ListBlogOptions = {}): Promise<PlatformBlogPost[]> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostsSync(options);
  }

  const { status = 'published', category, search, tag, limit } = options;

  try {
    const admin = createAdminClient();
    let query = admin
      .from('platform_blog_posts')
      .select('*')
      .order('date_published', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      const posts: PlatformBlogPost[] = data.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle || undefined,
        excerpt: row.excerpt,
        category: row.category,
        author: (row.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: row.cover_image || undefined,
        coverAlt: row.cover_alt || undefined,
        readMinutes: row.read_minutes || 5,
        datePublished: row.date_published,
        dateModified: row.date_modified || undefined,
        status: row.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(row.tags) ? row.tags : [],
        blocks: Array.isArray(row.blocks) ? row.blocks : [],
        featured: Boolean(row.featured),
        targetKeyword: row.target_keyword || undefined,
        featureLinks: Array.isArray(row.feature_links) ? row.feature_links : [],
      }));

      // Apply in-memory search and tag filter if needed
      return filterPosts(posts, { search, tag });
    }
  } catch {
    // Database read fallback
  }

  // Resilient fallback to memory/seed posts
  const allPosts = Array.from(memoryPostStore.values()).sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  let filtered = allPosts;
  if (status !== 'all') {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (category) {
    filtered = filtered.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  filtered = filterPosts(filtered, { search, tag });

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

function filterPosts(
  posts: PlatformBlogPost[],
  opts: { search?: string; tag?: string },
): PlatformBlogPost[] {
  let res = posts;
  if (opts.search) {
    const q = opts.search.toLowerCase().trim();
    res = res.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (opts.tag) {
    const t = opts.tag.toLowerCase().trim();
    res = res.filter((p) => p.tags.some((item) => item.toLowerCase() === t));
  }
  return res;
}

/**
 * Synchronous slug lookup from memory store.
 */
export function getPlatformBlogPostBySlugSync(
  slug: string,
  options: { preview?: boolean } = {},
): PlatformBlogPost | undefined {
  const cleanSlug = slug.toLowerCase().trim();
  const post = Array.from(memoryPostStore.values()).find((p) => p.slug === cleanSlug);
  if (!post) return undefined;
  if (!options.preview && post.status !== 'published') return undefined;
  return post;
}

/**
 * Synchronous id lookup from memory store.
 */
export function getPlatformBlogPostByIdSync(id: string): PlatformBlogPost | undefined {
  return memoryPostStore.get(id);
}

/**
 * Find a blog post by its URL slug.
 */
export async function getPlatformBlogPostBySlug(
  slug: string,
  options: { preview?: boolean } = {},
): Promise<PlatformBlogPost | undefined> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostBySlugSync(slug, options);
  }

  const cleanSlug = slug.toLowerCase().trim();

  try {
    const admin = createAdminClient();
    let query = admin.from('platform_blog_posts').select('*').eq('slug', cleanSlug);

    if (!options.preview) {
      query = query.eq('status', 'published');
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle || undefined,
        excerpt: data.excerpt,
        category: data.category,
        author: (data.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: data.cover_image || undefined,
        coverAlt: data.cover_alt || undefined,
        readMinutes: data.read_minutes || 5,
        datePublished: data.date_published,
        dateModified: data.date_modified || undefined,
        status: data.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(data.tags) ? data.tags : [],
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        featured: Boolean(data.featured),
        targetKeyword: data.target_keyword || undefined,
        featureLinks: Array.isArray(data.feature_links) ? data.feature_links : [],
      };
    }
  } catch {
    // Database lookup fallback
  }

  return getPlatformBlogPostBySlugSync(cleanSlug, options);
}

/**
 * Find a blog post by internal ID (for admin editing).
 */
export async function getPlatformBlogPostById(id: string): Promise<PlatformBlogPost | undefined> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostByIdSync(id);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('platform_blog_posts').select('*').eq('id', id).maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle || undefined,
        excerpt: data.excerpt,
        category: data.category,
        author: (data.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: data.cover_image || undefined,
        coverAlt: data.cover_alt || undefined,
        readMinutes: data.read_minutes || 5,
        datePublished: data.date_published,
        dateModified: data.date_modified || undefined,
        status: data.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(data.tags) ? data.tags : [],
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        featured: Boolean(data.featured),
        targetKeyword: data.target_keyword || undefined,
        featureLinks: Array.isArray(data.feature_links) ? data.feature_links : [],
      };
    }
  } catch {
    // Fallback
  }

  return getPlatformBlogPostByIdSync(id);
}

/**
 * Save (create or update) a blog post.
 */
export async function savePlatformBlogPost(post: PlatformBlogPost): Promise<PlatformBlogPost> {
  const now = new Date().toISOString().slice(0, 10);
  const updatedPost: PlatformBlogPost = {
    ...post,
    dateModified: now,
  };

  try {
    const admin = createAdminClient();
    const row = {
      id: updatedPost.id,
      slug: updatedPost.slug,
      title: updatedPost.title,
      subtitle: updatedPost.subtitle ?? null,
      excerpt: updatedPost.excerpt,
      category: updatedPost.category,
      author: updatedPost.author,
      cover_image: updatedPost.coverImage ?? null,
      cover_alt: updatedPost.coverAlt ?? null,
      read_minutes: updatedPost.readMinutes,
      date_published: updatedPost.datePublished,
      date_modified: updatedPost.dateModified ?? now,
      status: updatedPost.status,
      tags: updatedPost.tags,
      blocks: updatedPost.blocks,
      featured: Boolean(updatedPost.featured),
      target_keyword: updatedPost.targetKeyword ?? null,
      feature_links: updatedPost.featureLinks ?? [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from('platform_blog_posts').upsert(row);
    if (error) {
      console.warn('Could not write blog post to Supabase platform_blog_posts:', error.message);
    }
  } catch (err) {
    console.warn('Supabase upsert failed, retaining in memory store:', err);
  }

  memoryPostStore.set(updatedPost.id, updatedPost);
  return updatedPost;
}

/**
 * Delete a blog post.
 */
export async function deletePlatformBlogPost(id: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    await admin.from('platform_blog_posts').delete().eq('id', id);
  } catch {
    // Ignore DB error and proceed
  }
  return memoryPostStore.delete(id);
}

/**
 * Find related articles for an article.
 */
export async function getRelatedPlatformBlogPosts(
  slug: string,
  limit = 3,
): Promise<PlatformBlogPost[]> {
  const all = await getPlatformBlogPosts({ status: 'published' });
  const current = all.find((p) => p.slug === slug);
  if (!current) return all.slice(0, limit);

  return all
    .filter((p) => p.slug !== slug)
    .sort((a, b) => {
      const aSameCat = a.category === current.category ? 0 : 1;
      const bSameCat = b.category === current.category ? 0 : 1;
      if (aSameCat !== bSameCat) return aSameCat - bSameCat;
      return b.datePublished.localeCompare(a.datePublished);
    })
    .slice(0, limit);
}

/**
 * Helper to generate RSS 2.0 XML.
 */
export async function generateBlogRssXml(origin = 'https://letsgetquoted.com'): Promise<string> {
  const posts = await getPlatformBlogPosts({ status: 'published' });
  const nowRfc822 = new Date().toUTCString();

  const itemsXml = posts
    .map((post) => {
      const postUrl = `${origin}/blog/${post.slug}`;
      const pubDate = new Date(`${post.datePublished}T12:00:00Z`).toUTCString();
      const escapedTitle = escapeXml(post.title);
      const escapedExcerpt = escapeXml(post.excerpt);
      const author = escapeXml(post.author.name);
      const category = escapeXml(post.category);

      return `    <item>
      <title>${escapedTitle}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description>${escapedExcerpt}</description>
      <pubDate>${pubDate}</pubDate>
      <author>${author}</author>
      <category>${category}</category>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Let's Get Quoted Contractor Blog</title>
    <link>${origin}/blog</link>
    <description>Practical, no-fluff playbooks for trade contractors: cash flow, quoting, crew operations, speed-to-lead, and local SEO.</description>
    <language>en-us</language>
    <lastBuildDate>${nowRfc822}</lastBuildDate>
    <atom:link href="${origin}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
