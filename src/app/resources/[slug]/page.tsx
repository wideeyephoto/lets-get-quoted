import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, formatArticleDate, relatedArticles } from '@/lib/resources';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import flagshipStyles from '@/components/flagship/flagship.module.css';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
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
import resourceStyles from '../resources.module.css';

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} · Let’s Get Quoted`,
    description: article.excerpt,
    alternates: { canonical: `https://letsgetquoted.com/resources/${article.slug}` },
    openGraph: {
      type: 'article',
      title: `${article.title} · Let’s Get Quoted`,
      description: article.excerpt,
      url: `https://letsgetquoted.com/resources/${article.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title} · Let’s Get Quoted`,
      description: article.excerpt,
    },
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
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

  const nonce = await cspNonce();

  return (
    <div className={guideStyles.articlePage}>
      <ReadingProgressBar />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <div className={guideStyles.articleShell}>
        <div className={`${resourceStyles.ambient} ${resourceStyles.ambientOne}`} aria-hidden="true" />
        <div className={`${resourceStyles.ambient} ${resourceStyles.ambientTwo}`} aria-hidden="true" />

        <div className={flagshipStyles.root}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>

          <SiteHeader />
          <LaunchBanner offsetHeader />
          <ThemeFab />

          <main id="main-content" className={guideStyles.articleContainer}>
          <Link href="/resources" className={guideStyles.backLink}>
            <span aria-hidden="true">←</span> All guides &amp; resources
          </Link>

          <div>
            <span className={guideStyles.articleCategoryTag}>{article.category}</span>
            <h1 className={guideStyles.articleTitle}>{article.title}</h1>

            <div className={guideStyles.guideMetaRow}>
              <div className={guideStyles.guideMetaLeft}>
                <span>Published {formatArticleDate(article.datePublished)}</span>
                <span>·</span>
                <span>{article.readMinutes} min read</span>
                <span>·</span>
                <span>By Brett, Founder</span>
              </div>
              <CopyGuideLinkButton url={url} />
            </div>
          </div>

          {/* TL;DR Key Takeaways Callout */}
          <KeyTakeaways text={article.excerpt} />

          {/* Table of Contents for multi-section guides */}
          {headings.length > 2 ? <TableOfContents headings={headings} /> : null}

          {/* Embedded Interactive Tools */}
          {article.slug === 'markup-vs-margin-calculator-guide' ? <InteractiveMarginCalculator /> : null}
          {article.slug === 'contractor-10dlc-sms-compliance-guide' ? <InteractiveChecklist10DLC /> : null}
          {article.slug === 'speed-to-lead-contractor-playbook' ? <SpeedToLeadEstimator /> : null}

          {/* Article Body */}
          <div className={guideStyles.articleBody}>
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
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={index}>{block.text}</p>;
            })}
          </div>

          {/* Contextual links into the product */}
          {article.featureLinks?.length ? (
            <aside className={guideStyles.articleLinks} aria-labelledby="article-links-title">
              <h2 id="article-links-title">See it in the product</h2>
              <ul>
                {article.featureLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      {link.label} <span aria-hidden="true">→</span>
                    </Link>
                    <span>{link.blurb}</span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          {/* Related Guides */}
          {related.length ? (
            <section className={guideStyles.relatedSection} aria-labelledby="read-next-title">
              <div className={guideStyles.sectionHeading}>
                <div className={resourceStyles.eyebrowChip}>
                  <span aria-hidden="true">✦</span>
                  <p className={resourceStyles.eyebrowText}>Read next</p>
                </div>
                <h2 id="read-next-title">More playbooks for contractors</h2>
              </div>
              <div className={resourceStyles.grid}>
                {related.map((next) => (
                  <Link
                    key={next.slug}
                    href={`/resources/${next.slug}`}
                    className={resourceStyles.card}
                  >
                    <div>
                      <div className={resourceStyles.cardHeader}>
                        <span className={resourceStyles.cardCategory}>{next.category}</span>
                        <span className={resourceStyles.cardReadTime}>{next.readMinutes} min read</span>
                      </div>
                      <h3 className={resourceStyles.cardTitle}>{next.title}</h3>
                      <p className={resourceStyles.cardExcerpt}>{next.excerpt}</p>
                    </div>
                    <div className={resourceStyles.cardFooter}>
                      <span>{formatArticleDate(next.datePublished)}</span>
                      <span className={resourceStyles.cardLinkText}>
                        Read guide <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* Trade Solutions Grid */}
          <section className={guideStyles.relatedSection} aria-labelledby="trades-playbook-title">
            <div className={guideStyles.sectionHeading}>
              <div className={resourceStyles.eyebrowChip}>
                <span aria-hidden="true">✦</span>
                <p className={resourceStyles.eyebrowText}>Trade Workflows</p>
              </div>
              <h2 id="trades-playbook-title">Put this playbook to work in your trade</h2>
              <p style={{ color: 'var(--muted)', marginTop: '8px', fontSize: '15px' }}>
                Explore software, instant estimate calculators, and website templates pre-configured for your trade.
              </p>
            </div>
            <div className={guideStyles.relatedGrid}>
              <Link href="/for/roofers" className={guideStyles.tradeCard}>
                <h3>Roofers →</h3>
                <p>Storm damage intake, roof square calculators &amp; deposit payments.</p>
              </Link>
              <Link href="/for/plumbers" className={guideStyles.tradeCard}>
                <h3>Plumbers →</h3>
                <p>24/7 emergency dispatch, water heater scoping &amp; flat-rate pricing.</p>
              </Link>
              <Link href="/for/electricians" className={guideStyles.tradeCard}>
                <h3>Electricians →</h3>
                <p>Panel upgrade quotes, EV charger scoping &amp; instant e-signatures.</p>
              </Link>
              <Link href="/for/hvac" className={guideStyles.tradeCard}>
                <h3>HVAC Contractors →</h3>
                <p>System changeouts, seasonal tune-up booking &amp; Good/Better/Best tiers.</p>
              </Link>
              <Link href="/for/landscapers" className={guideStyles.tradeCard}>
                <h3>Landscapers →</h3>
                <p>Hardscaping quotes, sod install calculators &amp; recurring lawn billing.</p>
              </Link>
              <Link href="/for/remodelers" className={guideStyles.tradeCard}>
                <h3>Remodelers →</h3>
                <p>Kitchen &amp; bath proposals, milestone progress billing &amp; client portals.</p>
              </Link>
            </div>
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <Link href="/for" className={resourceStyles.btnSecondary}>
                Explore all 150 supported trades →
              </Link>
            </div>
          </section>

          {/* Closing CTA Band */}
          <section className={resourceStyles.ctaBand} aria-labelledby="article-cta-title">
            <div className={resourceStyles.ctaInner}>
              <div className={resourceStyles.eyebrowChip}>
                <span aria-hidden="true">✦</span>
                <p className={resourceStyles.eyebrowText}>Ready when you are</p>
              </div>
              <h2 id="article-cta-title">Start free — you only pay when a homeowner pays you.</h2>
              <p>
                No monthly subscription. No setup fee. Build your free site, capture AI estimates, and send itemized quotes.
              </p>
              <div className={resourceStyles.ctaActions}>
                <a href={APP_SIGNUP_URL} className={resourceStyles.btnPrimary}>
                  Build my free site <span aria-hidden="true">→</span>
                </a>
                <Link href="/resources" className={resourceStyles.btnSecondary}>
                  More contractor playbooks
                </Link>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
        </div>
      </div>
    </div>
  );
}
