'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { deleteSiteImage, importJobPhotoAsSiteImage, uploadGeneratedSiteImage, uploadSiteImage } from '@/lib/site-image-storage';
import { createSignedVideoUpload, deleteSiteVideo, siteVideoStoragePath, type SignedVideoUpload } from '@/lib/site-video-storage';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import type { Site } from '@/lib/sites';
import { callImageModel, callModel } from '@/lib/ai-model-call';
import { buildAiLogoPrompt, isAiLogoDirection, type AiLogoDirection } from '@/lib/logo-image-prompt';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';
import { normalizeDomain, verifyDomain } from '@/lib/domains';
import { removeDomainFromVercel } from '@/lib/vercel-domains';
import { geocodeArea } from '@/lib/geocode';
import { anchorServiceArea } from '@/lib/site-area';
import { draftBlogPost, type GeneratedBlogPost } from '@/lib/blog-generate';
import { generateSeoCopy } from '@/lib/seo/seo-copy';
import { siteToSeoInput } from '@/lib/seo/site-seo';
import { generateStockImages, type StockImageResult } from '@/lib/stock/generate';
import { fetchStockPool, isPexelsConfigured } from '@/lib/stock/pexels';
import type { ImageOrientation, PexelsSearchResult } from '@/lib/stock/types';
import { getSiteContent, getUnreviewedGeneratedSections, preserveIntakeSettings, preserveAiLogos, type PersistedAiLogo, type PendingAiLogo } from '@/lib/site-content';
import { preserveBlogPosts } from '@/lib/site-blog';
import { matchesServedCity } from '@/lib/service-area-match';
import {
  getOrCreateSite,
  updateSite,
  publishSite,
} from '@/lib/sites';

export async function getOrCreateSiteAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const site = await getOrCreateSite(supabase, accountId);
  return site;
}

export type SiteEditableInput = Pick<Site,
  'template' | 'header_font' | 'button_style' | 'accent_override' | 'company_name' |
  'headline' | 'tagline' | 'phone' | 'license' | 'hours' | 'service_area' |
  'logo_url' | 'hero_url' | 'subdomain' | 'custom_domain' | 'portal_mode' |
  'content' | 'seo_title' | 'seo_description'
>;

// One sentence for both gates. Saving to a live site and publishing are the
// same refusal for the same reason, and an owner who is stopped on one should
// not be told something different by the other.
function unreviewedGeneratedMessage(sections: string[], action: string): string {
  return `${sections.join(' and ')} still contain AI-written examples. Replace them with your real ones, or switch those sections off, before ${action}.`;
}

export async function updateSiteAction(updates: SiteEditableInput) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  // Get current site
  const { data: sites } = await supabase
    .from('sites')
    .select('id, custom_domain, content, published')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const siteId = sites[0].id;

  // Blog posts are edited on Marketing → Blog, drafted by the biweekly cron,
  // and created from seasonal topics — none of which this page knows about.
  // The builder sends the content object it loaded when the page opened, so
  // without this a post written in the meantime is silently deleted by a Save
  // the owner thought only changed their headline. Enforced here rather than
  // trusted to the client, because it is an invariant and not a convention.
  //
  // Intake tuning is preserved for the same reason: it moved to Settings →
  // Automations → Smart Intake, and the builder would otherwise revert it.
  const contentWithBlogPreserved = updates.content
    ? preserveAiLogos(
        sites[0].content as Record<string, unknown> | null,
        preserveIntakeSettings(
          sites[0].content as Record<string, unknown> | null,
          preserveBlogPosts(sites[0].content as Record<string, unknown> | null, updates.content),
        ),
      )
    : updates.content;

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
    content: contentWithBlogPreserved,
    seo_title: updates.seo_title,
    seo_description: updates.seo_description,
  };
  // The publish gate again, because on a LIVE site this action is the deploy.
  // updateSite writes the row the public page reads, so gating only the
  // published/unpublished transition left the whole thing open: seed a site,
  // publish it while the example reviews are off, then flip the section on and
  // press "Save & update live site" — six invented customers with names and
  // star ratings, live on a real business, without Publish ever being touched.
  // Checked against the content being WRITTEN, not the row being replaced.
  if (sites[0].published && contentWithBlogPreserved) {
    const unreviewed = getUnreviewedGeneratedSections(contentWithBlogPreserved);
    if (unreviewed.length > 0) {
      throw new Error(unreviewedGeneratedMessage(unreviewed, 'updating your live site'));
    }
  }

  const oldDomain = sites[0].custom_domain || null;
  const domainChanged = editableUpdates.custom_domain !== oldDomain;
  if (domainChanged && oldDomain) {
    try {
      await removeDomainFromVercel(oldDomain);
    } catch {
      // Best-effort cleanup on Vercel
    }
  }

  const site = await updateSite(supabase, accountId, siteId, {
    ...editableUpdates,
    ...(domainChanged ? { custom_domain_verified_at: null } : {}),
  });

  if (editableUpdates.company_name?.trim()) {
    const nextBusinessName = editableUpdates.company_name.trim();
    const admin = createAdminClient();
    const { error: accountError } = await admin
      .from('accounts')
      .update({ business_name: nextBusinessName })
      .eq('id', accountId);

    if (accountError) {
      console.error('Failed to sync accounts.business_name from website update:', accountError.message);
    }
  }

  revalidatePath('/dashboard/sites');
  revalidatePath('/dashboard/settings');

  return site;
}

export async function publishSiteAction(published: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { data: sites } = await supabase
    .from('sites')
    .select('id, subdomain, custom_domain, custom_domain_verified_at, content')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const siteId = sites[0].id;

  if (published && !sites[0].subdomain && (!sites[0].custom_domain || !sites[0].custom_domain_verified_at)) {
    throw new Error('Add a letsgetquoted.com subdomain or verify your custom domain before publishing.');
  }

  // A hard gate, and on the server rather than only in the builder, because the
  // thing being prevented is a real business publishing invented reviews and
  // invented numbers about itself. Reads the SAVED row: the builder saves
  // before it publishes, so this sees exactly what would go live.
  const unreviewed = published ? getUnreviewedGeneratedSections(sites[0].content as Record<string, unknown> | null) : [];
  if (unreviewed.length > 0) {
    throw new Error(unreviewedGeneratedMessage(unreviewed, 'publishing'));
  }

  await publishSite(supabase, accountId, siteId, published);

  revalidatePath('/dashboard/sites');
}

export async function checkSubdomainAvailableAction(subdomain: string): Promise<boolean> {
  const { accountId } = await requireOfficeContext('settings.write');
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
  // Photo-gallery heading + intro. Worded to stay honest about the auto-picked
  // stock photos being representative, not the contractor's own finished jobs.
  showcase_title: string;
  showcase_intro: string;
  services: { icon: string; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  // Generated as examples only. The caller seeds them DISABLED and flags each
  // item `generated`, and publishSiteAction refuses to publish a section that
  // is switched on while a flagged item is still in it — so no invented review
  // or number goes live until the contractor has replaced it with a real one.
  testimonials: { author: string; text: string; rating: number; label: string }[];
  stats: { value: number; suffix: string; label: string }[];
  // Auto-selected Pexels stock photos for the site's image roles. Always
  // present; `ok: false` (empty selections) when Pexels was unavailable, so the
  // rest of the generated site still applies.
  images: StockImageResult;
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
// Derived from the generated icon set so it can never drift. The AI sometimes
// invents a key (e.g. 'roof'), so anything off-list falls back to a generic mark
// rather than being stored and rendered as the wrong/empty icon.
const SERVICE_ICON_KEY_SET = new Set(Object.keys(SERVICE_ICON_GLYPHS));
function normalizeIcon(value: unknown): string {
  const key = asString(value, 20);
  return SERVICE_ICON_KEY_SET.has(key) ? key : 'spark';
}
// Stat decorators are symbols only — never unit words. The model sometimes drops
// the unit ("years", "sq ft") into the suffix, which then gets mashed onto the
// number and clipped mid-word ("10" + " Years" → "10 Yea"). Strip everything
// except the handful of figure symbols so the unit lives in the label instead.
function normalizeStatSuffix(value: unknown): string {
  return asString(value, 8).replace(/[^+%★]/g, '').slice(0, 2);
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
  options?: { trade?: string; companyName?: string; serviceArea?: string; zip?: string },
): Promise<GeneratedSiteText> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

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
  const zip = typeof options?.zip === 'string' ? options.zip.trim().slice(0, 12) : '';
  // A ZIP is the authoritative location source. When one is provided, ignore any
  // previously-saved service_area — that value is itself AI-generated, so it can
  // be stale or from an older ZIP (e.g. "Metro Detroit" lingering under a Missouri
  // ZIP) and would otherwise override the new ZIP. The ZIP then fully drives the
  // resolved city + service area.
  const serviceArea = (typeof options?.serviceArea === 'string' && options.serviceArea.trim()) || (zip ? '' : currentSite.service_area) || '';
  const tradeInput = typeof options?.trade === 'string' ? options.trade.trim().slice(0, 80) : '';

  /* THE ZIP IS LOOKED UP, NOT REMEMBERED.
   *
   * It used to be handed to gpt-4o-mini with an instruction saying a ZIP is
   * authoritative and an example of resolving one. Asked for 48067 the model
   * answered Maplewood, Springfield and Sunnyvale — real US place names,
   * correctly spelled, none of them near Royal Oak — and they were published
   * on a live site under "Areas we serve". No amount of instruction fixes
   * that: a small model asked to recall a five-digit lookup will produce
   * something ZIP-shaped and confident.
   *
   * So Google resolves it first and the answer goes into the prompt as a fact.
   * The model still writes the copy and still suggests the neighboring towns,
   * which is what it is good at — it just no longer decides which state the
   * business is in. If geocoding is unconfigured or the ZIP does not resolve,
   * this is empty and the old behavior stands, which is the same behavior as
   * a site with no ZIP at all. */
  const resolvedZipPlace = zip ? await geocodeArea(zip) : null;
  const primaryCity = resolvedZipPlace?.ok ? resolvedZipPlace.place : '';

  const styleSeed = COPY_STYLE_SEEDS[Math.floor(Math.random() * COPY_STYLE_SEEDS.length)];
  // Offer the model the ENTIRE baked icon set (Lucide + curated Iconify glyphs)
  // rather than a hand-picked handful, so each generated service can pick the
  // icon that actually matches it (a faucet for "leak repair", a flame for
  // "furnace tune-up", a bug for "pest control"). Anything off-list still falls
  // back to a generic mark via normalizeIcon.
  const serviceIconKeys = Object.keys(SERVICE_ICON_GLYPHS).join(', ');

  const instructions =
    "You write short example marketing copy for a local home-services contractor's website. " +
    (tradeInput
      ? `The business is a ${tradeInput} — write every part of the site specifically for that trade. `
      : 'Infer their trade (HVAC, plumbing, landscaping, cleaning, roofing, electrical, remodeling, etc.) from the business name. ') +
    `Write in a ${styleSeed} tone. ` +
    'Optimize for LOCAL search: when a service area or ZIP code is provided, determine the primary city or region and pair the trade with that location so a homeowner searching "[trade] in [city]" would match — fill service_area and cities with the REAL nearby city, town, and neighborhood names for that location. A ZIP code is AUTHORITATIVE: resolve it to the actual U.S. city/town it belongs to (e.g. 64002 → Lee\'s Summit, Missouri) and base service_area and cities entirely on that ZIP\'s real location and its neighbors. If a service area is also given but names a different place than the ZIP, IGNORE the service area and trust the ZIP. If neither a service area nor a ZIP is given, lead with the trade alone and never invent a location. ' +
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
    '"service_area":"<the area served in a few words; an EMPTY STRING if no service area or ZIP was provided — never a generic stand-in like \'your local area\'>",' +
    '"cities":["<12 nearby city, town, or neighborhood names for the service area, casting a wide radius; empty array if the area is unknown>"],' +
    '"showcase_title":"<a photo-gallery heading under 50 characters naming the KIND of work this trade shows off, e.g. \'The roofing work we handle\'; NEVER claim the photos are this business\'s own finished jobs>",' +
    '"showcase_intro":"<under 180 characters; say what a homeowner is looking at for this trade, then state plainly that these are representative photos the business will swap for their own project photos>",' +
    `"services":[{"icon":"<pick the single closest match from EXACTLY this list and never invent another word: ${serviceIconKeys}>","title":"<a real service this trade offers, under 40 characters>","description":"<one concrete line under 130 characters>"}],` +
    '"faqs":[{"question":"<a real question a homeowner asks this trade>","answer":"<a concise, helpful answer under 300 characters>"}],' +
    '"testimonials":[{"author":"<a realistic first name and last initial>","text":"<a believable 1-2 sentence review of this trade>","rating":5,"label":"<a city or short role, optional>"}],' +
    '"stats":[{"value":<a plausible whole number ONLY — digits, no words, units, or symbols>,"suffix":"<ONLY a plus sign, a percent sign, or empty — NEVER a word or unit>","label":"<the FULL descriptor including any unit or noun, e.g. Jobs completed, Years in business, 5-star reviews, Sq ft installed — this is where words like \'years\' belong, never in the value>"}]' +
    '}. Include 10 to 15 services (each a distinct, real offering for this trade — no duplicates or near-duplicates), 5 faqs, exactly 6 testimonials (distinct customers, varied projects and wording), and 3 to 4 stats. Each stat value must be a bare number (e.g. 250, 10, 100), with the unit or noun living entirely in its label.';

  const input =
    `Business name: ${companyName}. ${tradeInput ? `Trade / field of work: ${tradeInput}. ` : ''}${serviceArea ? `Service area: ${serviceArea}. ` : ''}${zip ? `Business ZIP code: ${zip}. ` : ''}` +
    /* The resolved town, last so it is the most recent thing in the input, and
       stated as settled rather than as another hint to weigh. Without it the
       model was picking the state. */
    (primaryCity
      ? `The ZIP code ${zip} has ALREADY been resolved and the business is in ${primaryCity}. That is a fact, not a suggestion: use ${primaryCity} as the primary city and list only towns and neighborhoods that genuinely border it. Do not name a city in any other state. `
      : '') +
    'Generate the example website text described above. Respond with json only.';

  try {
    const response = await callModel({
      model: 'gpt-4o-mini',
      temperature: 1.1,
      instructions,
      input,
      text: { format: { type: 'json_object' } },
    }, { accountId, kind: 'site_copy' });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload));

    const services = asArray(parsed.services)
      .filter(isObj)
      .slice(0, 15)
      .map((s) => ({ icon: normalizeIcon(s.icon), title: asString(s.title, 60), description: asString(s.description, 140) }))
      .filter((s) => s.title);
    // DO WE ACTUALLY KNOW WHERE THIS BUSINESS IS?
    //
    // Without a ZIP or a service area there is nothing to localise to. The
    // instructions say so twice, but a model asked for twelve nearby towns will
    // produce twelve nearby towns regardless — real places, correctly spelled,
    // and somewhere else entirely. Those get published on a live site under
    // "Areas we serve", which is worse than saying nothing at all.
    //
    // So it is enforced here rather than requested there. No location in, no
    // location out.
    /* THE RESOLVED TOWN LEADS, WHATEVER THE MODEL SAID. The prompt states it as
       a fact, which helps; anchorServiceArea is the part that does not depend
       on the model agreeing. See lib/site-area.ts for the failure it exists
       for. */
    const { cities, serviceArea: generatedServiceArea } = anchorServiceArea({
      primaryCity,
      modelCities: asArray(parsed.cities)
        .filter((c): c is string => typeof c === 'string')
        .slice(0, 12)
        .map((c) => c.slice(0, 50)),
      modelServiceArea: asString(parsed.service_area, 120),
      locationKnown: Boolean(zip || serviceArea),
    });

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
      serviceArea: generatedServiceArea || serviceArea || undefined,
    });

    // Populate the site's image roles with trade-relevant Pexels photos so the
    // first preview looks complete. Never throws — on failure `images.ok` is
    // false and the site is returned without stock photos.
    const images = await generateStockImages({
      seed: currentSite.id,
      trade: tradeInput || services[0]?.title || '',
      serviceTitles: services.map((service) => service.title),
    });

    return {
      images,
      headline: asString(parsed.headline, 200),
      tagline: asString(parsed.tagline, 300),
      seo_title: seo.title,
      seo_description: seo.description,
      hours: asString(parsed.hours, 80),
      service_area: generatedServiceArea,
      cities,
      showcase_title: asString(parsed.showcase_title, 80),
      showcase_intro: asString(parsed.showcase_intro, 220),
      services,
      faqs: asArray(parsed.faqs)
        .filter(isObj)
        .slice(0, 6)
        .map((f) => ({ question: asString(f.question, 180), answer: asString(f.answer, 400) }))
        .filter((f) => f.question && f.answer),
      testimonials: asArray(parsed.testimonials)
        .filter(isObj)
        .slice(0, 6)
        .map((t) => ({ author: asString(t.author, 60), text: asString(t.text, 300), rating: Math.min(5, Math.max(1, Math.round(Number(t.rating) || 5))), label: asString(t.label, 60) }))
        .filter((t) => t.text),
      stats: asArray(parsed.stats)
        .filter(isObj)
        .slice(0, 4)
        .map((s) => ({ value: Math.max(0, Math.round(Number(s.value) || 0)), suffix: normalizeStatSuffix(s.suffix), label: asString(s.label, 40) }))
        .filter((s) => s.label && s.value > 0),
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
  const { supabase, accountId } = await requireOfficeContext('settings.write');

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

// Re-pick stock photos for every image role from the saved trade + services. A
// `nonce` (incremented by the "Regenerate all stock images" button, or 0 for a
// fallback retry) varies the deterministic selection so the owner gets a fresh
// set. Returns render-ready fields + attribution; the client applies them while
// preserving the owner's uploaded photos. Never throws.
export async function regenerateStockImagesAction(nonce: number): Promise<StockImageResult> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) {
    throw new Error('No site found for your account');
  }

  const site = sites[0] as Site;
  const content = getSiteContent(site.content);
  const serviceTitles = content.services.items.map((item) => item.title).filter(Boolean);
  const trade = content.trade || serviceTitles[0] || '';
  const offset = Number.isFinite(nonce) ? Math.abs(Math.trunc(nonce)) : 0;
  return generateStockImages({ seed: `${site.id}:${offset}`, trade, serviceTitles });
}

// Draft one blog post for the owner's site. Returns raw fields; the builder
// assembles the SiteBlogPost as a DRAFT so nothing publishes without approval.
// Pick a relevant landscape Pexels photo for a blog cover. Never throws — a
// missing key or no results just means no auto-cover (the owner can add one).
export async function pickBlogCover(query: string): Promise<string> {
  try {
    const trimmed = (query || '').trim().slice(0, 60);
    if (!trimmed || !isPexelsConfigured()) return '';
    const pool = await fetchStockPool([trimmed], 'landscape');
    return pool[0]?.imageUrl || '';
  } catch {
    return '';
  }
}

export async function generateBlogPostAction(topic?: string): Promise<GeneratedBlogPost & { coverImage: string }> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { data: sites } = await supabase
    .from('sites')
    .select('company_name, service_area, content')
    .eq('account_id', accountId)
    .limit(1);

  if (!sites || sites.length === 0) throw new Error('No site found for your account');

  const trade = getSiteContent(sites[0].content).trade;
  try {
    const draft = await draftBlogPost({
      companyName: sites[0].company_name || '',
      trade,
      serviceArea: sites[0].service_area || '',
      topic: typeof topic === 'string' ? topic : '',
    });
    const coverImage = await pickBlogCover(topic?.trim() || trade || draft.title);
    return { ...draft, coverImage };
  } catch (error) {
    console.error('Blog post generation failed:', error);
    throw new Error('Could not generate a draft right now. Please try again.');
  }
}

// Search Pexels for the "Replace photo" picker's stock gallery. Auth-gated
// (owner only), returns a `configured` flag so the UI can distinguish "no key"
// from "no results", and never throws.
export async function searchPexelsAction(query: string, orientation?: ImageOrientation): Promise<PexelsSearchResult> {
  await requireOfficeContext('settings.write');
  const configured = isPexelsConfigured();
  const trimmed = (query || '').trim().slice(0, 100);
  if (!configured || !trimmed) return { configured, photos: [] };

  const pool = await fetchStockPool([trimmed], orientation);
  return {
    configured,
    photos: pool.map((photo) => ({
      id: `pexels-${photo.id}`,
      providerImageId: String(photo.id),
      url: photo.imageUrl,
      thumbnailUrl: photo.thumbnailUrl,
      alt: photo.alt,
      photographerName: photo.photographerName,
      photographerUrl: photo.photographerUrl,
      sourceUrl: photo.sourceUrl,
      width: photo.width,
      height: photo.height,
    })),
  };
}

export async function verifyCustomDomainAction(domainValue: string) {
  const { accountId } = await requireOfficeContext('settings.write');
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
  const { accountId } = await requireOfficeContext('settings.write');
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose an image to upload.');
  }

  return uploadSiteImage(accountId, file);
}

// Videos never travel through a server action — a Vercel action body caps at
// 4.5 MB and the smallest real phone clip is bigger than that. The server hands
// back a signed URL scoped to this account's folder and the browser uploads
// straight to storage.
export async function createSiteVideoUploadAction(
  fileName: string,
  contentType: string,
  sizeBytes: number,
): Promise<SignedVideoUpload> {
  const { accountId } = await requireOfficeContext('settings.write');
  // Coerced rather than trusted: this is the one upload whose size the server is
  // told instead of measuring. A missing or nonsense value becomes 0, which
  // checks the allowance against what is already stored rather than skipping it.
  const claimedBytes = Number.isFinite(sizeBytes) && sizeBytes > 0 ? Math.floor(sizeBytes) : 0;
  return createSignedVideoUpload(
    accountId,
    String(fileName || 'video'),
    String(contentType || ''),
    claimedBytes,
  );
}

// Best-effort cleanup when an owner removes a video from the page. A failure
// here leaves an orphaned file, which is far better than refusing to let them
// take a video down — so the caller ignores the result.
export async function deleteSiteVideoAction(url: string) {
  const { accountId } = await requireOfficeContext('settings.write');
  const path = siteVideoStoragePath(String(url || ''), accountId);
  if (!path) return;
  await deleteSiteVideo(accountId, path);
}

export type JobPhotoImportOption = {
  path: string;
  url: string;
  label: string;
};

export async function listCompletedJobPhotoOptionsAction(): Promise<JobPhotoImportOption[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
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
  const { accountId } = await requireOfficeContext('settings.write');
  return importJobPhotoAsSiteImage(accountId, path, label || 'Completed job photo');
}

export async function deleteSiteImageAction(storagePath: string) {
  const { accountId } = await requireOfficeContext('settings.write');
  await deleteSiteImage(accountId, storagePath);
}

export type CompletedJobReviewOption = {
  id: string;
  clientName: string;
  rating: number;
  feedback: string;
  jobRef: string;
  date: string;
};

export async function listCompletedJobReviewsAction(): Promise<CompletedJobReviewOption[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data, error } = await supabase
    .from('review_invites')
    .select('id, client_name, rating, feedback, created_at, responded_at, feedback_at, jobs(ref, scope)')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('review_invites')
      .select('id, client_name, rating, feedback, created_at, responded_at, feedback_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (fallbackError) return [];
    return (fallbackData ?? [])
      .filter((row) => (row.rating && row.rating >= 4) || (row.feedback && row.feedback.trim().length > 0))
      .map((row) => ({
        id: row.id,
        clientName: row.client_name?.trim() || 'Verified Customer',
        rating: Math.max(1, Math.min(5, Math.round(row.rating || 5))),
        feedback: row.feedback?.trim() || 'Great service, highly recommend!',
        jobRef: '',
        date: (row.feedback_at || row.responded_at || row.created_at || '').slice(0, 10),
      }));
  }

  return (data ?? [])
    .filter((row) => (row.rating && row.rating >= 4) || (row.feedback && row.feedback.trim().length > 0))
    .map((row) => {
      const job = row.jobs as { ref?: string; scope?: string } | null;
      const label = job?.scope ? job.scope : job?.ref ? `Job ${job.ref}` : '';
      return {
        id: row.id,
        clientName: row.client_name?.trim() || 'Verified Customer',
        rating: Math.max(1, Math.min(5, Math.round(row.rating || 5))),
        feedback: row.feedback?.trim() || 'Great service, highly recommend!',
        jobRef: label,
        date: (row.feedback_at || row.responded_at || row.created_at || '').slice(0, 10),
      };
    });
}

/**
 * Regenerates copy for a single section (hero, services, faqs, or testimonials).
 */
export async function regenerateSectionCopyAction(
  section: 'hero' | 'services' | 'faqs' | 'testimonials',
  options: { companyName?: string; trade?: string; serviceArea?: string; zip?: string } = {},
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
  const { accountId } = await requireOfficeContext('sites.write');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: 'AI generation is not configured.' };

  const companyName = options.companyName || 'this local business';
  const trade = options.trade || 'home services contractor';
  const location = options.serviceArea || options.zip || '';

  const instructions = [
    `You write high-converting, professional website copy for a local ${trade} business named "${companyName}".`,
    location ? `They serve the ${location} area.` : '',
    `Generate content ONLY for the "${section}" section.`,
    'Return STRICT JSON only, matching the exact format specified below.',
    section === 'hero'
      ? '{"headline":"<punchy headline under 70 chars>","tagline":"<1-2 sentences under 160 chars>"}'
      : section === 'services'
      ? '{"services":[{"title":"<service title under 40 chars>","description":"<concrete benefit under 130 chars>","icon":"wrench"}]}'
      : section === 'faqs'
      ? '{"faqs":[{"question":"<real homeowner question>","answer":"<helpful answer under 300 chars>"}]}'
      : '{"testimonials":[{"author":"<first name and last initial>","text":"<realistic 1-2 sentence review>","rating":5,"label":"<neighborhood or job type>"}]}',
  ].filter(Boolean).join('\n');

  try {
    const response = await callModel({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      instructions,
      input: `Generate ${section} section content for ${companyName} (${trade}).`,
      text: { format: { type: 'json_object' } },
    }, { accountId, kind: 'site_copy' });

    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const payload = await response.json();
    const data = JSON.parse(extractOutputText(payload)) as Record<string, unknown>;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not generate section copy.' };
  }
}

/**
 * Generates local SEO metadata and geo-targeted keywords.
 */
export async function optimizeSiteSeoAction(
  options: { companyName?: string; trade?: string; serviceArea?: string; zip?: string } = {},
): Promise<{ ok: true; seo: { title: string; description: string; keywords: string[] } } | { ok: false; message: string }> {
  const { accountId } = await requireOfficeContext('sites.write');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: 'AI generation is not configured.' };

  const companyName = options.companyName || 'Local Contractor';
  const trade = options.trade || 'Contractor';
  const location = options.serviceArea || options.zip || '';

  const instructions = [
    `You are an expert in Local SEO for home services contractors.`,
    `Optimize SEO title, meta description, and top high-intent search keywords for "${companyName}", a ${trade} serving ${location || 'their local area'}.`,
    'Return STRICT JSON only:',
    '{"title":"<under 60 chars title>","description":"<under 160 chars meta description with call to action>","keywords":["<keyword 1>","<keyword 2>","<keyword 3>","<keyword 4>","<keyword 5>"]}',
  ].join('\n');

  try {
    const response = await callModel({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      instructions,
      input: `Generate SEO package for ${companyName} (${trade}) in ${location}.`,
      text: { format: { type: 'json_object' } },
    }, { accountId, kind: 'site_copy' });

    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as { title?: string; description?: string; keywords?: string[] };

    return {
      ok: true,
      seo: {
        title: parsed.title || `${companyName} | ${trade}`,
        description: parsed.description || `Professional ${trade} services by ${companyName}. Contact us today for a free quote!`,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
      },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not generate SEO optimization.' };
  }
}

export async function syncCompletedJobsToSiteAction() {
  const { accountId, supabase } = await requireOfficeContext('settings.write');
  const { syncCompletedJobsToSite } = await import('@/lib/site-sync');
  const result = await syncCompletedJobsToSite(supabase, accountId);
  revalidatePath('/dashboard/sites');
  return result;
}

export async function syncClientReviewsToSiteAction() {
  const { accountId, supabase } = await requireOfficeContext('settings.write');
  const { syncClientReviewsToSite } = await import('@/lib/site-sync');
  const result = await syncClientReviewsToSite(supabase, accountId);
  revalidatePath('/dashboard/sites');
  return result;
}

export async function generateLogoTaglinesAction(params: {
  companyName?: string;
  trade?: string;
  serviceArea?: string;
  zip?: string;
}): Promise<{ ok: boolean; taglines?: string[]; message?: string }> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        ok: true,
        taglines: [
          'Master Craftsmanship & Reliable Service',
          'Licensed, Insured & Family Owned',
          'Fast, Honest & Precision Quality',
          'Residential & Commercial Specialists',
          'Your Trusted Local Trade Experts',
        ],
      };
    }

    const companyName = params.companyName?.trim() || 'Our Company';
    const trade = params.trade?.trim() || 'General Contractor';
    const location = params.serviceArea?.trim() || params.zip?.trim() || '';

    const instructions =
      'You generate 5 distinct, high-impact, professional marketing taglines/slogans for a local home services contractor logo. ' +
      'Rules: ' +
      '1. Each tagline must be under 40 characters so it fits cleanly on an invoice, truck wrap, or logo emblem. ' +
      '2. Make them punchy, trustworthy, and industry-specific (e.g. Plumbing, HVAC, Roofing, Electrical). ' +
      '3. Offer varied angles: one reliability/speed, one master craftsmanship/heritage, one local pride, one modern concise, one premium quality. ' +
      '4. Return strict JSON format: {"taglines": ["line 1", "line 2", "line 3", "line 4", "line 5"]}';

    const input = `Company: ${companyName}. Trade: ${trade}. Location: ${location || 'Local'}.`;

    const response = await callModel(
      {
        model: 'gpt-4o-mini',
        temperature: 0.8,
        instructions,
        input,
        text: { format: { type: 'json_object' } },
      },
      { accountId, kind: 'site_copy' }
    );

    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as { taglines?: string[] };

    const taglines = Array.isArray(parsed.taglines)
      ? parsed.taglines.map((t) => String(t).trim().slice(0, 50)).filter(Boolean)
      : [];

    return {
      ok: true,
      taglines: taglines.length > 0 ? taglines : [
        'Master Craftsmanship & Reliable Service',
        'Licensed, Insured & Family Owned',
        'Fast, Honest & Precision Quality',
        'Residential & Commercial Specialists',
        'Your Trusted Local Trade Experts',
      ],
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate taglines.',
      taglines: [
        'Master Craftsmanship & Reliable Service',
        'Licensed, Insured & Family Owned',
        'Fast, Honest & Precision Quality',
        'Residential & Commercial Specialists',
        'Your Trusted Local Trade Experts',
      ],
    };
  }
}

export type GeneratedAiLogo = {
  id: string;
  url: string;
  storagePath: string;
  direction: AiLogoDirection;
  prompt: string;
  createdAt: string;
};

export async function generateAiLogoAction(params: {
  businessName?: string;
  trade?: string | null;
  tagline?: string | null;
  establishedYear?: string | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  emblem?: string | null;
  direction?: string | null;
  creativeBrief?: string | null;
}): Promise<{ ok: boolean; image?: GeneratedAiLogo; logos?: GeneratedAiLogo[]; message?: string }> {
  let siteId: string | null = null;
  const admin = createAdminClient();

  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const businessName = params.businessName?.trim().slice(0, 80) || '';
    if (!businessName) return { ok: false, message: 'Add a business name before generating a logo.' };

    const direction: AiLogoDirection = params.direction && isAiLogoDirection(params.direction)
      ? params.direction
      : 'art_director';
    const prompt = buildAiLogoPrompt({
      businessName,
      trade: params.trade,
      tagline: params.tagline,
      establishedYear: params.establishedYear,
      accentColor: params.accentColor,
      secondaryColor: params.secondaryColor,
      emblem: params.emblem,
      direction,
      creativeBrief: params.creativeBrief,
    });

    // Record pending generation task in site.content so navigation away is fully supported
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (siteRow) {
      siteId = siteRow.id;
      const currentContent = (siteRow.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<string, unknown>;
      const pendingRecord: PendingAiLogo = {
        id: `pending-${Date.now()}`,
        startedAt: new Date().toISOString(),
        prompt,
        direction,
        status: 'pending',
      };
      await admin.from('sites').update({
        content: { ...currentContent, pending_ai_logo: pendingRecord },
        updated_at: new Date().toISOString(),
      }).eq('id', siteRow.id);
    }

    const response = await callImageModel(
      {
        model: process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'medium',
        background: 'transparent',
        output_format: 'png',
        moderation: 'auto',
        user: accountId,
      },
      { accountId, kind: 'site_copy' },
    );

    if (!response.ok) {
      const requestId = response.headers.get('x-request-id');
      const payload = await response.json().catch(() => null) as {
        error?: { code?: string; type?: string; message?: string };
      } | null;
      console.error('AI logo generation failed', {
        status: response.status,
        requestId,
        code: payload?.error?.code,
        type: payload?.error?.type,
        message: payload?.error?.message,
      });

      let failMsg = `Image model request failed (${response.status}).`;
      if (payload?.error?.code === 'moderation_blocked') {
        failMsg = 'That brief could not be generated. Try describing the visual idea in more neutral brand language.';
      } else if (response.status === 429) {
        failMsg = 'The AI studio is at capacity right now. Wait a moment and try again.';
      } else if (response.status === 401) {
        const errorDetail = payload?.error?.message;
        if (errorDetail?.includes('Missing scopes') || errorDetail?.includes('permissions')) {
          failMsg = 'Image model request failed (401): The OpenAI API key lacks image generation permissions (missing api.model.images.request scope).';
        } else {
          failMsg = 'Image model request failed (401): Authentication failed. Check your OpenAI API key.';
        }
      }

      // Record failure on site.content so returning users see the status
      if (siteId) {
        const { data: freshSite } = await admin.from('sites').select('content').eq('id', siteId).maybeSingle();
        const freshContent = (freshSite?.content && typeof freshSite.content === 'object' ? freshSite.content : {}) as Record<string, unknown>;
        await admin.from('sites').update({
          content: {
            ...freshContent,
            pending_ai_logo: {
              id: `failed-${Date.now()}`,
              startedAt: new Date().toISOString(),
              status: 'failed',
              error: failMsg,
            },
          },
          updated_at: new Date().toISOString(),
        }).eq('id', siteId);
      }

      return { ok: false, message: failMsg };
    }

    const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error('The image model returned no logo. Try generating another direction.');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.byteLength === 0) throw new Error('The generated logo file was empty. Try again.');

    const stored = await uploadGeneratedSiteImage(accountId, {
      bytes,
      mimeType: 'image/png',
      fileName: `${businessName}-ai-logo`,
      alt: `${businessName} AI-generated logo`,
    });

    const newLogo: GeneratedAiLogo = {
      id: stored.id,
      url: stored.url,
      storagePath: stored.storagePath || '',
      direction,
      prompt,
      createdAt: new Date().toISOString(),
    };

    // Auto-save the new logo permanently in site.content.ai_logos and clear pending_ai_logo
    let nextLogos: GeneratedAiLogo[] = [newLogo];
    if (siteId) {
      const { data: freshSite } = await admin.from('sites').select('content').eq('id', siteId).maybeSingle();
      const freshContent = (freshSite?.content && typeof freshSite.content === 'object' ? freshSite.content : {}) as Record<string, unknown>;
      const existingLogos = Array.isArray(freshContent.ai_logos) ? (freshContent.ai_logos as GeneratedAiLogo[]) : [];
      nextLogos = [newLogo, ...existingLogos.filter((l) => l.id !== newLogo.id && l.storagePath !== newLogo.storagePath)];

      await admin.from('sites').update({
        content: {
          ...freshContent,
          ai_logos: nextLogos,
          pending_ai_logo: null,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', siteId);
    }

    revalidatePath('/dashboard/sites');

    return {
      ok: true,
      image: newLogo,
      logos: nextLogos,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Could not generate a logo right now.';
    if (siteId) {
      try {
        const { data: freshSite } = await admin.from('sites').select('content').eq('id', siteId).maybeSingle();
        const freshContent = (freshSite?.content && typeof freshSite.content === 'object' ? freshSite.content : {}) as Record<string, unknown>;
        await admin.from('sites').update({
          content: {
            ...freshContent,
            pending_ai_logo: {
              id: `failed-${Date.now()}`,
              startedAt: new Date().toISOString(),
              status: 'failed',
              error: errorMsg,
            },
          },
          updated_at: new Date().toISOString(),
        }).eq('id', siteId);
      } catch {
        // Best-effort cleanup
      }
    }
    return {
      ok: false,
      message: errorMsg,
    };
  }
}

export async function getAiLogosAction(): Promise<{
  logos: GeneratedAiLogo[];
  pending: PendingAiLogo | null;
}> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (!siteRow) return { logos: [], pending: null };

    const content = (siteRow.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<string, unknown>;
    let logos = Array.isArray(content.ai_logos) ? (content.ai_logos as GeneratedAiLogo[]) : [];

    // If ai_logos is empty, auto-discover any existing AI logo assets in site-images storage matching -ai-logo
    if (logos.length === 0) {
      const uploaded = await listUploadedSiteImages(accountId).catch(() => []);
      const legacyLogos = uploaded.filter((img) => img.storagePath?.includes('-ai-logo'));
      if (legacyLogos.length > 0) {
        logos = legacyLogos.map((img) => ({
          id: img.id,
          url: img.url,
          storagePath: img.storagePath || '',
          direction: 'art_director' as AiLogoDirection,
          prompt: img.alt || 'AI generated logo concept',
          createdAt: new Date().toISOString(),
        }));
        await admin.from('sites').update({
          content: { ...content, ai_logos: logos },
          updated_at: new Date().toISOString(),
        }).eq('id', siteRow.id);
      }
    }

    // Check pending generation status
    let pending: PendingAiLogo | null = null;
    if (content.pending_ai_logo && typeof content.pending_ai_logo === 'object') {
      const rawPending = content.pending_ai_logo as PendingAiLogo;
      const startedAtMs = Date.parse(rawPending.startedAt);
      // Auto-expire pending tasks older than 3 minutes (180,000 ms)
      if (!Number.isNaN(startedAtMs) && Date.now() - startedAtMs < 180000 && rawPending.status === 'pending') {
        pending = rawPending;
      } else if (rawPending.status === 'pending') {
        await admin.from('sites').update({
          content: { ...content, pending_ai_logo: null },
          updated_at: new Date().toISOString(),
        }).eq('id', siteRow.id);
      } else if (rawPending.status === 'failed') {
        pending = rawPending;
      }
    }

    return { logos, pending };
  } catch (err) {
    console.error('Failed to get AI logos', err);
    return { logos: [], pending: null };
  }
}

export async function deleteAiLogoAction(
  storagePath: string,
  logoId: string,
): Promise<{ ok: boolean; message?: string; logos?: GeneratedAiLogo[] }> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();

    // 1. Remove from storage bucket if storagePath is provided
    if (storagePath && storagePath.startsWith(`${accountId}/`)) {
      await deleteSiteImage(accountId, storagePath).catch((err) => {
        console.warn('Failed to delete file from site-images storage:', err);
      });
    }

    // 2. Remove from site.content.ai_logos in database
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (!siteRow) return { ok: false, message: 'Site not found' };

    const content = (siteRow.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<string, unknown>;
    const existingLogos = Array.isArray(content.ai_logos) ? (content.ai_logos as GeneratedAiLogo[]) : [];
    const remainingLogos = existingLogos.filter((logo) => logo.id !== logoId && logo.storagePath !== storagePath);

    await admin.from('sites').update({
      content: {
        ...content,
        ai_logos: remainingLogos,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', siteRow.id);

    revalidatePath('/dashboard/sites');
    return { ok: true, logos: remainingLogos };
  } catch (error) {
    console.error('Failed to delete AI logo', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not delete logo.',
    };
  }
}

export async function dismissAiLogoPendingAction(): Promise<{ ok: boolean }> {
  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    if (siteRow) {
      const content = (siteRow.content && typeof siteRow.content === 'object' ? siteRow.content : {}) as Record<string, unknown>;
      await admin.from('sites').update({
        content: { ...content, pending_ai_logo: null },
        updated_at: new Date().toISOString(),
      }).eq('id', siteRow.id);
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getAvailableAiCreditsAction(): Promise<number | null> {
  try {
    const { supabase, accountId } = await requireOfficeContext('settings.read');
    const { data: balanceRows } = await supabase
      .from('workspace_usage_credit_balances')
      .select('resource_code, available_units')
      .eq('account_id', accountId);

    const aiIntakeUnits = balanceRows?.find((r) => r.resource_code === 'ai_intake_threads')?.available_units;
    const aiWritingUnits = balanceRows?.find((r) => r.resource_code === 'ai_writing_drafts')?.available_units;
    const hasAiBalance = typeof aiIntakeUnits === 'number' || typeof aiWritingUnits === 'number';
    if (!hasAiBalance) return null;
    return (typeof aiIntakeUnits === 'number' ? aiIntakeUnits : 0) + (typeof aiWritingUnits === 'number' ? aiWritingUnits : 0);
  } catch {
    return null;
  }
}

export type NearbyCityCandidate = {
  name: string;
  miles?: number;
};

export type NearbyCitiesResult = {
  ok: boolean;
  centerPlace?: string;
  radiusMiles?: number;
  cities: string[];
  candidates: NearbyCityCandidate[];
  message?: string;
};

export async function suggestNearbyCitiesAction(options: {
  baseLocation: string;
  radiusMiles?: number;
  existingCities?: string[];
}): Promise<NearbyCitiesResult> {
  const { accountId } = await requireOfficeContext('settings.read');
  const base = (options.baseLocation || '').trim();
  if (!base) {
    return { ok: false, cities: [], candidates: [], message: 'Please provide a base city or ZIP code.' };
  }

  const radiusMiles = options.radiusMiles && Number.isFinite(options.radiusMiles)
    ? Math.max(5, Math.min(100, Math.round(options.radiusMiles)))
    : 35;

  try {
    const geo = await geocodeArea(base);
    const resolvedCenter = geo.ok ? (geo.place || geo.label || base) : base;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallbackList = geo.ok && geo.place ? [geo.place] : [base];
      return {
        ok: true,
        centerPlace: resolvedCenter,
        radiusMiles,
        cities: fallbackList,
        candidates: fallbackList.map((c) => ({ name: c, miles: 0 })),
      };
    }

    const instructions =
      'You are a geographic data assistant. Given a base city/ZIP in the United States, list real, official neighboring municipalities, towns, townships, and suburbs ordered from closest to furthest within the driving radius.\n' +
      'Rules:\n' +
      '1. Format every place name with its 2-letter state postal abbreviation (e.g. "Royal Oak, MI", "Troy, MI", "Birmingham, MI").\n' +
      '2. Only include real, legitimate municipality names within this exact geographic radius.\n' +
      '3. Order strictly from closest to furthest by distance outward.\n' +
      '4. Return a JSON object with a "candidates" array of objects with "name" (string) and "miles" (number, distance from base). Return 20 to 30 surrounding municipalities. Example: {"candidates": [{"name": "Berkley, MI", "miles": 2.2}, {"name": "Clawson, MI", "miles": 3.1}, {"name": "Huntington Woods, MI", "miles": 3.5}, {"name": "Birmingham, MI", "miles": 4.3}, {"name": "Ferndale, MI", "miles": 4.9}, {"name": "Troy, MI", "miles": 5.8}, ...]}.';

    const input = `Base location: ${resolvedCenter}. Maximum driving radius: ${radiusMiles} miles. Return all surrounding towns and suburbs within this radius sorted outward.`;

    const response = await callModel(
      {
        model: 'gpt-4o-mini',
        temperature: 0.2,
        instructions,
        input,
        text: { format: { type: 'json_object' } },
      },
      { accountId, kind: 'site_copy' } // Free/exempt kind - 0 AI credits charged
    );

    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as {
      candidates?: Array<{ name?: unknown; miles?: unknown }>;
      cities?: unknown[];
    };

    let candidates: NearbyCityCandidate[] = [];

    if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
      candidates = parsed.candidates
        .map((c) => {
          const name = typeof c?.name === 'string' ? c.name.trim() : '';
          const miles = typeof c?.miles === 'number' && Number.isFinite(c.miles) ? Math.round(c.miles * 10) / 10 : undefined;
          return { name, miles };
        })
        .filter((c) => c.name.length > 0 && c.name.length <= 60);
    } else if (Array.isArray(parsed.cities)) {
      candidates = parsed.cities
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c) => c.length > 0 && c.length <= 60)
        .map((name, i) => ({ name, miles: Math.round((i * 1.5 + 2) * 10) / 10 }));
    }

    // Deduplicate candidates preserving order
    const seen = new Set<string>();
    const deduplicatedCandidates: NearbyCityCandidate[] = [];
    for (const c of candidates) {
      const lower = c.name.toLowerCase().trim();
      if (!seen.has(lower)) {
        seen.add(lower);
        deduplicatedCandidates.push(c);
      }
    }

    const flatCities = deduplicatedCandidates.map((c) => c.name);

    return {
      ok: true,
      centerPlace: resolvedCenter,
      radiusMiles,
      cities: flatCities,
      candidates: deduplicatedCandidates,
    };
  } catch (error) {
    return {
      ok: false,
      cities: [],
      candidates: [],
      message: error instanceof Error ? error.message : 'Could not suggest cities right now.',
    };
  }
}

export type IntakeLocationTestResult = {
  ok: boolean;
  matched: boolean;
  locationLabel: string;
  matchedCity?: string;
  resolvedPlace?: string;
  message?: string;
};

export async function testIntakeLocationAction(params: {
  testLocation: string;
  servedCities: string[];
}): Promise<IntakeLocationTestResult> {
  const query = (params.testLocation || '').trim();
  const served = (params.servedCities || []).map((c) => c.trim()).filter(Boolean);

  if (!query) {
    return { ok: false, matched: false, locationLabel: '', message: 'Enter a city or ZIP code to test.' };
  }
  if (served.length === 0) {
    return { ok: true, matched: false, locationLabel: query, message: 'No cities currently configured in your service area.' };
  }

  // 1. Direct match check
  if (matchesServedCity(query, served)) {
    return {
      ok: true,
      matched: true,
      locationLabel: query,
      matchedCity: query,
      message: `Matches "${query}" in your active service list. Smart Intake and quote forms will accept this customer.`,
    };
  }

  // 2. Geocode / ZIP resolution check
  try {
    const geo = await geocodeArea(query);
    if (geo.ok && (geo.place || geo.label)) {
      const placeName = geo.place || geo.label || query;
      const matched = matchesServedCity(placeName, served);
      return {
        ok: true,
        matched,
        locationLabel: geo.label || placeName,
        matchedCity: matched ? placeName : undefined,
        resolvedPlace: placeName,
        message: matched
          ? `Resolved to "${placeName}" which matches your service list. Smart Intake will accept this customer.`
          : `Resolved to "${placeName}" which is outside your active service list.`,
      };
    }
  } catch {
    // geocode failure fallback
  }

  return {
    ok: true,
    matched: false,
    locationLabel: query,
    message: `"${query}" was not found in your active service list.`,
  };
}
