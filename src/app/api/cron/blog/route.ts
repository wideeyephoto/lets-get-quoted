import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { getSiteContent, slugifyBlogTitle } from '@/lib/site-content';
import { draftBlogPost } from '@/lib/blog-generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Bound work per run so one invocation can't hang on hundreds of OpenAI calls.
const MAX_DRAFTS_PER_RUN = 40;

// Biweekly auto-drafter (scheduled in vercel.json for the 1st + 15th). For each
// site with the blog section enabled, draft ONE fresh post and store it as an
// unpublished draft — the owner still reviews and publishes it (Google's
// scaled-content policy makes auto-publishing unreviewed AI content risky).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  // Fail closed: no secret configured, or a mismatched token, means no run.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, company_name, service_area, content')
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let drafted = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites ?? []) {
    if (drafted >= MAX_DRAFTS_PER_RUN) break;

    const content = getSiteContent(site.content);
    if (!content.blog.enabled) {
      skipped++;
      continue;
    }

    try {
      const draft = await draftBlogPost({
        companyName: site.company_name || '',
        serviceArea: site.service_area || '',
      });

      const slugBase = slugifyBlogTitle(draft.title) || 'post';
      const existing = new Set(content.blog.posts.map((post) => post.slug));
      let slug = slugBase;
      let suffix = 2;
      while (existing.has(slug)) slug = `${slugBase}-${suffix++}`;

      const post = {
        id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        slug,
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        coverImage: '',
        status: 'draft' as const,
        date: new Date().toISOString().slice(0, 10),
      };

      const rawContent = (site.content && typeof site.content === 'object' ? site.content : {}) as Record<string, unknown>;
      const nextContent = { ...rawContent, blog: { ...content.blog, posts: [post, ...content.blog.posts] } };

      const { error: updateError } = await supabase.from('sites').update({ content: nextContent }).eq('id', site.id);
      if (updateError) {
        failed++;
        continue;
      }
      drafted++;
    } catch (draftError) {
      console.error('Cron blog draft failed for site', site.id, draftError);
      failed++;
    }
  }

  return NextResponse.json({ drafted, skipped, failed });
}
