const fs = require('fs');
let code = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf-8');

code = code.replace(
  `export function siteVideoIndexMetadata(site: Site): Metadata {

  if (!site)   const base = site ? siteOrigin(site) || 'https://letsgetquoted.com' : 'https://letsgetquoted.com';
  return {
    alternates: { canonical: \`\${base}/videos\` }, title: 'Not found' };`,
  `export function siteVideoIndexMetadata(site: Site): Metadata {
  if (!site) return { title: 'Not found' };
  const base = siteOrigin(site) || 'https://letsgetquoted.com';`
);

fs.writeFileSync('src/lib/seo/video-index-page.tsx', code);
