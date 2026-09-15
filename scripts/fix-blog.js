const fs = require('fs');
let code = fs.readFileSync('src/lib/templates/SiteBlogIndex.tsx', 'utf-8');

code = code.replace(
  'export default function SiteBlogIndex(',
  'export default async function SiteBlogIndex('
);

fs.writeFileSync('src/lib/templates/SiteBlogIndex.tsx', code);
