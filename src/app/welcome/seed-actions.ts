'use server';

import { requireOwnerContext } from '@/lib/auth';
import { getOrCreateSite } from '@/lib/sites';
import { applyGeneratedSiteText, siteIsUnwritten } from '@/lib/site-seed';
import { generateSiteTextAction } from '@/app/dashboard/sites/actions';

export type SeedResult =
  | { ok: true; built: true }
  | { ok: true; built: false; reason: 'already_written' }
  | { ok: false; error: string };

/**
 * Build the contractor's whole site from the three first-run answers, and SAVE
 * it, so they land on a finished site rather than an unsaved builder they could
 * lose by closing the tab.
 *
 * Called from /welcome AFTER acceptance is recorded, not during it. Acceptance
 * is a database write that must always succeed in a few milliseconds; this is a
 * model call that can take ten seconds and can fail. Putting them in one action
 * would mean a slow OpenAI day makes signing up look broken, and an OpenAI
 * outage makes it impossible.
 *
 * skipFirstRunGate: acceptance was just written, but this call may race the
 * revalidate, and being bounced to /welcome mid-build would be absurd.
 *
 * NEVER clobbers work. siteIsUnwritten is the guard: the builder's own Generate
 * button asks the owner to confirm before overwriting, and here there is nobody
 * to ask, so anything already written means stop. That also makes this safe to
 * retry and safe to call twice.
 */
export async function seedSiteFromFirstRunAction(): Promise<SeedResult> {
  const { supabase, accountId } = await requireOwnerContext({ skipFirstRunGate: true });

  // Creates the site if it doesn't exist yet, seeded with the business name,
  // trade and ZIP from first run — which is exactly what the generator reads.
  const site = await getOrCreateSite(supabase, accountId);

  if (!siteIsUnwritten(site)) {
    return { ok: true, built: false, reason: 'already_written' };
  }

  try {
    const generated = await generateSiteTextAction();
    const next = applyGeneratedSiteText(site, generated);

    const { error } = await supabase
      .from('sites')
      .update({
        headline: next.headline,
        tagline: next.tagline,
        seo_title: next.seo_title,
        seo_description: next.seo_description,
        hours: next.hours,
        service_area: next.service_area,
        hero_url: next.hero_url,
        content: next.content,
      })
      .eq('id', site.id)
      .eq('account_id', accountId);

    if (error) {
      console.error('seedSiteFromFirstRunAction save failed:', error.message);
      return { ok: false, error: 'We built your site but could not save it. Open the website builder and press Generate.' };
    }

    return { ok: true, built: true };
  } catch (error) {
    // A failure here must never block anyone: the account exists, the terms are
    // accepted, and the site is still there to build by hand. Report it and let
    // the caller move on.
    console.error('seedSiteFromFirstRunAction failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'We could not build your site automatically just now. Everything else is set up — open the website builder and press Generate.' };
  }
}
