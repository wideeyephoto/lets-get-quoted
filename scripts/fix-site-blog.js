const fs = require('fs');
let file = fs.readFileSync('src/lib/templates/SiteBlogIndex.tsx', 'utf8');
const search = '<script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />';
file = file.replace(search, '');
fs.writeFileSync('src/lib/templates/SiteBlogIndex.tsx', file, 'utf8');
console.log('Fixed SiteBlogIndex');
