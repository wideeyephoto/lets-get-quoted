import Link from 'next/link';
import type { Metadata } from 'next';
import flagshipStyles from '@/components/flagship/flagship.module.css';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import { cspNonce } from '@/lib/csp-nonce';
import { getPlatformBlogPosts, BLOG_CATEGORIES } from '@/lib/platform-blog';
import { marketingOrigin } from '@/lib/tenant-host';
import BlogIndexClient from './BlogIndexClient';
import styles from './blog.module.css';

export const dynamic = 'force-dynamic';

const BLOG_DESCRIPTION =
  'Straight-talk playbooks and tactical guides for trade business owners: cash flow, quoting, crew operations, speed-to-lead, and local SEO.';

export async function generateMetadata(): Promise<Metadata> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const url = `${origin}/blog`;
  const ogImage = `${origin}/blog/per-seat-pricing.jpg`;

  return {
    title: 'Contractor Business Blog & Industry Guides · Let’s Get Quoted',
    description: BLOG_DESCRIPTION,
    keywords: [
      'contractor business guide',
      'trade business playbooks',
      'field service management',
      'contractor pricing calculator',
      'contractor instant estimates',
      'speed to lead contractors',
      'good better best quotes',
      'contractor change orders',
      'HVAC pricing strategies',
      'electrical contractor operations',
    ],
    authors: [{ name: 'Brett', url: `${origin}/founder` }],
    creator: 'Brett',
    publisher: "Let's Get Quoted",
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': [{ url: `${origin}/blog/rss.xml`, title: "Let's Get Quoted Blog RSS Feed" }],
        'application/feed+json': [{ url: `${origin}/blog/feed.json`, title: "Let's Get Quoted Blog JSON Feed" }],
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title: 'Contractor Business Blog & Tactical Guides · Let’s Get Quoted',
      description: BLOG_DESCRIPTION,
      url,
      siteName: "Let's Get Quoted",
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: ogImage,
          width: 1280,
          height: 720,
          alt: "Let's Get Quoted Contractor Business Blog",
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@letsgetquoted',
      creator: '@letsgetquoted',
      title: 'Contractor Business Blog · Let’s Get Quoted',
      description: BLOG_DESCRIPTION,
      images: [ogImage],
    },
  };
}

export default async function BlogPage() {
  const nonce = await cspNonce();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const posts = await getPlatformBlogPosts({ status: 'published' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: "Let's Get Quoted Contractor Blog",
    description: BLOG_DESCRIPTION,
    url: `${origin}/blog`,
    inLanguage: 'en-US',
    publisher: {
      '@type': 'Organization',
      name: "Let's Get Quoted",
      url: origin,
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/apple-icon.png`,
        width: 512,
        height: 512,
      },
    },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: post.coverImage ? `${origin}${post.coverImage}` : undefined,
      url: `${origin}/blog/${post.slug}`,
      datePublished: `${post.datePublished}T09:00:00Z`,
      dateModified: `${post.dateModified || post.datePublished}T09:00:00Z`,
      keywords: [post.targetKeyword, ...post.tags].filter(Boolean).join(', '),
      articleSection: post.category,
      author: {
        '@type': 'Person',
        name: post.author.name,
        jobTitle: post.author.role,
        url: `${origin}/founder`,
      },
    })),
  };

  return (
    <div className={styles.blogTheme}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.siteShell}>
        <div className={`${styles.ambient} ${styles.ambientOne}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientTwo}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientThree}`} aria-hidden="true" />

        <div className={flagshipStyles.root}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>

          <SiteHeader />
          <LaunchBanner offsetHeader />
          <ThemeFab />

          <main id="main-content" className={styles.container}>
            {/* Hero Header */}
            <header className={styles.hero} aria-labelledby="blog-hero-title">
              <div className={styles.eyebrowChip}>
                <span className={styles.pulseDot} aria-hidden="true" />
                <p className={styles.eyebrowText}>The Contractor Playbook</p>
              </div>
              <h1 id="blog-hero-title" className={styles.heroTitle}>
                Real-world guides <em>for trade business owners.</em>
              </h1>
              <p className={styles.heroLead}>
                No corporate fluff, no agency jargon. Math-first breakdowns on cash flow, pricing, crew accountability, and beating shared lead traps.
              </p>
              <div className={styles.feedBadges}>
                <Link href="/blog/rss.xml" className={styles.feedLink} title="Subscribe via RSS">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 11a9 9 0 0 1 9 9" />
                    <path d="M4 4a16 16 0 0 1 16 16" />
                    <circle cx="5" cy="19" r="1" />
                  </svg>
                  RSS Feed
                </Link>
                <Link href="/blog/feed.json" className={styles.feedLink} title="JSON Feed 1.1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  JSON Feed
                </Link>
              </div>
            </header>

            {/* Interactive Filter & Post List */}
            <BlogIndexClient posts={posts} categories={Array.from(BLOG_CATEGORIES)} />
          </main>

          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
