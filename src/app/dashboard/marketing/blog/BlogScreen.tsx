import Link from 'next/link';
import type { PostState } from '@/lib/marketing-status';
import type { BlogWorkspaceData } from '@/lib/site-blog';
import MarketingNav from '../MarketingNav';
import BlogWorkspace from './BlogWorkspace';

/**
 * The Blog section, given its posts.
 *
 * Split out of page.tsx so the demo renders the same screen — see the note on
 * CampaignsScreen. In the demo the workspace is handed readOnly, which withholds
 * the two panels that write (drafting a post, setting the reminder) and keeps
 * the list, its filters and its state chips, which are the part worth showing.
 */
export default function BlogScreen({
  blog,
  initialTopic,
  initialFilter,
  basePath = '/dashboard',
  navOnly,
  readOnly = false,
}: {
  blog: BlogWorkspaceData | null;
  initialTopic: string;
  initialFilter: PostState | 'all';
  basePath?: string;
  navOnly?: string[];
  readOnly?: boolean;
}) {
  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

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
            You need a website before you can post to it. <Link href={`${basePath}/sites`}>Set one up →</Link>
          </p>
        </section>
      ) : (
        <BlogWorkspace
          initialPosts={blog.posts}
          reminderWeeks={blog.reminderWeeks}
          sectionEnabled={blog.sectionEnabled}
          initialTopic={initialTopic}
          initialFilter={initialFilter}
          basePath={basePath}
          readOnly={readOnly}
        />
      )}
    </main>
  );
}
