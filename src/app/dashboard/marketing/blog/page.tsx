import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { loadBlogWorkspace } from '@/lib/site-blog';
import type { PostState } from '@/lib/marketing-status';
import MarketingNav from '../MarketingNav';
import BlogWorkspace from './BlogWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog' };

const FILTER_IDS = new Set(['all', 'draft', 'ready', 'scheduled', 'published', 'archived']);

/**
 * Blog, as a sub-workspace of Marketing.
 *
 * It was reachable only by opening /dashboard/sites, finding the Blog section
 * among a dozen others, and expanding it — which made writing a post feel like
 * editing a website rather than doing marketing. It is marketing: the posts are
 * the same seasonal topics the calendar proposes, drafted by the same model,
 * aimed at the same customers.
 *
 * The builder keeps what the builder is for: whether the band shows, what it is
 * headed, and how the posts are laid out.
 */
export default async function MarketingBlogPage({
  searchParams,
}: {
  searchParams: { topic?: string; status?: string };
}) {
  // The legacy ?post=<id> shape is forwarded to the post's own route by the
  // middleware, before anything here renders — see the note there for why it
  // cannot be a redirect() from inside this component.
  const { supabase, accountId } = await requireOwnerContext();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const blog = await loadBlogWorkspace(supabase, accountId, rootDomain);

  const requested = (searchParams.status ?? '').toLowerCase();
  const initialFilter = (FILTER_IDS.has(requested) ? requested : 'all') as PostState | 'all';

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Blog</p>
          <h1 className="workspace-title">Posts for your website</h1>
          <p className="workspace-lead">
            Useful articles for homeowners — maintenance tips, seasonal advice, what to know before hiring. They give
            Google more local pages to rank and give past customers a reason to come back.{' '}
            {blog?.publicBase ? (
              <a href={blog.publicBase} target="_blank" rel="noopener noreferrer">See them on your site ↗</a>
            ) : null}
          </p>
        </div>
      </section>

      {!blog ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            You need a website before you can post to it. <Link href="/dashboard/sites">Set one up →</Link>
          </p>
        </section>
      ) : (
        <BlogWorkspace
          initialPosts={blog.posts}
          reminderWeeks={blog.reminderWeeks}
          sectionEnabled={blog.sectionEnabled}
          initialTopic={(searchParams.topic ?? '').slice(0, 200)}
          initialFilter={initialFilter}
        />
      )}
    </main>
  );
}
