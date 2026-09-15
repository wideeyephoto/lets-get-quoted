const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/site-pages.ts', 'utf8');
if (!file.includes('siteCities')) {
  file = file.replace(/import \{ isSiteSeoReady \} from '\.\/site-seo';/, "import { isSiteSeoReady, siteCities } from './site-seo';");
}
let target = '  return pages;';
let insertion = `
  const cities = siteCities(site).slice(0, 30);
  for (const city of cities) {
    if (!city.trim()) continue;
    pages.push({
      path: '/service-areas/' + encodeURIComponent(slugifyBlogTitle(city.trim())),
      lastModified: updated,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }
`;
if (!file.includes('/service-areas/')) {
  file = file.replace(target, insertion + '\n' + target);
}
fs.writeFileSync('src/lib/seo/site-pages.ts', file, 'utf8');
console.log('Added service areas to sitemap.');
