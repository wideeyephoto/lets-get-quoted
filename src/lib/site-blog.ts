import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteContent, mergeSiteContent, type SiteBlogPost } from '@/lib/site-content';

// preserveBlogPosts and uniqueBlogSlug live in site-content.ts, not here.
// preserveBlogPosts is the invariant this whole split rests on and it has to be
// testable, which a module importing 'server-only' is not.
export { preserveBlogPosts, uniqueBlogSlug } from '@/lib/site-content';

/**
 * Blog posts, which the website builder no longer owns.
 *
 * Posts are edited on Marketing → Blog, written by the biweekly cron, and
 * created from a seasonal topic on the Marketing page. They still LIVE in
 * sites.content (no separate table), and that is the whole problem this module
 * exists to solve: the builder holds the entire content object in the browser
 * and saves it wholesale, so anything written here would be silently
 * overwritten the next time somebody pressed Save on the website builder.
 *
 * The rule is ownership, not locking. The builder decides how the blog band
 * LOOKS — on or off, its heading, its layout. This module owns what is IN it.
 * preserveBlogPosts() below is that rule made enforceable rather than agreed.
 */

export type BlogWorkspaceData = {
  siteId: string;
  companyName: string;
  serviceArea: string;
  trade: string;
  posts: SiteBlogPost[];
  reminderWeeks: number;
  /** The band is switched on in the builder. Posts publish regardless; this
   *  only says whether the website is currently showing them. */
  sectionEnabled: boolean;
  /** Where a published post can be read, when the site is live. */
  publicBase: string | null;
};

export async function loadBlogWorkspace(
  supabase: SupabaseClient,
  accountId: string,
  rootDomain: string,
): Promise<BlogWorkspaceData | null> {
  const { data: site } = await supabase
    .from('sites')
    .select('id, company_name, service_area, content, subdomain, custom_domain, published')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) return null;

  const content = getSiteContent(site.content as Record<string, unknown> | null);
  const customDomain = site.custom_domain as string | null;
  const subdomain = site.subdomain as string | null;

  return {
    siteId: site.id as string,
    companyName: (site.company_name as string) || '',
    serviceArea: (site.service_area as string) || '',
    trade: content.trade,
    posts: content.blog.posts,
    reminderWeeks: content.blog.reminderWeeks,
    sectionEnabled: content.blog.enabled,
    publicBase: site.published
      ? customDomain
        ? `https://${customDomain}/blog`
        : subdomain
          ? `https://${subdomain}.${rootDomain}/blog`
          : null
      : null,
  };
}

/**
 * Write the post list back, and nothing else.
 *
 * Re-reads immediately before writing rather than trusting a content object
 * from the caller, so two edits in quick succession on the blog page cannot
 * drop each other. It cannot protect against the website builder, which is why
 * the builder no longer sends posts at all.
 */
export async function saveBlogPosts(
  supabase: SupabaseClient,
  accountId: string,
  update: (posts: SiteBlogPost[]) => SiteBlogPost[],
  blogFields?: Partial<{ reminderWeeks: number; enabled: boolean }>,
): Promise<SiteBlogPost[]> {
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) throw new Error('No site found for your account.');

  const raw = (site.content as Record<string, unknown> | null) ?? {};
  const content = getSiteContent(raw);
  const posts = update(content.blog.posts);

  const { error } = await supabase
    .from('sites')
    .update({ content: mergeSiteContent(raw, { blog: { ...content.blog, ...blogFields, posts } }) })
    .eq('id', site.id);
  if (error) throw new Error(error.message);

  return posts;
}
