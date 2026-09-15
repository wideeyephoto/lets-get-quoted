const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/site-pages.ts', 'utf8');

// Update imports
file = file.replace(/import \{ getAllPublishedVideos, getSiteContent \} from '@\/lib\/site-content';/, "import { getAllPublishedVideos, getSiteContent, getPublishedShowcase, getPublishedBeforeAfter } from '@/lib/site-content';");

// Update SitePageEntry
file = file.replace(/priority: number;\n\};/, "priority: number;\n  images?: { url: string; title?: string }[];\n};");

// Update siteIndexablePages
const siteIndexablePagesTarget = `  const updated = site.updated_at || '';
  const pages: SitePageEntry[] = [
    { path: '', lastModified: updated, changeFrequency: 'weekly', priority: 0.8 },
  ];`;
  
const siteIndexablePagesInsertion = `  const updated = site.updated_at || '';
  
  const images: { url: string; title?: string }[] = [];
  const showcase = getPublishedShowcase(site.content);
  if (showcase) {
    for (const item of showcase.items) {
      if (item.url) images.push({ url: item.url, title: item.alt || undefined });
    }
  }
  const beforeAfter = getPublishedBeforeAfter(site.content);
  if (beforeAfter) {
    for (const item of beforeAfter.items) {
      if (item.beforeUrl) images.push({ url: item.beforeUrl });
      if (item.afterUrl) images.push({ url: item.afterUrl });
    }
  }

  const pages: SitePageEntry[] = [
    { path: '', lastModified: updated, changeFrequency: 'weekly', priority: 0.8, images: images.length > 0 ? images : undefined },
  ];`;

file = file.replace(siteIndexablePagesTarget, siteIndexablePagesInsertion);

// Update buildSitemapXml
const buildSitemapXmlTarget = `  const entries = pages.map((page) => {
    const modified = lastmod(page.lastModified);
    return [
      '  <url>',
      \`    <loc>\${escapeXml(\`\${origin}\${page.path}\`)}</loc>\`,
      ...(modified ? [\`    <lastmod>\${modified}</lastmod>\`] : []),
      \`    <changefreq>\${page.changeFrequency}</changefreq>\`,
      \`    <priority>\${page.priority.toFixed(1)}</priority>\`,
      '  </url>',
    ].join('\\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\\n');`;

const buildSitemapXmlInsertion = `  const entries = pages.map((page) => {
    const modified = lastmod(page.lastModified);
    const imageTags = (page.images || []).map((img) => {
      const parts = [\`      <image:loc>\${escapeXml(img.url)}</image:loc>\`];
      if (img.title) parts.push(\`      <image:title>\${escapeXml(img.title)}</image:title>\`);
      return \`    <image:image>\\n\${parts.join('\\n')}\\n    </image:image>\`;
    });
    
    return [
      '  <url>',
      \`    <loc>\${escapeXml(\`\${origin}\${page.path}\`)}</loc>\`,
      ...(modified ? [\`    <lastmod>\${modified}</lastmod>\`] : []),
      \`    <changefreq>\${page.changeFrequency}</changefreq>\`,
      \`    <priority>\${page.priority.toFixed(1)}</priority>\`,
      ...imageTags,
      '  </url>',
    ].join('\\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries,
    '</urlset>',
    '',
  ].join('\\n');`;

file = file.replace(buildSitemapXmlTarget, buildSitemapXmlInsertion);

fs.writeFileSync('src/lib/seo/site-pages.ts', file, 'utf8');
console.log('Fixed site-pages images');
