import fs from 'fs';
import path from 'path';
import { MANUAL_ARTICLES, MANUAL_LAST_VERIFIED } from '../src/lib/help/user-manual';

const CSV_HEADER = 'slug,title,last updated,pageviews,screenshots y/n,verdict\n';

const csvRows = MANUAL_ARTICLES.map(article => {
  // slug, title, last_updated, pageviews, screenshots, verdict
  const isHomeowner = article.audiences?.includes('Customer' as any) || article.summary.includes('homeowner');
  const verdict = isHomeowner ? 'rewrite-for-contractors' : 'keep';
  return `"${article.slug}","${article.title.replace(/"/g, '""')}","${MANUAL_LAST_VERIFIED}","0","N","${verdict}"`;
});

const csvContent = CSV_HEADER + csvRows.join('\n');
fs.writeFileSync(path.join(process.cwd(), 'help-center-audit.csv'), csvContent);
console.log('Phase 1: help-center-audit.csv created with ' + MANUAL_ARTICLES.length + ' articles.');
