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

function getCategoryBadgeClass(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('pricing') || cat.includes('cash')) return styles.badgePricing;
  if (cat.includes('software') || cat.includes('tech')) return styles.badgeSoftware;
  if (cat.includes('marketing') || cat.includes('lead') || cat.includes('growth')) return styles.badgeMarketing;
  if (cat.includes('operation') || cat.includes('crew') || cat.includes('dispatch')) return styles.badgeOperations;
  if (cat.includes('review') || cat.includes('trust') || cat.includes('brand')) return styles.badgeTrust;
  return styles.badgeMarketing;
}

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
  const title = post.metaTitle || `${post.title} · Let’s Get Quoted Blog`;
  const description = post.metaDescription || post.excerpt;

  const keywords = Array.from(
    new Set(
      [
        post.targetKeyword,
        ...post.tags,
        post.category,
        'contractor business guide',
        'field service operations',
        'contractor software',
      ].filter((k): k is string => Boolean(k))
    )
  );

  return {
    title,
    description,
    keywords,
    authors: [{ name: post.author.name, url: `${origin}/founder` }],
    creator: post.author.name,
    publisher: "Let's Get Quoted",
    category: post.category,
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
      title,
      description,
      url,
      siteName: "Let's Get Quoted",
      locale: 'en_US',
      type: 'article',
      publishedTime: post.datePublished.includes('T') ? post.datePublished : `${post.datePublished}T08:00:00Z`,
      modifiedTime: (post.dateModified || post.datePublished).includes('T')
        ? post.dateModified || post.datePublished
        : `${post.dateModified || post.datePublished}T08:00:00Z`,
      authors: [post.author.name],
      section: post.category,
      tags: post.tags,
      images: post.coverImage
        ? [
            {
              url: `${origin}${post.coverImage}`,
              width: 1280,
              height: 720,
              alt: post.coverAlt || post.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: '@letsgetquoted',
      creator: '@letsgetquoted',
      images: post.coverImage ? [`${origin}${post.coverImage}`] : undefined,
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

  // Calculate approximate word count across text blocks for SEO schema
  const totalWords = post.blocks.reduce((acc, block) => {
    switch (block.type) {
      case 'p':
      case 'h2':
      case 'h3':
        return acc + (block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0);
      case 'ul':
        return acc + block.items.reduce((sum, item) => sum + item.trim().split(/\s+/).filter(Boolean).length, 0);
      case 'callout':
        return (
          acc +
          (block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0) +
          (block.title ? block.title.trim().split(/\s+/).filter(Boolean).length : 0)
        );
      case 'quote':
        return acc + (block.quote ? block.quote.trim().split(/\s+/).filter(Boolean).length : 0);
      default:
        return acc;
    }
  }, 0);

  const publishedIso = post.datePublished.includes('T')
    ? post.datePublished
    : `${post.datePublished}T08:00:00Z`;
  const modifiedIso = (post.dateModified || post.datePublished).includes('T')
    ? post.dateModified || post.datePublished
    : `${post.dateModified || post.datePublished}T08:00:00Z`;

  const categorySlug = encodeURIComponent(post.category.toLowerCase().replace(/\s+/g, '-'));

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
        '@id': `${articleUrl}#article`,
        isPartOf: {
          '@type': 'Blog',
          '@id': `${origin}/blog#blog`,
          name: "Let's Get Quoted Contractor Growth Hub",
          url: `${origin}/blog`,
        },
        headline: post.title,
        name: post.title,
        description: post.metaDescription || post.excerpt,
        articleSection: post.category,
        keywords: [post.targetKeyword, ...post.tags].filter(Boolean).join(', '),
        inLanguage: 'en-US',
        wordCount: totalWords > 0 ? totalWords : undefined,
        timeRequired: `PT${post.readMinutes}M`,
        isAccessibleForFree: true,
        url: articleUrl,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': articleUrl,
        },
        image: post.coverImage ? [`${origin}${post.coverImage}`] : undefined,
        datePublished: publishedIso,
        dateModified: modifiedIso,
        author: {
          '@type': 'Person',
          name: post.author.name,
          jobTitle: post.author.role,
          url: `${origin}/founder`,
        },
        publisher: {
          '@type': 'Organization',
          name: "Let's Get Quoted",
          url: origin,
          logo: {
            '@type': 'ImageObject',
            url: `${origin}/apple-icon.png`,
            width: 180,
            height: 180,
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${articleUrl}#breadcrumb`,
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
            name: post.category,
            item: `${origin}/blog#category-${categorySlug}`,
          },
          {
            '@type': 'ListItem',
            position: 4,
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
              <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
              <Link href="/blog" className={styles.breadcrumbLink}>
                Blog
              </Link>
              <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
              <Link
                href={`/blog?category=${encodeURIComponent(post.category)}`}
                className={styles.breadcrumbLink}
                style={{ color: 'var(--orange-light)' }}
              >
                {post.category}
              </Link>
            </nav>

            {/* Article Header */}
            <header className={styles.articleHeader}>
              <div className={styles.featuredTag}>
                <span className={`${styles.featuredTagBadge} ${getCategoryBadgeClass(post.category)}`}>
                  {post.category}
                </span>
                <span>·</span>
                <span>⏱ {post.readMinutes} min read</span>
                <span>·</span>
                <time dateTime={post.datePublished}>
                  {formatDate(post.datePublished)}
                </time>
                {post.dateModified && post.dateModified !== post.datePublished && (
                  <>
                    <span>·</span>
                    <span>
                      Updated <time dateTime={post.dateModified}>{formatDate(post.dateModified)}</time>
                    </span>
                  </>
                )}
              </div>
              <h1 className={styles.articleHeaderTitle}>{post.title}</h1>
              {post.subtitle && <p className={styles.articleHeaderSubtitle}>{post.subtitle}</p>}

              {/* Author and Share Bar */}
              <div className={styles.authorCard}>
                <div className={styles.authorInfo}>
                  <Link
                    href="/founder"
                    rel="author"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <img
                      src={post.author.avatarUrl || '/apple-icon.png'}
                      alt={post.author.name}
                      className={styles.authorAvatar}
                      width={46}
                      height={46}
                    />
                    <div>
                      <p className={styles.authorName}>{post.author.name}</p>
                      <p className={styles.authorRole}>{post.author.role}</p>
                    </div>
                  </Link>
                </div>

                <BlogArticleClient title={post.title} url={articleUrl} />
              </div>

              {post.coverImage && (
                <div className={styles.heroCoverWrapper}>
                  <img
                    src={post.coverImage}
                    alt={post.coverAlt || post.title}
                    className={styles.heroCoverImage}
                    width={1280}
                    height={720}
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>
              )}
            </header>

            {/* Table of Contents */}
            {tocItems.length > 1 && (
              <aside className={styles.tocBox} aria-label="Table of contents">
                <p className={styles.tocTitle}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  In this guide
                </p>
                <ol className={styles.tocList}>
                  {tocItems.map((item, idx) => (
                    <li key={item.id} className={styles.tocItem}>
                      <span className={styles.tocNum}>{String(idx + 1).padStart(2, '0')}</span>
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
                        <span>{block.text}</span>
                        <a href={`#${id}`} className={styles.headingAnchor} aria-label={`Section link for ${block.text}`}>
                          #
                        </a>
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
                        <div className={styles.calloutIcon} aria-hidden="true">
                          {block.kind === 'tip' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                          ) : block.kind === 'warning' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          )}
                        </div>
                        <div className={styles.calloutContent}>
                          {block.title && <h4 className={styles.calloutTitle}>{block.title}</h4>}
                          <p className={styles.calloutText}>{block.text}</p>
                        </div>
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

            {/* Author Bio Box */}
            <section className={styles.authorBioBox} aria-label="About the Author">
              <img
                src={post.author.avatarUrl || '/apple-icon.png'}
                alt={post.author.name}
                className={styles.authorBioAvatar}
                width={72}
                height={72}
              />
              <div>
                <p className={styles.authorBioTitle}>Written by</p>
                <h3 className={styles.authorBioName}>{post.author.name}</h3>
                <p className={styles.authorBioLead}>
                  Founder of Let’s Get Quoted. Former trade operator and software engineer obsessed with eliminating software bloat, per-seat taxes, and lead broker middleman fees for local contractors.
                </p>
                <Link href="/founder" className={styles.authorBioLink}>
                  Read Founder’s Story &rarr;
                </Link>
              </div>
            </section>

            {/* Article Tags Cloud */}
            {post.tags && post.tags.length > 0 && (
              <nav className={styles.tagCloud} aria-label="Article Topics">
                <span className={styles.tagLabel}>Topics:</span>
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog?q=${encodeURIComponent(tag)}`}
                    className={styles.tagPill}
                  >
                    #{tag}
                  </Link>
                ))}
              </nav>
            )}

            {/* Feature Links to Product */}
            {post.featureLinks && post.featureLinks.length > 0 && (
              <section className={styles.featureLinksSection} aria-label="Related Product Capabilities">
                <h3 className={styles.featureLinksTitle}>Explore Related Tools &amp; Capabilities</h3>
                <div className={styles.featureLinksGrid}>
                  {post.featureLinks.map((link, idx) => (
                    <Link key={idx} href={link.href} className={styles.featureLinkCard}>
                      <h4 className={styles.featureLinkLabel}>
                        <span>{link.label}</span>
                        <span>&rarr;</span>
                      </h4>
                      <p className={styles.featureLinkBlurb}>{link.blurb}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Bottom CTA Card */}
            <section className={styles.ctaBanner}>
              <h2 className={styles.ctaTitle}>Build your contracting business on Let’s Get Quoted</h2>
              <p className={styles.ctaLead}>
                Get an SEO website with interactive estimate calculators, 24/7 AI call intake, and complete quotes-to-paid management from $0/month.
              </p>
              <div className={styles.ctaPillsRow}>
                <span className={styles.ctaPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Free High-Converting Website
                </span>
                <span className={styles.ctaPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  24/7 AI Call &amp; SMS Intake
                </span>
                <span className={styles.ctaPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Instant Price Calculators
                </span>
                <span className={styles.ctaPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  $0/mo Free Tier · Unlimited Crew
                </span>
              </div>
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
                      {rel.coverImage && (
                        <div className={styles.cardImageWrapper}>
                          <img
                            src={rel.coverImage}
                            alt={rel.coverAlt || rel.title}
                            className={styles.cardImage}
                            loading="lazy"
                          />
                          <span className={`${styles.cardFloatingBadge} ${getCategoryBadgeClass(rel.category)}`}>
                            {rel.category}
                          </span>
                          <span className={styles.cardReadChip}>
                            ⏱ {rel.readMinutes}m
                          </span>
                        </div>
                      )}
                      <h4 className={styles.cardTitle}>{rel.title}</h4>
                      <p className={styles.cardExcerpt}>{rel.excerpt}</p>
                      <div className={styles.cardFooter}>
                        <div className={styles.cardFooterAuthor}>
                          <img
                            src={rel.author.avatarUrl || '/apple-icon.png'}
                            alt={rel.author.name}
                            className={styles.cardFooterAvatar}
                            width={20}
                            height={20}
                          />
                          <span>{formatDate(rel.datePublished)}</span>
                        </div>
                        <span className={styles.cardReadLink}>
                          Read Guide
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
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
