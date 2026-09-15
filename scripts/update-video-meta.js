const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');
if (!file.includes('siteOrigin')) {
  file = file.replace(/import \{ siteIconsMetadata \} from '@\/lib\/brand-mark';/, "import { siteIconsMetadata } from '@/lib/brand-mark';\nimport { siteOrigin } from '@/lib/seo/site-pages';");
  file = file.replace(/export function siteVideoIndexMetadata\(site: Site \| null\): Metadata \{([\s\S]*?)return \{/m, "export function siteVideoIndexMetadata(site: Site | null): Metadata {\n$1  const base = site ? siteOrigin(site) || 'https://letsgetquoted.com' : 'https://letsgetquoted.com';\n  return {\n    alternates: { canonical: `${base}/videos` },");
  fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
  console.log('Fixed video metadata');
}
