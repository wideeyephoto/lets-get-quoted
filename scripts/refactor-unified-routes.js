const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src/app/site/[kind]/[tenant]');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Change type PublicSitePageProps = { params: Promise<{ subdomain: string }> }
  // to { params: Promise<{ kind: string, tenant: string }> }
  content = content.replace(/params:\s*Promise<\{\s*subdomain:\s*string\s*\}>/g, 
    'params: Promise<{ kind: string; tenant: string }>');

  // Change params.subdomain to params.tenant
  content = content.replace(/params\.subdomain/g, 'params.tenant');

  // Fix getCachedPublicSiteBySubdomain imports
  content = content.replace(/import\s*\{\s*getCachedPublicSiteBySubdomain\s*\}\s*from\s*'@\/lib\/cached-sites';/g,
    "import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';");

  // Fix loadPublicSite definition
  content = content.replace(/const\s*loadPublicSite\s*=\s*cache\(async\s*\(subdomain:\s*string\)\s*=>\s*\{\s*return\s*getCachedPublicSiteBySubdomain\(subdomain\);\s*\}\);/g,
    "const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });");

  // Fix getPublicSiteBySubdomain direct calls for PERF-01!
  content = content.replace(/getPublicSiteBySubdomain\(\s*createAdminClient\(\),\s*params\.tenant\s*\)/g,
    'loadPublicSite(params.kind, params.tenant)');
    
  content = content.replace(/import\s*\{\s*getPublicSiteBySubdomain\s*\}\s*from\s*'@\/lib\/sites';\n?/g, '');
  content = content.replace(/import\s*\{\s*createAdminClient\s*\}\s*from\s*'@\/lib\/auth';\n?/g, '');

  // Add loadPublicSite if it was missing but they called getPublicSiteBySubdomain directly
  if (content.includes('loadPublicSite(params.kind, params.tenant)') && !content.includes('const loadPublicSite = cache(')) {
    let importLines = "import { cache } from 'react';\nimport { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';\n\nconst loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });\n\n";
    content = importLines + content;
  }

  // Update loadPublicSite calls
  content = content.replace(/loadPublicSite\(\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');

  // Remove force-dynamic for PERF-02
  content = content.replace(/export\s*const\s*dynamic\s*=\s*'force-dynamic';\s*\n?/g, '');

  fs.writeFileSync(file, content, 'utf8');
});

console.log('Refactor complete.');
