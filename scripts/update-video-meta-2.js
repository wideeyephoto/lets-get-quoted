const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');
file = file.replace(/export function siteVideoIndexMetadata\(site: Site \| null\): Metadata \{/m, "export function siteVideoIndexMetadata(site: Site | null): Metadata {\n  if (!site) return { title: 'Not found' };");
fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
console.log('Fixed video metadata null check');
