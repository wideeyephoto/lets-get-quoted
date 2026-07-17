import type { SupabaseClient } from '@supabase/supabase-js';

export type TemplateType =
  | 'carbon' | 'professional' | 'modern' | 'minimal'
  | 'atlas' | 'summit' | 'meridian' | 'beacon' | 'foundry' | 'lumen'
  | 'anchor' | 'timber' | 'circuit' | 'cascade' | 'ironclad' | 'bloom'
  | 'blueprint' | 'nova' | 'heritage' | 'drift';
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

  company_name: string;
  headline: string | null;
  tagline: string | null;
  phone: string | null;
  license: string | null;
  hours: string | null;
  service_area: string | null;

  logo_url: string | null;
  hero_url: string | null;
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

  // Get account name for defaults
  const { data: account } = await supabase
    .from('accounts')
    .select('business_name')
    .eq('id', accountId)
    .maybeSingle();

  // Create default site
  const { data: newSite, error } = await supabase
    .from('sites')
    .insert({
      account_id: accountId,
      template: 'carbon',
      company_name: account?.business_name || 'My Business',
      portal_mode: 'light',
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

  return data as Site | null;
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

  return data as Site | null;
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
