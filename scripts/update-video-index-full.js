const fs = require('fs');

let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');

file = file.replace(/export function siteVideoIndexMetadata\(site: Site\): Metadata \{[\s\S]*?\}\n/, `export function siteVideoIndexMetadata(site: Site): Metadata {
  const base = siteOrigin(site) || 'https://letsgetquoted.com';
  const entries = getAllPublishedVideos(site.content);
  if (entries.length === 0) return { title: 'Not found' };
  const title = \`Videos | \${site.company_name}\`;
  return {
    title: { absolute: title },
    description: \`Watch \${site.company_name} at work — \${entries.length} clip\${entries.length === 1 ? '' : 's'} from real jobs.\`,
    alternates: { canonical: \`\${base}/videos\` },
    icons: siteIconsMetadata(site),
  };
}
`);

if (!file.includes('breadcrumbJsonLd')) {
  file = file.replace(/import \{ cspNonce \} from '@\/lib\/csp-nonce';/, "import { cspNonce } from '@/lib/csp-nonce';\nimport { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';");
  file = file.replace(/const title = \`\$\{site\.company_name \|\| 'Our'\} videos\`;/, `const title = \`\${site.company_name || 'Our'} videos\`;
  const base = siteOrigin(site) || 'https://letsgetquoted.com';
  const crumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'Videos', path: '/videos' },
  ], base);`);
  file = file.replace(/<SiteVideoIndex/, `<script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />\n      <SiteVideoIndex`);
}

fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
console.log('Fixed video metadata completely');
