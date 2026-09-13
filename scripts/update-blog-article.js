const fs = require('fs');
let file = fs.readFileSync('src/lib/templates/SiteBlogArticle.tsx', 'utf8');

if (!file.includes('breadcrumbJsonLd')) {
  file = file.replace(/import \{ cspNonce \} from '@\/lib\/csp-nonce';/, "import { cspNonce } from '@/lib/csp-nonce';\nimport { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';");
  
  const target = "const jsonLd = {";
  const insertion = `
  const crumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'Blog', path: '/blog' },
    { name: post.title, path: \`/blog/\${encodeURIComponent(post.slug)}\` },
  ], base);
`;
  file = file.replace(target, insertion + '\n  ' + target);
  
  file = file.replace(/<script type="application\/ld\+json" nonce=\{await cspNonce\(\)\} dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify\(jsonLd\) \}\} \/>/, `<script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />\n      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />`);
  
  fs.writeFileSync('src/lib/templates/SiteBlogArticle.tsx', file, 'utf8');
  console.log('Added Breadcrumbs to SiteBlogArticle');
}
