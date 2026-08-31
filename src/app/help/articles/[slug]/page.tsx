import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllArticles, findArticleBySlugOrId } from '@/components/help-center/help-center-data';
import SiteFooter from '@/components/site-footer';
import styles from './article.module.css';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export function generateStaticParams() {
  const articles = getAllArticles();
  return articles.map(article => ({
    slug: article.slug
  }));
}

export async function generateMetadata({ params: paramsPromise }: ArticlePageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const article = findArticleBySlugOrId(params.slug);
  if (!article) {
    return {
      title: 'Article Not Found · Help Center'
    };
  }

  const plainSummary = article.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  const canonicalUrl = `https://letsgetquoted.com/help/articles/${article.slug}`;

  return {
    title: `${article.title} · Help Center`,
    description: plainSummary,
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      title: `${article.title} · Let’s Get Quoted Help Center`,
      description: plainSummary,
      url: canonicalUrl,
      siteName: 'Let’s Get Quoted',
      type: 'article',
      publishedTime: '2026-08-01T00:00:00.000Z',
      modifiedTime: '2026-08-25T00:00:00.000Z',
      authors: [article.author || 'Let’s Get Quoted Technical Support'],
      images: [
        {
          url: '/template-previews/professional.jpg',
          width: 1900,
          height: 881,
          alt: article.title
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title} · Help Center`,
      description: plainSummary,
      images: ['/template-previews/professional.jpg']
    }
  };
}

export default async function HelpArticlePage({ params: paramsPromise }: ArticlePageProps) {
  const params = await paramsPromise;
  const article = findArticleBySlugOrId(params.slug);
  if (!article) {
    notFound();
  }

  const allArticles = getAllArticles();
  const relatedArticles = allArticles
    .filter(a => a.id !== article.id && (a.category === article.category || a.id.startsWith('art-')))
    .slice(0, 3);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: article.title,
    description: article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
    url: `https://letsgetquoted.com/help/articles/${article.slug}`,
    inLanguage: 'en-US',
    datePublished: '2026-08-01T00:00:00.000Z',
    dateModified: '2026-08-25T00:00:00.000Z',
    author: {
      '@type': 'Organization',
      name: article.author || 'Let’s Get Quoted Technical Support',
      url: 'https://letsgetquoted.com'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Let’s Get Quoted',
      url: 'https://letsgetquoted.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://letsgetquoted.com/icon.png'
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://letsgetquoted.com/help/articles/${article.slug}`
    }
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://letsgetquoted.com'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Help Center',
        item: 'https://letsgetquoted.com/help'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.category,
        item: `https://letsgetquoted.com/help#knowledge-hub`
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: article.title,
        item: `https://letsgetquoted.com/help/articles/${article.slug}`
      }
    ]
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className={styles.articlePageContainer}>
        {/* Breadcrumbs */}
        <nav className={styles.breadcrumbNav} aria-label="Breadcrumbs">
          <Link href="/" className={styles.breadcrumbLink}>
            Home
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
          <Link href="/help" className={styles.breadcrumbLink}>
            Help Center
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
          <Link href="/help#knowledge-hub" className={styles.breadcrumbLink}>
            {article.category}
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            {article.title}
          </span>
        </nav>

        {/* Article Header */}
        <header className={styles.articleHeader}>
          <div className={styles.categoryBadgeRow}>
            <span className={styles.categoryBadge}>{article.category}</span>
            <span className={styles.metaItem}>⏱ {article.readTime}</span>
            <span className={styles.metaItem}>• Audience: {article.audience || 'Contractors'}</span>
            {article.lastReviewed && (
              <span className={styles.metaItem}>• Verified: {article.lastReviewed}</span>
            )}
          </div>
          <h1 className={styles.articleTitle}>{article.title}</h1>
        </header>

        {/* Main Article Content */}
        <article
          className={styles.articleBody}
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        {/* Content Governance & Verified Sources Box */}
        <section className={styles.governanceCard} aria-labelledby="governance-heading">
          <div className={styles.governanceHeader} id="governance-heading">
            <span>🛡️</span>
            <span>Content Governance &amp; Verification</span>
          </div>
          <div className={styles.governanceGrid}>
            <div className={styles.govItem}>
              <span className={styles.govLabel}>Last Reviewed</span>
              <span className={styles.govValue}>{article.lastReviewed || 'August 2026'}</span>
            </div>
            <div className={styles.govItem}>
              <span className={styles.govLabel}>Applicable Region</span>
              <span className={styles.govValue}>{article.applicableRegion || 'US & Canada'}</span>
            </div>
            <div className={styles.govItem}>
              <span className={styles.govLabel}>Content Owner</span>
              <span className={styles.govValue}>{article.author || 'LGQ Technical Operations'}</span>
            </div>
          </div>

          {article.sources && article.sources.length > 0 && (
            <div>
              <div className={styles.sourcesListTitle}>Authoritative Reference Sources</div>
              <ul className={styles.sourcesList}>
                {article.sources.map((src, idx) => (
                  <li key={idx}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sourceLink}
                    >
                      <span>↗</span>
                      <span>{src.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Support Escalation Footer */}
        <section className={styles.actionFooterSection}>
          <div className={styles.feedbackBox}>
            <div className={styles.feedbackTitle}>Was this guide helpful?</div>
            <div className={styles.feedbackButtons}>
              <Link href="/help" className={styles.feedbackBtn}>
                <span>👍</span>
                <span>Yes, solved it</span>
              </Link>
              <Link href="/contact" className={styles.feedbackBtn}>
                <span>👎</span>
                <span>Need more help</span>
              </Link>
            </div>
          </div>

          <div className={styles.supportEscalationBox}>
            <div>
              <div className={styles.supportEscalationTitle}>Still have questions?</div>
              <div className={styles.supportEscalationDesc}>
                Our team can inspect your account logs, 10DLC registration, or DNS records directly.
              </div>
            </div>
            <Link href="/contact" className={styles.supportBtn}>
              <span>Contact Support Desk</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        {/* Related Articles */}
        {relatedArticles.length > 0 && (
          <section className={styles.relatedSection}>
            <h2 className={styles.relatedSectionTitle}>Related Diagnostic Guides</h2>
            <div className={styles.relatedGrid}>
              {relatedArticles.map(rel => (
                <Link
                  key={rel.id}
                  href={`/help/articles/${rel.slug}`}
                  className={styles.relatedCard}
                >
                  <div className={styles.relatedCardTitle}>{rel.title}</div>
                  <div className={styles.relatedCardMeta}>
                    <span>{rel.category}</span>
                    <span>•</span>
                    <span>{rel.readTime}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}
