const fs = require('fs');
let file = fs.readFileSync('src/lib/templates/SiteStructuredData.tsx', 'utf8');

if (!file.includes('buildFaqJsonLd')) {
  file = file.replace(/import \{ buildLocalBusinessJsonLd, siteCanonicalUrl \} from '@\/lib\/seo\/site-seo';/, "import { buildLocalBusinessJsonLd, buildFaqJsonLd, siteCanonicalUrl } from '@/lib/seo/site-seo';");
  file = file.replace(/import \{ getPublishedVideoSections \} from '@\/lib\/site-content';/, "import { getPublishedVideoSections, getPublishedFaqs } from '@/lib/site-content';");
  
  const target1 = '  const data = buildLocalBusinessJsonLd(site);';
  const insertion1 = `
  const faqsData = getPublishedFaqs(site.content);
  const faqs = faqsData ? buildFaqJsonLd(faqsData.items) : null;
`;
  file = file.replace(target1, target1 + '\n' + insertion1);

  file = file.replace(/if \(!data && !videos\)/, 'if (!data && !videos && !faqs)');
  
  const target2 = '{videos && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdSafe(videos) }} />}';
  const insertion2 = '      {faqs && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdSafe(faqs) }} />}';
  file = file.replace(target2, target2 + '\n' + insertion2);

  fs.writeFileSync('src/lib/templates/SiteStructuredData.tsx', file, 'utf8');
  console.log('Added FAQs to SiteStructuredData');
}
