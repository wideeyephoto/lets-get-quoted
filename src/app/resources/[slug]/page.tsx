import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, formatArticleDate, relatedArticles } from '@/lib/resources';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import {
  ReadingProgressBar,
  CopyGuideLinkButton,
  TableOfContents,
  KeyTakeaways,
  InteractiveMarginCalculator,
  InteractiveChecklist10DLC,
  SpeedToLeadEstimator,
} from '../guide-components';
import guideStyles from '../guide.module.css';

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = getArticle(params.slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `https://letsgetquoted.com/resources/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt,
      url: `https://letsgetquoted.com/resources/${article.slug}`,
    },
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const url = `https://letsgetquoted.com/resources/${article.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    image: [`${url}/opengraph-image`],
    articleSection: article.category,
    wordCount: article.body.reduce(
      (total, block) =>
        total + (block.type === 'ul' ? block.items.join(' ') : block.text).split(/\s+/).length,
      0,
    ),
    author: { '@type': 'Person', name: 'Brett', url: 'https://letsgetquoted.com/founder' },
    publisher: {
      '@type': 'Organization',
      name: "Let's Get Quoted",
      url: 'https://letsgetquoted.com',
      logo: { '@type': 'ImageObject', url: 'https://letsgetquoted.com/lets-get-quoted-logo.png' },
    },
    mainEntityOfPage: url,
  };

  const related = relatedArticles(article.slug);

  const breadcrumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'Resources', path: '/resources' },
    { name: article.title, path: `/resources/${article.slug}` },
  ]);

  // Extract all h2 headings for the Table of Contents
  const headings = article.body
    .filter((b): b is { type: 'h2'; text: string } => b.type === 'h2')
    .map((b) => ({
      id: slugify(b.text),
      text: b.text,
    }));

  return (
    <main className="marketing-shell" id="main-content">
      <ReadingProgressBar />
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <article className="section-block article">
        <p className="article-back"><Link href="/resources">&larr; All guides & resources</Link></p>
        <p className="eyebrow">{article.category}</p>
        <h1 className="article-title">{article.title}</h1>

        <div className={guideStyles.guideMetaRow}>
          <div className={guideStyles.guideMetaLeft}>
            <span>{formatArticleDate(article.datePublished)}</span>
            <span>·</span>
            <span>{article.readMinutes} min read</span>
          </div>
          <CopyGuideLinkButton url={url} />
        </div>

        {/* TL;DR Key Takeaways Callout */}
        <KeyTakeaways text={article.excerpt} />

        {/* Table of Contents for multi-section guides */}
        {headings.length > 2 ? <TableOfContents headings={headings} /> : null}

        {/* Embedded Interactive Tools */}
        {article.slug === 'markup-vs-margin-calculator-guide' ? <InteractiveMarginCalculator /> : null}
        {article.slug === 'contractor-10dlc-sms-compliance-guide' ? <InteractiveChecklist10DLC /> : null}
        {article.slug === 'speed-to-lead-contractor-playbook' ? <SpeedToLeadEstimator /> : null}

        <div className="article-body">
          {article.body.map((block, index) => {
            if (block.type === 'h2') {
              const headingId = slugify(block.text);
              return (
                <h2 key={index} id={headingId}>
                  {block.text}
                </h2>
              );
            }
            if (block.type === 'ul') {
              return (
                <ul key={index}>
                  {block.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              );
            }
            return <p key={index}>{block.text}</p>;
          })}
        </div>

        {/* Contextual links into the product */}
        {article.featureLinks?.length ? (
          <aside className="article-links" aria-labelledby="article-links-title">
            <h2 id="article-links-title">See it in the product</h2>
            <ul>
              {article.featureLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                  <span>{link.blurb}</span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </article>

      {related.length ? (
        <section className="section-block" aria-labelledby="read-next-title">
          <div className="section-heading">
            <p className="eyebrow">Read next</p>
            <h2 id="read-next-title">More guides for contractors</h2>
          </div>
          <div className="feature-grid">
            {related.map((next) => (
              <article key={next.slug} className="feature-card">
                <span className="fav-card-tag">{next.category}</span>
                <h3><Link href={`/resources/${next.slug}`}>{next.title}</Link></h3>
                <p>{next.excerpt}</p>
                <p className="article-meta">{next.readMinutes} min read</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free — you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. The whole toolkit, from your first quote.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
            <Link href="/resources" className="btn secondary">More resources</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
