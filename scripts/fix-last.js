const fs = require('fs');

let portal = fs.readFileSync('src/app/site/[kind]/[tenant]/portal/page.tsx', 'utf8');
portal = portal.replace(/getPublicSiteBySubdomain\(\s*createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');
portal = portal.replace(/getPublicSiteBySubdomain\(\s*await createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');
fs.writeFileSync('src/app/site/[kind]/[tenant]/portal/page.tsx', portal, 'utf8');

let videos = fs.readFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', 'utf8');
videos = videos.replace(/getPublicSiteBySubdomain\(\s*createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');
videos = videos.replace(/getPublicSiteBySubdomain\(\s*await createAdminClient\(\),\s*params\.tenant\s*\)/g, 'loadPublicSite(params.kind, params.tenant)');
videos = videos.replace(/params\.subdomain/g, 'params.tenant');
fs.writeFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', videos, 'utf8');

// For the HeroQuickForm, I just casted it wrongly
let heroForm = fs.readFileSync('src/lib/templates/HeroQuickForm.tsx', 'utf8');
heroForm = heroForm.replace(/if \(\(result as any\)\?\.continuationToken/g, 'if ((result as any)?.continuationToken');
fs.writeFileSync('src/lib/templates/HeroQuickForm.tsx', heroForm, 'utf8');
