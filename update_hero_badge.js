const fs = require('fs');
const files = ['coat.tsx', 'fixit.tsx', 'forge.tsx', 'handy.tsx', 'modern.tsx', 'professional.tsx', 'reno.tsx', 'shine.tsx'];

for (const file of files) {
  const path = 'src/lib/templates/' + file;
  let content = fs.readFileSync(path, 'utf8');
  
  if (!content.includes('import ResponseTimeBadge')) {
    content = content.replace(/import TextLink from '\.\/TextLink';/, "import TextLink from './TextLink';\nimport ResponseTimeBadge from './ResponseTimeBadge';");
  }

  // Handle \r\n
  content = content.replace(/(<TextLink site=\{site\}[^>]*>\r?\n\s*<\/div>|<TextLink site=\{site\}[^>]* \/>\r?\n\s*<\/div>)/g, "$1\n          <ResponseTimeBadge site={site} className={styles.replyBadge} />");

  fs.writeFileSync(path, content);
}
