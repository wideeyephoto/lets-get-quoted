const fs = require('fs');

let filePaths = [
  'src/app/site/[kind]/[tenant]/apple-icon.tsx',
  'src/app/site/[kind]/[tenant]/blog/[slug]/page.tsx',
  'src/app/site/[kind]/[tenant]/blog/page.tsx',
  'src/app/site/[kind]/[tenant]/page.tsx',
  'src/app/site/[kind]/[tenant]/portal/page.tsx',
  'src/app/site/[kind]/[tenant]/privacy/page.tsx',
  'src/app/site/[kind]/[tenant]/robots.txt/route.ts',
  'src/app/site/[kind]/[tenant]/sitemap.xml/route.ts',
  'src/app/site/[kind]/[tenant]/terms/page.tsx',
  'src/app/site/[kind]/[tenant]/videos/page.tsx'
];

filePaths.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace params.subdomain with params.tenant everywhere
  content = content.replace(/params\.subdomain/g, 'params.tenant');

  // Replace type definitions
  content = content.replace(/\{\s*subdomain:\s*string\s*\}/g, '{ kind: string; tenant: string }');
  content = content.replace(/\{\s*subdomain:\s*string;\s*slug:\s*string\s*\}/g, '{ kind: string; tenant: string; slug: string }');
  content = content.replace(/\{\s*subdomain:\s*string,\s*slug:\s*string\s*\}/g, '{ kind: string; tenant: string; slug: string }');
  
  // Fix missed createAdminClient
  content = content.replace(/getPublicSiteBySubdomain\(\s*await\s*createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');
  content = content.replace(/getPublicSiteBySubdomain\(\s*createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');

  fs.writeFileSync(file, content, 'utf8');
});

console.log('Fixed files');
