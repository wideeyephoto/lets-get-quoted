'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { deleteSiteImage, uploadSiteImage } from '@/lib/site-image-storage';
import type { Site } from '@/lib/sites';
import { normalizeDomain, verifyDomain } from '@/lib/domains';
import {
  getOrCreateSite,
  updateSite,
  publishSite,
} from '@/lib/sites';

export async function getOrCreateSiteAction() {
  const { supabase, accountId } = await requireOwnerContext();
  const site = await getOrCreateSite(supabase, accountId);
  return site;
}

export type SiteEditableInput = Pick<Site,
  'template' | 'header_font' | 'button_style' | 'accent_override' | 'company_name' |
  'headline' | 'tagline' | 'phone' | 'license' | 'hours' | 'service_area' |
  'logo_url' | 'hero_url' | 'subdomain' | 'custom_domain' | 'portal_mode' |
  'content' | 'seo_title' | 'seo_description'
>;

export async function updateSiteAction(updates: SiteEditableInput) {
  const { supabase, accountId } = await requireOwnerContext();

  // Get current site
  const { data: sites } = await supabase
    .from('sites')
    .select('id, custom_domain')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const siteId = sites[0].id;

  const editableUpdates: SiteEditableInput = {
    template: updates.template,
    header_font: updates.header_font,
    button_style: updates.button_style,
    accent_override: updates.accent_override,
    company_name: updates.company_name,
    headline: updates.headline,
    tagline: updates.tagline,
    phone: updates.phone,
    license: updates.license,
    hours: updates.hours,
    service_area: updates.service_area,
    logo_url: updates.logo_url,
    hero_url: updates.hero_url,
    subdomain: updates.subdomain?.trim().toLowerCase() || null,
    custom_domain: updates.custom_domain ? normalizeDomain(updates.custom_domain) : null,
    portal_mode: updates.portal_mode,
    content: updates.content,
    seo_title: updates.seo_title,
    seo_description: updates.seo_description,
  };
  const domainChanged = editableUpdates.custom_domain !== (sites[0].custom_domain || null);
  const site = await updateSite(supabase, accountId, siteId, {
    ...editableUpdates,
    ...(domainChanged ? { custom_domain_verified_at: null } : {}),
  });

  revalidatePath('/dashboard/sites');

  return site;
}

export async function publishSiteAction(published: boolean) {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: sites } = await supabase
    .from('sites')
    .select('id, subdomain, custom_domain, custom_domain_verified_at')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const siteId = sites[0].id;

  if (published && !sites[0].subdomain && (!sites[0].custom_domain || !sites[0].custom_domain_verified_at)) {
    throw new Error('Add an LGQ subdomain or verify your custom domain before publishing.');
  }

  await publishSite(supabase, accountId, siteId, published);

  revalidatePath('/dashboard/sites');
}

export async function checkSubdomainAvailableAction(subdomain: string): Promise<boolean> {
  const { accountId } = await requireOwnerContext();
  const { data } = await createAdminClient()
    .from('sites')
    .select('account_id')
    .eq('subdomain', subdomain)
    .maybeSingle();

  return !data || data.account_id === accountId;
}

export async function verifyCustomDomainAction(domainValue: string) {
  const { accountId } = await requireOwnerContext();
  const domain = normalizeDomain(domainValue);
  const verification = await verifyDomain(domain);
  if (!verification.verified) return verification;

  const admin = createAdminClient();
  const { data: conflict } = await admin.from('sites').select('account_id').eq('custom_domain', domain).neq('account_id', accountId).maybeSingle();
  if (conflict) throw new Error('This custom domain is already connected to another account.');
  const { error } = await admin.from('sites').update({ custom_domain: domain, custom_domain_verified_at: new Date().toISOString() }).eq('account_id', accountId);
  if (error) throw error;
  revalidatePath('/dashboard/sites');
  return verification;
}

export async function uploadSiteImageAction(formData: FormData) {
  const { accountId } = await requireOwnerContext();
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose an image to upload.');
  }

  return uploadSiteImage(accountId, file);
}

export async function deleteSiteImageAction(storagePath: string) {
  const { accountId } = await requireOwnerContext();
  await deleteSiteImage(accountId, storagePath);
}
