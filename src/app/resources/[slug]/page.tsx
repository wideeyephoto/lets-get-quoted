import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, formatArticleDate } from '@/lib/resources';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';

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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.datePublished,
    articleSection: article.category,
    author: { '@type': 'Organization', name: "Let's Get Quoted" },
    publisher: { '@type': 'Organization', name: "Let's Get Quoted", url: 'https://letsgetquoted.com' },
    mainEntityOfPage: `https://letsgetquoted.com/resources/${article.slug}`,
  };

  return (
    <main className="marketing-shell">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
      </article>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free — you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. The whole toolkit, from your first quote.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">Create free account</Link>
            <Link href="/resources" className="btn secondary">More resources</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
