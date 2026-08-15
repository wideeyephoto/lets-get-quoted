import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, formatArticleDate, relatedArticles } from '@/lib/resources';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = getArticle(params.slug);
  if (!article) return {};
  return {
    // The root layout's title template appends the brand; carrying it here too
    // printed it twice.
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
    /* dateModified, image, a publisher logo and a named author were all absent.
       The first two are what Google asks for on an Article and what it uses to
       decide whether the piece is current; without dateModified a crawler has
       no signal that an edited article changed at all.

       dateModified falls back to datePublished rather than to today's date —
       `new Date()` here would restamp all four articles as freshly updated on
       every request, which is the one thing this field must never say. When an
       article is genuinely revised, give it a dateModified in lib/resources. */
    dateModified: article.dateModified ?? article.datePublished,
    // The generated social card for this exact article — see the sibling
    // opengraph-image.tsx. Next serves it from this route.
    image: [`${url}/opengraph-image`],
    articleSection: article.category,
    wordCount: article.body.reduce(
      (total, block) =>
        total + (block.type === 'ul' ? block.items.join(' ') : block.text).split(/\s+/).length,
      0,
    ),
    /* A person, not the Organization. These are written by the founder, the
       /founder page is a real author page on this domain, and "Brett" is the
       name that page publishes — so this is the strongest author identity the
       site can honestly assert. Claiming a fuller byline than the site itself
       shows would be inventing one. */
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

  return (
    <main className="marketing-shell" id="main-content">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <article className="section-block article">
        <p className="article-back"><Link href="/resources">&larr; All resources</Link></p>
        <p className="eyebrow">{article.category}</p>
        <h1 className="article-title">{article.title}</h1>
        <p className="article-meta">{formatArticleDate(article.datePublished)} · {article.readMinutes} min read</p>

        <div className="article-body">
          {article.body.map((block, index) => {
            if (block.type === 'h2') return <h2 key={index}>{block.text}</h2>;
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

        {/* SEE IT IN THE PRODUCT, and READ NEXT. Both of these are here because
            the four articles ended on a full stop and nothing else: no path
            into the feature that implements the advice, and no path to the
            other three guides. An article that ranks and then dead-ends spends
            its traffic on one page view. */}
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
