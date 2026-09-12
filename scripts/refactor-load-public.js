const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/app/site/\\[kind\\]/\\[tenant\\]/**/*.{tsx,ts}');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/import \{ getCachedPublicSiteBySubdomain \} from '.*?cached-sites';/, 
    "import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';");
    
  content = content.replace(/const loadPublicSite = cache\(async \(tenant: string\) => \{\s*return getCachedPublicSiteBySubdomain\(tenant\);\s*\}\);/,
    "const loadPublicSite = cache(async (kind: string, tenant: string) => { if (kind === 'd') return getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)); return getCachedPublicSiteBySubdomain(tenant); });");

  content = content.replace(/loadPublicSite\(params\.tenant\)/g, 'loadPublicSite(params.kind, params.tenant)');
  
  fs.writeFileSync(file, content, 'utf8');
});
