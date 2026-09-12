const fs = require('fs');

let portal = fs.readFileSync('src/app/site/[kind]/[tenant]/portal/page.tsx', 'utf8');
portal = portal.replace(/const admin = \/\* removed \*\/[^;]+;/g, '');
portal = portal.replace(/const site = await loadPublicSite\(admin, params\.tenant\);/g, 'const site = await loadPublicSite(params.kind, params.tenant);');
fs.writeFileSync('src/app/site/[kind]/[tenant]/portal/page.tsx', portal, 'utf8');

let videos = fs.readFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', 'utf8');
videos = videos.replace(/const admin = await \/\* removed \*\/[^;]+;/g, '');
videos = videos.replace(/const site = await loadPublicSite\(admin, params\.tenant\);/g, 'const site = await loadPublicSite(params.kind, params.tenant);');
fs.writeFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', videos, 'utf8');

console.log('Fixed variable references');
