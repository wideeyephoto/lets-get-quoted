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

      <section className="workspace-hero panel" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Search Engine Optimization</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Blog &amp; SEO
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              Publish helpful homeowner guides to build trust, earn local Google rankings, and fuel your email newsletters.
            </p>
          </div>

          <div className="mkt-hero-actions">
            {blog?.publicBase ? (
              <a
                href={blog.publicBase}
                target="_blank"
                rel="noopener noreferrer"
                className="btn secondary btn-sm"
              >
                View live blog ↗
              </a>
            ) : blog ? (
              <Link href={`${basePath}/sites`} className="btn ghost btn-sm">
                Your website isn&apos;t published yet →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {!blog ? (
        <section className="panel workspace-section-card">
          <div className="empty-state">
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Your blog lives directly on your contractor website.</p>
            <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
              Articles published here share your business domain, branding, phone number, and quote forms so reading homeowners can turn into booked jobs. Create your website first to start publishing articles.
            </p>
            <Link href={`${basePath}/sites`} className="btn primary">
              Set up your website first →
            </Link>
          </div>
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
          trade={blog.trade}
          publicBase={blog.publicBase}
        />
      )}
    </main>
  );
}
