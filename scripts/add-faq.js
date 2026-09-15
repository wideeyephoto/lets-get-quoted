const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/site-seo.ts', 'utf8');
if (!file.includes('buildFaqJsonLd')) {
  file += `
export function buildFaqJsonLd(items: import('../site-content').SiteFaqItem[]) {
  if (!items || items.length === 0) return null;
  const mainEntity = items
    .filter((item) => item.question && item.question.trim() && item.answer && item.answer.trim())
    .map((item) => ({
      '@type': 'Question',
      name: item.question.trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer.trim(),
      },
    }));
  
  if (mainEntity.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
}
`;
  fs.writeFileSync('src/lib/seo/site-seo.ts', file, 'utf8');
  console.log('Added buildFaqJsonLd');
}
