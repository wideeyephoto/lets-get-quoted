import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteContent } from '@/lib/site-content';
import type { EmailThemeId } from '@/emails/brand';
import { DEMO_ACCOUNT_ID, DEMO_COMPANY_NAME, DEMO_SERVICE_AREA, DEMO_SITE_HOST } from '@/lib/demo-data';
import { DEMO_BLOG_POSTS } from '@/lib/demo-rows';

// The 3 curated templates. Legacy sites may still hold a retired id in the DB;
// getTemplate falls those back to Forge, so this narrow type is safe.
export type TemplateType = 'carbon' | 'professional' | 'modern' | 'handy' | 'fresh' | 'nova' | 'aqua' | 'coat' | 'fixit' | 'reno' | 'shine';
export type PortalMode = 'light' | 'dark';

export type Site = {
  id: string;
  account_id: string;
  subdomain: string | null;
  custom_domain: string | null;
  custom_domain_verified_at: string | null;
  published: boolean;

  template: TemplateType;
  header_font: string | null;
  button_style: string | null;
  accent_override: string | null; // hex color like #1f2937
  // Optional in the TypeScript shape so fixtures and a deploy briefly ahead of
  // the migration still behave like legacy rows; the renderer defaults it.
  email_theme?: EmailThemeId;

  company_name: string;
  headline: string | null;
  tagline: string | null;
  phone: string | null;
  license: string | null;
  hours: string | null;
  service_area: string | null;

  logo_url: string | null;
  hero_url: string | null;

  // NOT a DB column — computed at public-site load from real lead response
  // times, for the honest "typically replies within X" badge. Null/absent when
  // there isn't enough data to make an honest claim.
  avg_response_ms?: number | null;
  seo_title: string | null;
  seo_description: string | null;

  sections: Record<string, unknown>;
  content: Record<string, unknown>;
  chrome: Record<string, unknown>;
  reviews_cache: Record<string, unknown> | null;
  portal_mode: PortalMode;

  updated_at: string;
};

// Get or create site for account
export async function getOrCreateSite(
  supabase: SupabaseClient,
  accountId: string
): Promise<Site> {
  // Try to get existing site
  const { data: existing } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (existing) {
    return existing as Site;
  }

  // Defaults come from the first-run answers (see /welcome): the business name,
  // the trade, and the ZIP. Seeding trade + zip into content here is what makes
  // "Generate" in the builder a single click on a brand-new site —
  // generateSiteTextAction reads exactly these two, and a ZIP is authoritative
  // for the city, the SEO title and the service area. Without them the generator
  // is instructed never to invent a location, so the site comes out placeless.
  //
  // Selected defensively: these columns arrive with the terms-acceptance
  // migration, and a site must still be creatable on a deploy that is ahead of
  // it. A failed select just means no seed, not no site.
  const { data: account } = await supabase
    .from('accounts')
    .select('business_name, trade, postal_code')
    .eq('id', accountId)
    .maybeSingle();

  const seed = (account ?? {}) as { business_name?: string | null; trade?: string | null; postal_code?: string | null };
  const content: Record<string, string> = {};
  if (seed.trade) content.trade = seed.trade;
  if (seed.postal_code) content.zip = seed.postal_code;

  // Create default site
  const { data: newSite, error } = await supabase
    .from('sites')
    .insert({
      account_id: accountId,
      template: 'carbon',
      company_name: seed.business_name || 'My Business',
      portal_mode: 'light',
      ...(Object.keys(content).length ? { content } : {}),
    })
    .select('*')
    .single();

  if (error || !newSite) {
    throw error ?? new Error('Failed to create site');
  }

  return newSite as Site;
}

// Get site by ID (with auth check)
export async function getSite(
  supabase: SupabaseClient,
  accountId: string,
  siteId: string
): Promise<Site | null> {
  const { data } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', siteId)
    .maybeSingle();

  return data as Site | null;
}

// Get public site by subdomain (no auth)
// Strips the contractor's phone from a public render when they chose not to
// publish it (content.phonePublic === false). Every template/CTA already
// handles a null phone, so one strip here hides it everywhere — while the
// dashboard and SMS flows keep using the real number.
export function withPublicContact(site: Site): Site {
  return getSiteContent(site.content).phonePublic ? site : { ...site, phone: null };
}

// Honest "typically replies within X" stat: the average time from a website
// lead arriving to the owner's first status change, over recent responded
// leads. Requires ≥3 responses and an average under 4 hours — otherwise null
// and no claim is made. Computed inline (not via lib/leads) to keep this
// module import-cycle-free. Never throws; a query error just drops the badge.
// A lead the owner pruned via the "Not a fit?" tools. Snooze and archive patch
// `triage` and bump `updated_at` WITHOUT changing status, so without this they
// stay in the sample below and report the moment they were pruned as the reply
// time — a 30-second archive would read as a 30-second response. (Decline and
// block already set status 'lost', so they're excluded by the status filter.)
// Kept dependency-free on purpose: this reads the raw jsonb rather than
// importing from lib/leads, so sites.ts gains no new module edge.
function isPrunedLead(triage: unknown): boolean {
  if (!triage || typeof triage !== 'object') return false;
  const record = triage as Record<string, unknown>;
  return (
    record.archived === true ||
    typeof record.snoozedUntil === 'string' ||
    typeof record.declinedReason === 'string'
  );
}

async function withResponseStat(supabase: SupabaseClient, site: Site): Promise<Site> {
  try {
    // Only leads the owner moved FORWARD count as a genuine reply. Excluding
    // 'new' (unresponded) and 'lost' (fast junk declines/close-outs, which
    // would dishonestly drag the average down) keeps the public claim honest.
    const { data } = await supabase
      .from('leads')
      .select('status, triage, created_at, updated_at')
      .eq('account_id', site.account_id)
      .eq('source', 'website_form')
      .in('status', ['contacted', 'quoted', 'won'])
      .order('created_at', { ascending: false })
      .limit(50);
    const times = (data ?? [])
      .filter((lead) => !isPrunedLead(lead.triage))
      .map((lead) => new Date(lead.updated_at).getTime() - new Date(lead.created_at).getTime())
      .filter((ms) => Number.isFinite(ms) && ms > 0);
    if (times.length < 3) return site;
    const avg = Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length);
    return avg <= 4 * 60 * 60 * 1000 ? { ...site, avg_response_ms: avg } : site;
  } catch {
    return site;
  }
}

export async function getPublicSiteBySubdomain(
  supabase: SupabaseClient,
  subdomain: string
): Promise<Site | null> {
  const { data } = await supabase
    .from('sites')
    .select('*')
    .eq('subdomain', subdomain)
    .eq('published', true)
    .maybeSingle();

  if (data) {
    return withResponseStat(supabase, withPublicContact(data as Site));
  }

  const demoSubdomain = DEMO_SITE_HOST.split('.')[0];
  if (subdomain.toLowerCase() === demoSubdomain.toLowerCase()) {
    return {
      id: 'demo-site',
      account_id: DEMO_ACCOUNT_ID,
      subdomain: demoSubdomain,
      custom_domain: null,
      custom_domain_verified_at: null,
      published: true,
      template: 'fresh',
      header_font: null,
      button_style: null,
      accent_override: null,
      email_theme: 'modern',
      company_name: DEMO_COMPANY_NAME,
      headline: 'Commercial & Residential Lawn Care in Metro Detroit',
      tagline: 'Reliable weekly mowing, cleanup, and fertilization.',
      phone: '248-555-0199',
      license: 'MI-849204',
      hours: 'Mon-Fri 7:30am - 5:00pm',
      service_area: DEMO_SERVICE_AREA,
      logo_url: null,
      hero_url: null,
      avg_response_ms: 15 * 60 * 1000,
      seo_title: `${DEMO_COMPANY_NAME} · Royal Oak, MI`,
      seo_description: `Top-rated residential and commercial landscaping and lawn care in ${DEMO_SERVICE_AREA}.`,
      sections: {},
      content: {
        trade: 'Lawn & landscape',
        blog: { enabled: true, reminderWeeks: 4, posts: DEMO_BLOG_POSTS },
      },
      chrome: {},
      reviews_cache: null,
      portal_mode: 'light',
      updated_at: new Date().toISOString(),
    };
  }

  return null;
}

// Get public site by custom domain (no auth)
export async function getPublicSiteByCustomDomain(
  supabase: SupabaseClient,
  customDomain: string
): Promise<Site | null> {
  const { data } = await supabase
    .from('sites')
    .select('*')
    .eq('custom_domain', customDomain)
    .eq('published', true)
    .maybeSingle();

  return data ? withResponseStat(supabase, withPublicContact(data as Site)) : null;
}

// Update site
export async function updateSite(
  supabase: SupabaseClient,
  accountId: string,
  siteId: string,
  updates: Partial<Site>
): Promise<Site> {
  // Verify ownership
  const existing = await getSite(supabase, accountId, siteId);
  if (!existing) {
    throw new Error('Site not found for this account.');
  }

  // Check subdomain uniqueness if changing
  if (updates.subdomain && updates.subdomain !== existing.subdomain) {
    const { data: conflict } = await supabase
      .from('sites')
      .select('id')
      .eq('subdomain', updates.subdomain)
      .maybeSingle();

    if (conflict) {
      throw new Error('Subdomain is already taken.');
    }
  }

  // Check custom domain uniqueness if changing
  if (updates.custom_domain && updates.custom_domain !== existing.custom_domain) {
    const { data: conflict } = await supabase
      .from('sites')
      .select('id')
      .eq('custom_domain', updates.custom_domain)
      .maybeSingle();

    if (conflict) {
      throw new Error('Custom domain is already taken.');
    }
  }

  const { data, error } = await supabase
    .from('sites')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to update site');
  }

  return data as Site;
}

// Publish/unpublish site
export async function publishSite(
  supabase: SupabaseClient,
  accountId: string,
  siteId: string,
  published: boolean
): Promise<void> {
  // Verify ownership
  const site = await getSite(supabase, accountId, siteId);
  if (!site) {
    throw new Error('Site not found for this account.');
  }

  if (published && !site.company_name?.trim()) {
    throw new Error('Add a company name before publishing your site.');
  }

  if (published && !site.subdomain && !site.custom_domain) {
    throw new Error('Must set either subdomain or custom domain before publishing.');
  }

  const { error } = await supabase
    .from('sites')
    .update({ published })
    .eq('id', siteId);

  if (error) {
    throw error;
  }
}

// Check subdomain availability
export async function checkSubdomainAvailable(
  supabase: SupabaseClient,
  subdomain: string
): Promise<boolean> {
  const { data } = await supabase
    .from('sites')
    .select('id')
    .eq('subdomain', subdomain)
    .maybeSingle();

  return !data;
}

export type PortfolioJob = {
  id: string;
  ref: string;
  client_name: string;
  address: string | null;
  scope: string | null;
  status: string;
};

// Get site with related jobs for portfolio
export async function getSiteWithPortfolio(
  supabase: SupabaseClient,
  accountId: string,
  siteId: string,
  limit: number = 6
): Promise<{ site: Site; portfolioJobs: PortfolioJob[] } | null> {
  const site = await getSite(supabase, accountId, siteId);
  if (!site) {
    return null;
  }

  // Fetch completed jobs for portfolio
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, ref, client_name, address, scope, status')
    .eq('account_id', accountId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    site,
    portfolioJobs: jobs ?? [],
  };
}
