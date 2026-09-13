import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import flagshipStyles from '@/components/flagship/flagship.module.css';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import { cspNonce } from '@/lib/csp-nonce';
import {
  getPlatformBlogPostBySlug,
  getPlatformBlogPosts,
  getRelatedPlatformBlogPosts,
  type PlatformBlogBlock,
} from '@/lib/platform-blog';
import { marketingOrigin } from '@/lib/tenant-host';
import BlogArticleClient from './BlogArticleClient';
import styles from '../blog.module.css';

interface BlogArticlePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const posts = await getPlatformBlogPosts({ status: 'published' });
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPlatformBlogPostBySlug(slug);
  if (!post) return { title: 'Article Not Found · Let’s Get Quoted' };

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const url = `${origin}/blog/${post.slug}`;

  return {
    title: `${post.title} · Let’s Get Quoted Blog`,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: 'article',
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified || post.datePublished,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const post = await getPlatformBlogPostBySlug(slug);
  if (!post) notFound();

  const nonce = await cspNonce();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const articleUrl = `${origin}/blog/${post.slug}`;
  const relatedPosts = await getRelatedPlatformBlogPosts(post.slug, 3);

  // Extract table of contents from H2 headings
  const tocItems = post.blocks
    .filter((b): b is Extract<PlatformBlogBlock, { type: 'h2' }> => b.type === 'h2')
    .map((b) => ({
      text: b.text,
      id: b.id || b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        url: articleUrl,
        datePublished: post.datePublished,
        dateModified: post.dateModified || post.datePublished,
        author: {
          '@type': 'Person',
          name: post.author.name,
          jobTitle: post.author.role,
        },
        publisher: {
          '@type': 'Organization',
          name: "Let's Get Quoted",
          url: origin,
          logo: `${origin}/apple-icon.png`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: origin,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: `${origin}/blog`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: post.title,
            item: articleUrl,
          },
        ],
      },
    ],
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

        <div className={flagshipStyles.root}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>

          <SiteHeader />
          <LaunchBanner offsetHeader />
          <ThemeFab />

          <main id="main-content" className={styles.readerContainer}>
            {/* Breadcrumb Navigation */}
            <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
              <Link href="/" className={styles.breadcrumbLink}>
                Home
              </Link>
              <span className={styles.breadcrumbSep}>/</span>
              <Link href="/blog" className={styles.breadcrumbLink}>
                Blog
              </Link>
              <span className={styles.breadcrumbSep}>/</span>
              <span style={{ color: 'var(--orange)' }}>{post.category}</span>
            </nav>

            {/* Article Header */}
            <header className={styles.articleHeader}>
              <div className={styles.featuredTag}>
                <span>{post.category}</span>
                <span>·</span>
                <span>{post.readMinutes} min read</span>
              </div>
              <h1 className={styles.articleHeaderTitle}>{post.title}</h1>
              {post.subtitle && <p className={styles.articleHeaderSubtitle}>{post.subtitle}</p>}

              {/* Author and Share Bar */}
              <div className={styles.authorCard}>
                <div className={styles.authorInfo}>
                  <img
                    src={post.author.avatarUrl || '/apple-icon.png'}
                    alt={post.author.name}
                    className={styles.authorAvatar}
                  />
                  <div>
                    <p className={styles.authorName}>{post.author.name}</p>
                    <p className={styles.authorRole}>{post.author.role}</p>
                  </div>
                </div>

                <BlogArticleClient title={post.title} url={articleUrl} />
              </div>
            </header>

            {/* Table of Contents */}
            {tocItems.length > 1 && (
              <aside className={styles.tocBox} aria-label="Table of contents">
                <p className={styles.tocTitle}>In this guide</p>
                <ol className={styles.tocList}>
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`} className={styles.tocLink}>
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </aside>
            )}

            {/* Article Body Block Renderer */}
            <article className={styles.articleBody}>
              {post.blocks.map((block, index) => {
                switch (block.type) {
                  case 'p':
                    return <p key={index}>{block.text}</p>;

                  case 'h2': {
                    const id =
                      block.id ||
                      block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    return (
                      <h2 key={index} id={id}>
                        {block.text}
                      </h2>
                    );
                  }

                  case 'h3': {
                    const id =
                      block.id ||
                      block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    return (
                      <h3 key={index} id={id}>
                        {block.text}
                      </h3>
                    );
                  }

                  case 'ul':
                    return (
                      <ul key={index}>
                        {block.items.map((item, itemIdx) => (
                          <li key={itemIdx}>{item}</li>
                        ))}
                      </ul>
                    );

                  case 'callout': {
                    const kindClass =
                      block.kind === 'warning'
                        ? styles.calloutWarning
                        : block.kind === 'tip'
                        ? styles.calloutTip
                        : styles.calloutInfo;
                    return (
                      <div key={index} className={`${styles.callout} ${kindClass}`}>
                        {block.title && <h4 className={styles.calloutTitle}>{block.title}</h4>}
                        <p className={styles.calloutText}>{block.text}</p>
                      </div>
                    );
                  }

                  case 'quote':
                    return (
                      <blockquote key={index} className={styles.quoteBlock}>
                        <p className={styles.quoteText}>“{block.quote}”</p>
                        {block.author && <cite className={styles.quoteAuthor}>— {block.author}</cite>}
                      </blockquote>
                    );

                  default:
                    return null;
                }
              })}
            </article>

            {/* Feature Links to Product */}
            {post.featureLinks && post.featureLinks.length > 0 && (
              <section className={styles.featureLinksSection} aria-label="Related Product Capabilities">
                <h3 className={styles.featureLinksTitle}>Explore Related Tools &amp; Capabilities</h3>
                <div className={styles.featureLinksGrid}>
                  {post.featureLinks.map((link, idx) => (
                    <Link key={idx} href={link.href} className={styles.featureLinkCard}>
                      <h4 className={styles.featureLinkLabel}>{link.label} &rarr;</h4>
                      <p className={styles.featureLinkBlurb}>{link.blurb}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Bottom CTA Card */}
            <section className={styles.ctaBanner} style={{ marginTop: '48px' }}>
              <h2 className={styles.ctaTitle}>Build your contracting business on Let’s Get Quoted</h2>
              <p className={styles.ctaLead}>
                Get an SEO website with interactive estimate calculators, 24/7 AI call intake, and complete quotes-to-paid management from $0/month.
              </p>
              <a href="https://app.letsgetquoted.com/start?goal=build_site&source=blog_article_cta" className={styles.ctaButton}>
                Create Free Account &rarr;
              </a>
            </section>

            {/* Related Articles Section */}
            {relatedPosts.length > 0 && (
              <section className={styles.relatedSection} aria-label="Related Articles">
                <h3 className={styles.relatedTitle}>More Trade Guides to Read Next</h3>
                <div className={styles.articlesGrid}>
                  {relatedPosts.map((rel) => (
                    <Link key={rel.id} href={`/blog/${rel.slug}`} className={styles.articleCard}>
                      <span className={styles.cardCategory}>{rel.category}</span>
                      <h4 className={styles.cardTitle}>{rel.title}</h4>
                      <p className={styles.cardExcerpt}>{rel.excerpt}</p>
                      <div className={styles.cardFooter}>
                        <span>{rel.readMinutes} min read</span>
                        <span>{formatDate(rel.datePublished)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </main>

          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
