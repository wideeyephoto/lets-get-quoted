const fs = require('fs');

let page = fs.readFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', 'utf8');
if (!page.includes('notFound()')) {
  page = page.replace(/import \{ renderSiteVideoIndex, siteVideoIndexMetadata \} from '@\/lib\/seo\/video-index-page';/, "import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';\nimport { notFound } from 'next/navigation';");
  page = page.replace(/const site = await loadPublicSite\(params\.kind, params\.tenant\);\n  return await renderSiteVideoIndex\(site\);/, "const site = await loadPublicSite(params.kind, params.tenant);\n  if (!site) notFound();\n  return await renderSiteVideoIndex(site);");
  fs.writeFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', page, 'utf8');
}

let seo = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');
seo = seo.replace(/export function siteVideoIndexMetadata\(site: Site \| null\): Metadata \{/, "export function siteVideoIndexMetadata(site: Site): Metadata {");
seo = seo.replace(/export async function renderSiteVideoIndex\(site: Site \| null\) \{/, "export async function renderSiteVideoIndex(site: Site) {");
// Also remove `if (!site) return { title: 'Not found' };` since it's now checked
seo = seo.replace(/  if \(\!site\) return \{ title: 'Not found' \};\n/, "");

fs.writeFileSync('src/lib/seo/video-index-page.tsx', seo, 'utf8');
console.log('Fixed videos');
