import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import {
  getPermittedManualArticle,
  getAdjacentPermittedManualArticles,
} from '@/lib/admin-manual';
import AdminManualArticle from '../_components/AdminManualArticle';
import styles from '../manual.module.css';

export const dynamic = 'force-dynamic';

interface AdminManualArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: AdminManualArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { role, staff } = await requireAdmin();
  const active = staff?.active ?? true;
  const article = getPermittedManualArticle(slug, role, active);

  if (!article) {
    return {
      title: 'Guide Not Found · Admin manual',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${article.title} · Admin manual`,
    description: article.summary,
    robots: { index: false, follow: false },
  };
}

export default async function AdminManualArticlePage({
  params,
}: AdminManualArticlePageProps) {
  const { slug } = await params;
  const { role, staff } = await requireAdmin();
  const active = staff?.active ?? true;

  const article = getPermittedManualArticle(slug, role, active);

  if (!article) {
    notFound();
  }

  const { prev, next } = getAdjacentPermittedManualArticles(slug, role, active);

  return (
    <div className={styles.container}>
      <AdminManualArticle article={article} prevArticle={prev} nextArticle={next} />
    </div>
  );
}

