const fs = require('fs');
let file = fs.readFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', 'utf8');
file = file.replace(/const site = await loadPublicSite\(params\.kind, params\.tenant\);\n  return siteVideoIndexMetadata\(site\);/, "const site = await loadPublicSite(params.kind, params.tenant);\n  if (!site) return { title: 'Not found' };\n  return siteVideoIndexMetadata(site);");
fs.writeFileSync('src/app/site/[kind]/[tenant]/videos/page.tsx', file, 'utf8');
console.log('Fixed videos metadata check');
