import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { getSiteContent, slugifyBlogTitle } from '@/lib/site-content';
import { draftBlogPost } from '@/lib/blog-generate';
import { shouldAutoPublish } from '@/lib/marketing-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Bound work per run so one invocation can't hang on hundreds of OpenAI calls.
const MAX_DRAFTS_PER_RUN = 40;

// Biweekly auto-drafter (scheduled in vercel.json for the 1st + 15th). For each
// site with the blog section enabled, draft ONE fresh post and store it as an
// unpublished draft — the owner still reviews and publishes it (Google's
// scaled-content policy makes auto-publishing unreviewed AI content risky).
//
// The only cron whose work is inline rather than a library call, so it is the
// only one that passes a closure to cronRoute rather than a function reference.
// It was also the only one with no try/catch at all: a throw anywhere in the
// loop below produced an unhandled 500 with nothing recorded. cronRoute catches
// it now, and the message lands in cron_runs.error.
export const GET = cronRoute('blog', async () => {
  const supabase = createAdminClient();
  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, company_name, service_area, content')
    .limit(500);

  // Thrown rather than returned as a 500 body: this is a failed run, and the
  // health page needs it recorded as one. Previously it returned early with the
  // Postgres message and looked, from outside, exactly like a run that found
  // nothing to do.
  if (error) throw new Error(`sites query failed: ${error.message}`);

  const today = new Date().toISOString().slice(0, 10);
  // Auto-drafting stays biweekly (1st + 15th); the daily run otherwise just
  // publishes scheduled posts whose date has arrived.
  const isDraftDay = new Date().getDate() === 1 || new Date().getDate() === 15;

  let drafted = 0;
  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites ?? []) {
    const content = getSiteContent(site.content);
    let posts = content.blog.posts;
    let changed = false;

    // 1) Publish any scheduled drafts whose auto-publish date has arrived.
    //
    // Through shouldAutoPublish rather than a `status !== 'published'` test.
    // That test was correct while there were two statuses and became a bug with
    // the third: a post somebody ARCHIVED while it still held a schedule would
    // put itself back on their website overnight.
    posts = posts.map((post) => {
      if (shouldAutoPublish(post, today)) {
        published++;
        changed = true;
        return { ...post, status: 'published' as const, publishAt: '', date: today };
      }
      return post;
    });

    // 2) Biweekly AI auto-draft (owner still reviews/publishes it).
    if (isDraftDay && content.blog.enabled && drafted < MAX_DRAFTS_PER_RUN) {
      try {
        const draft = await draftBlogPost({
          companyName: site.company_name || '',
          trade: content.trade,
          serviceArea: site.service_area || '',
        });
        const slugBase = slugifyBlogTitle(draft.title) || 'post';
        const existing = new Set(posts.map((post) => post.slug));
        let slug = slugBase;
        let suffix = 2;
        while (existing.has(slug)) slug = `${slugBase}-${suffix++}`;
        posts = [{
          id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          slug,
          title: draft.title,
          excerpt: draft.excerpt,
          body: draft.body,
          coverImage: '',
          status: 'draft' as const,
          date: today,
          publishAt: '',
        }, ...posts];
        changed = true;
        drafted++;
      } catch (draftError) {
        console.error('Cron blog draft failed for site', site.id, draftError);
        failed++;
      }
    }

    if (!changed) {
      skipped++;
      continue;
    }

    const rawContent = (site.content && typeof site.content === 'object' ? site.content : {}) as Record<string, unknown>;
    const nextContent = { ...rawContent, blog: { ...content.blog, posts } };
    const { error: updateError } = await supabase.from('sites').update({ content: nextContent }).eq('id', site.id);
    if (updateError) failed++;
  }

  return { drafted, published, skipped, failed };
});
