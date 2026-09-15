const fs = require('fs');
let file = fs.readFileSync('src/lib/seo/video-index-page.tsx', 'utf8');

file = file.replace(/if \(!site\)   const base = site \? siteOrigin\(site\) \|\| 'https:\/\/letsgetquoted\.com' : 'https:\/\/letsgetquoted\.com';\r?\n\s*return \{\r?\n\s*alternates: \{ canonical: \`\$\{base\}\/videos\` \}, title: 'Not found' \};/, "if (!site) return { title: 'Not found' };");

fs.writeFileSync('src/lib/seo/video-index-page.tsx', file, 'utf8');
console.log('Fixed video-index-page');
