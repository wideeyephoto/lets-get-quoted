const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');

file = file.replace(/export async function renderSiteVideoIndex\(site: Site \| null\) \{/, "export async function renderSiteVideoIndex(site: Site) {");

fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
console.log('Fixed renderSiteVideoIndex signature');
