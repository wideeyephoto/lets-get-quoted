'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { deleteSiteImage, importJobPhotoAsSiteImage, uploadSiteImage } from '@/lib/site-image-storage';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import type { Site } from '@/lib/sites';
import { normalizeDomain, verifyDomain } from '@/lib/domains';
import { draftBlogPost, type GeneratedBlogPost } from '@/lib/blog-generate';
import { generateSeoCopy } from '@/lib/seo/seo-copy';
import { siteToSeoInput } from '@/lib/seo/site-seo';
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
    throw new Error('Add a letsgetquoted.com subdomain or verify your custom domain before publishing.');
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
  hours: string;
  service_area: string;
  cities: string[];
  services: { icon: string; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  // Generated as examples only; the caller seeds these into the site but leaves
  // testimonials + stats DISABLED so no fabricated review/number publishes until
  // the contractor replaces them with real ones and turns them on.
  testimonials: { author: string; text: string; rating: number; label: string }[];
  stats: { value: number; suffix: string; label: string }[];
};

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function isObj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
// Must match ServiceIcon's key set (src/lib/templates/ServiceIcon.tsx). The AI
// sometimes invents a key (e.g. 'roof'), so anything off-list falls back to a
// generic mark rather than being stored and rendered as the wrong/empty icon.
const SERVICE_ICON_KEYS = new Set(['spark', 'wrench', 'droplet', 'bolt', 'home', 'star', 'shield', 'clock', 'leaf', 'grid', 'truck', 'sparkles', 'roller']);
function normalizeIcon(value: unknown): string {
  const key = asString(value, 20);
  return SERVICE_ICON_KEYS.has(key) ? key : 'spark';
}

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
export async function generateSiteTextAction(
  options?: { trade?: string; companyName?: string; serviceArea?: string },
): Promise<GeneratedSiteText> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const currentSite = sites[0] as Site;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI text generation is not configured yet.');
  }

  // Prefer the values the owner has typed in the builder (which may be unsaved)
  // over the persisted row, so one click of "Generate" works without a prior
  // Save — including the SEO copy derived below.
  const companyName = (typeof options?.companyName === 'string' && options.companyName.trim()) || currentSite.company_name || 'this local business';
  const serviceArea = (typeof options?.serviceArea === 'string' && options.serviceArea.trim()) || currentSite.service_area || '';
  const tradeInput = typeof options?.trade === 'string' ? options.trade.trim().slice(0, 80) : '';
  const styleSeed = COPY_STYLE_SEEDS[Math.floor(Math.random() * COPY_STYLE_SEEDS.length)];

  const instructions =
    "You write short example marketing copy for a local home-services contractor's website. " +
    (tradeInput
      ? `The business is a ${tradeInput} — write every part of the site specifically for that trade. `
      : 'Infer their trade (HVAC, plumbing, landscaping, cleaning, roofing, electrical, remodeling, etc.) from the business name. ') +
    `Write in a ${styleSeed} tone. ` +
    'Optimize for LOCAL search: when a service area is provided, identify its primary city or region and pair the trade with that location so a homeowner searching "[trade] in [city]" would match. If no service area is given, lead with the trade alone and never invent a location. ' +
    'Avoid generic filler like "quality you can trust" or "customer satisfaction is our priority" — be specific to the trade and mention concrete services or benefits a homeowner in that trade would care about. ' +
    'This is placeholder example text the contractor will personalize later, so make it feel like a real, distinct business rather than a generic template. ' +
    'Also produce example content to fill out the whole site: the real services this trade offers, common homeowner FAQs, typical business hours, the service area with nearby cities, a couple of example testimonials, and a few headline stats. ' +
    'Respond with strict JSON only, no other text, in this exact shape: ' +
    '{' +
    '"headline":"<one short punchy line under 70 characters, specific to the trade; weave in the primary city only when it reads naturally, e.g. \'Trusted Kitchen Remodeling in Austin\'>",' +
    '"tagline":"<one or two sentences under 160 characters>",' +
    '"seo_title":"<under 60 characters; when a location is given, lead with the primary city and trade then the business name (e.g. \'Austin Kitchen Remodeling | Northline Builders\'); otherwise lead with the trade and business name>",' +
    '"seo_description":"<under 160 characters; name the trade and the service area/city when given, and end with a clear call to action like \'Free estimates.\'>",' +
    '"hours":"<typical hours for this trade, e.g. \'Mon-Fri 8am-6pm, Sat 9am-2pm\'>",' +
    '"service_area":"<the area served in a few words; if none was provided, a natural generic like \'your local area\'>",' +
    '"cities":["<4 to 6 nearby city or neighborhood names for the service area; empty array if the area is unknown>"],' +
    '"services":[{"icon":"<pick the single closest match from EXACTLY this list and never invent another word: wrench, droplet, bolt, roller, sparkles, home, shield, leaf, grid, truck, clock, star, spark>","title":"<a real service this trade offers, under 40 characters>","description":"<one concrete line under 130 characters>"}],' +
    '"faqs":[{"question":"<a real question a homeowner asks this trade>","answer":"<a concise, helpful answer under 300 characters>"}],' +
    '"testimonials":[{"author":"<a realistic first name and last initial>","text":"<a believable 1-2 sentence review of this trade>","rating":5,"label":"<a city or short role, optional>"}],' +
    '"stats":[{"value":<a plausible whole number>,"suffix":"<a plus sign or empty>","label":"<e.g. Jobs completed, Years in business, 5-star reviews>"}]' +
    '}. Include 4 to 5 services, 5 faqs, 2 to 3 testimonials, and 3 to 4 stats.';

  const input =
    `Business name: ${companyName}. ${tradeInput ? `Trade / field of work: ${tradeInput}. ` : ''}${serviceArea ? `Service area: ${serviceArea}. ` : ''}` +
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

    const services = asArray(parsed.services)
      .filter(isObj)
      .slice(0, 5)
      .map((s) => ({ icon: normalizeIcon(s.icon), title: asString(s.title, 60), description: asString(s.description, 140) }))
      .filter((s) => s.title);
    const cities = asArray(parsed.cities)
      .filter((c): c is string => typeof c === 'string')
      .slice(0, 8)
      .map((c) => c.slice(0, 50));

    // Build SEO copy deterministically rather than trusting the model — the
    // generator guarantees the char limits, refuses to repeat the service
    // (killing "Window Cleaning | Window Cleaning"), and works in Let's Get
    // Quoted's customer-experience features. Seeded on the site id so it stays
    // stable, and enriched with the freshly generated primary service + city.
    const seo = generateSeoCopy({
      ...siteToSeoInput(currentSite),
      businessName: companyName === 'this local business' ? '' : companyName,
      primaryService: services[0]?.title || tradeInput || undefined,
      trade: tradeInput || undefined,
      city: cities[0] || undefined,
      serviceArea: asString(parsed.service_area, 120) || serviceArea || undefined,
    });

    return {
      headline: asString(parsed.headline, 200),
      tagline: asString(parsed.tagline, 300),
      seo_title: seo.title,
      seo_description: seo.description,
      hours: asString(parsed.hours, 80),
      service_area: asString(parsed.service_area, 120),
      cities,
      services,
      faqs: asArray(parsed.faqs)
        .filter(isObj)
        .slice(0, 6)
        .map((f) => ({ question: asString(f.question, 180), answer: asString(f.answer, 400) }))
        .filter((f) => f.question && f.answer),
      testimonials: asArray(parsed.testimonials)
        .filter(isObj)
        .slice(0, 3)
        .map((t) => ({ author: asString(t.author, 60), text: asString(t.text, 300), rating: Math.min(5, Math.max(1, Math.round(Number(t.rating) || 5))), label: asString(t.label, 60) }))
        .filter((t) => t.text),
      stats: asArray(parsed.stats)
        .filter(isObj)
        .slice(0, 4)
        .map((s) => ({ value: Math.max(0, Math.round(Number(s.value) || 0)), suffix: asString(s.suffix, 4), label: asString(s.label, 40) }))
        .filter((s) => s.label),
    };
  } catch (error) {
    console.error('Site text generation failed:', error);
    throw new Error('Could not generate example text right now. Please try again.');
  }
}

// Regenerate ONLY the SEO title + description from the contractor's real data,
// with no AI/API dependency. `variantOffset` rotates to a different valid
// variation each click (the builder increments it), while the base output stays
// stable per site between page loads. The caller applies the result to the two
// SEO fields and leaves everything else untouched, so manual edits elsewhere are
// preserved.
export async function regenerateSeoCopyAction(variantOffset: number): Promise<{ seo_title: string; seo_description: string }> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const site = sites[0] as Site;
  const offset = Number.isFinite(variantOffset) ? Math.abs(Math.trunc(variantOffset)) : 0;
  const copy = generateSeoCopy(siteToSeoInput(site), offset);
  return { seo_title: copy.title, seo_description: copy.description };
}

// Draft one blog post for the owner's site. Returns raw fields; the builder
// assembles the SiteBlogPost as a DRAFT so nothing publishes without approval.
export async function generateBlogPostAction(topic?: string): Promise<GeneratedBlogPost> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: sites } = await supabase
    .from('sites')
    .select('company_name, service_area')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) throw new Error('No site found for your account');

  try {
    return await draftBlogPost({
      companyName: sites[0].company_name || '',
      serviceArea: sites[0].service_area || '',
      topic: typeof topic === 'string' ? topic : '',
    });
  } catch (error) {
    console.error('Blog post generation failed:', error);
    throw new Error('Could not generate a draft right now. Please try again.');
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
