const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');

if (!file.includes('breadcrumbJsonLd')) {
  file = file.replace(/import \{ cspNonce \} from '@\/lib\/csp-nonce';/, "import { cspNonce } from '@/lib/csp-nonce';\nimport { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';");
  
  const target = "const base = siteOrigin(site) || 'https://letsgetquoted.com';";
  const insertion = `
  const crumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'Videos', path: '/videos' },
  ], base);
`;
  file = file.replace(target, target + '\n  ' + insertion);
  
  file = file.replace(/<main[^>]*>/, `$&
      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />`);
  
  fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
  console.log('Added Breadcrumbs to video-index-page');
}
