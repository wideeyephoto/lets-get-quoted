import fs from 'fs';
import path from 'path';
import { MANUAL_ARTICLES } from '../src/lib/help/user-manual';

const categories = [
  'Getting set up',
  'Getting paid',
  'Intake and quoting',
  'Your website',
  'Billing and account'
];

const categoryMap: Record<string, string> = {
  start: 'Getting set up',
  sales: 'Intake and quoting',
  operations: 'Getting set up',
  customers: 'Getting set up',
  crew: 'Getting set up',
  money: 'Getting paid',
  growth: 'Intake and quoting',
  intake: 'Your website',
  account: 'Billing and account'
};

const articleToCategory = MANUAL_ARTICLES.map(article => ({
  slug: article.slug,
  oldUrl: `/help/articles/${article.slug}`,
  newCategory: categoryMap[article.chapterId] || 'Getting set up',
  newUrl: `/help/${article.slug}`
}));

fs.writeFileSync(path.join(process.cwd(), 'help-center-redirects.json'), JSON.stringify(articleToCategory, null, 2));
console.log('Phase 2: help-center-redirects.json created with ' + articleToCategory.length + ' redirects mapped to 5 categories.');
