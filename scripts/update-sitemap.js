const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/site-pages.ts', 'utf8');
if (!file.includes('slugifyBlogTitle')) {
  file = file.replace(/import \{ isSiteSeoReady \} from '\.\/site-seo';/, "import { isSiteSeoReady } from './site-seo';\nimport { slugifyBlogTitle } from '../site-content';");
}
let target = '  const posts = getSiteContent(site.content).blog.posts.filter(';
let insertion = `
  const services = getSiteContent(site.content).services;
  if (services.enabled) {
    for (const service of services.items) {
      if (!service.title.trim()) continue;
      pages.push({
        path: '/services/' + encodeURIComponent(slugifyBlogTitle(service.title.trim())),
        lastModified: updated,
        changeFrequency: 'monthly',
        priority: 0.7,
      });
    }
  }
`;
if (!file.includes('/services/')) {
  file = file.replace(target, insertion + '\n' + target);
}
fs.writeFileSync('src/lib/seo/site-pages.ts', file, 'utf8');
console.log('Added services to sitemap.');
