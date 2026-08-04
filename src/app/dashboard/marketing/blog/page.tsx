import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { loadBlogWorkspace } from '@/lib/site-blog';
import BlogWorkspace from './BlogWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog' };

// The blog moved out of the website builder.
//
// It was reachable only by opening /dashboard/sites, finding the Blog section
// among a dozen others, and expanding it — which made writing a post feel like
// editing a website rather than doing marketing. It is marketing: the posts are
// the same seasonal topics the calendar proposes, drafted by the same model,
// aimed at the same customers.
//
// The builder keeps what the builder is for: whether the band shows, what it is
// headed, and how the posts are laid out.
export default async function MarketingBlogPage({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const blog = await loadBlogWorkspace(supabase, accountId, rootDomain);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">
            <Link href="/dashboard/marketing">Marketing</Link> · Blog
          </p>
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
          publicBase={blog.publicBase}
          initialTopic={(searchParams.topic ?? '').slice(0, 200)}
        />
      )}
    </main>
  );
}
