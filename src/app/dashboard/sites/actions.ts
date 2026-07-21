'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { deleteSiteImage, importJobPhotoAsSiteImage, uploadSiteImage } from '@/lib/site-image-storage';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
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

// Random tone seeds injected into the AI prompt so two contractors of the
// same trade don't land on identical (unedited) example copy — combined with
// a high sampling temperature this keeps generated text varied from click to
// click and from account to account.
const COPY_STYLE_SEEDS = [
  'warm and neighborly',
  'no-nonsense and direct',
  'confident and premium',
  'friendly and down-to-earth',
  'straightforward and trustworthy',
  'energetic and modern',
  'calm and reassuring',
  'plainspoken and blue-collar',
];

export type GeneratedSiteText = {
  headline: string;
  tagline: string;
  seo_title: string;
  seo_description: string;
};

function extractOutputText(payload: unknown): string {
  const record = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof record?.output_text === 'string') return record.output_text;
  const message = record?.output?.find((item): item is { type: string; content?: unknown[] } => (item as { type?: string })?.type === 'message');
  const textPart = message?.content?.find((part): part is { type: string; text?: string } => (part as { type?: string })?.type === 'output_text');
  return textPart?.text ?? '{}';
}

// Generates fresh, randomized example headline/tagline/SEO copy for the
// contractor's own site so they have something specific (not a generic
// boilerplate placeholder) to personalize before publishing. Does not save
// anything — the caller applies the result to local state and the usual
// Save button persists it.
export async function generateSiteTextAction(): Promise<GeneratedSiteText> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: sites } = await supabase
    .from('sites')
    .select('company_name, service_area')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI text generation is not configured yet.');
  }

  const companyName = sites[0].company_name || 'this local business';
  const serviceArea = sites[0].service_area || '';
  const styleSeed = COPY_STYLE_SEEDS[Math.floor(Math.random() * COPY_STYLE_SEEDS.length)];

  const instructions =
    "You write short example marketing copy for a local home-services contractor's website. " +
    'Infer their trade (HVAC, plumbing, landscaping, cleaning, roofing, electrical, etc.) from the business name. ' +
    `Write in a ${styleSeed} tone. ` +
    'Avoid generic filler like "quality you can trust" or "customer satisfaction is our priority" — be specific to the trade and mention concrete services or benefits a homeowner in that trade would care about. ' +
    'This is placeholder example text the contractor will personalize later, so make it feel like a real, distinct business rather than a generic template. ' +
    'Respond with strict JSON only, no other text, in this exact shape: ' +
    '{"headline":"<one short punchy line, under 70 characters>","tagline":"<one or two sentences, under 160 characters>","seo_title":"<search engine page title, under 60 characters, include the business name>","seo_description":"<search engine meta description, under 160 characters>"}.';

  const input =
    `Business name: ${companyName}. ${serviceArea ? `Service area: ${serviceArea}. ` : ''}` +
    'Generate the example website text described above. Respond with json only.';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 1.1,
        instructions,
        input,
        text: { format: { type: 'json_object' } },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload));

    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 200) : '',
      tagline: typeof parsed.tagline === 'string' ? parsed.tagline.slice(0, 300) : '',
      seo_title: typeof parsed.seo_title === 'string' ? parsed.seo_title.slice(0, 60) : '',
      seo_description: typeof parsed.seo_description === 'string' ? parsed.seo_description.slice(0, 160) : '',
    };
  } catch (error) {
    console.error('Site text generation failed:', error);
    throw new Error('Could not generate example text right now. Please try again.');
  }
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

export type JobPhotoImportOption = {
  path: string;
  url: string;
  label: string;
};

export async function listCompletedJobPhotoOptionsAction(): Promise<JobPhotoImportOption[]> {
  const { supabase, accountId } = await requireOwnerContext();
  const { data, error } = await supabase
    .from('jobs')
    .select('ref, client_name, scope, photo_paths')
    .eq('account_id', accountId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) throw error;

  const photos = (data ?? []).flatMap((job) => {
    const paths = Array.isArray(job.photo_paths) ? job.photo_paths.filter((path): path is string => typeof path === 'string') : [];
    return paths.map((path, index) => ({
      path,
      label: `${job.ref || 'Completed job'}${job.scope ? ` - ${job.scope}` : job.client_name ? ` - ${job.client_name}` : ''} photo ${index + 1}`,
    }));
  }).filter((photo) => photo.path.startsWith(`${accountId}/`)).slice(0, 24);

  const urls = await createJobPhotoUrls(accountId, photos.map((photo) => photo.path));
  return photos.map((photo, index) => ({ ...photo, url: urls[index] })).filter((photo): photo is JobPhotoImportOption => Boolean(photo.url));
}

export async function importJobPhotoToSiteImageAction(path: string, label: string) {
  const { accountId } = await requireOwnerContext();
  return importJobPhotoAsSiteImage(accountId, path, label || 'Completed job photo');
}

export async function deleteSiteImageAction(storagePath: string) {
  const { accountId } = await requireOwnerContext();
  await deleteSiteImage(accountId, storagePath);
}
