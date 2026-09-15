const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/lib/templates/**/*.tsx');
files.forEach(file => {
  if (file.includes('CallLink.tsx')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('tel:')) {
    let modified = false;

    // A simple regex to find `<a ... href={\`tel:${site.phone}\`} ... > ... </a>`
    // We can match `<a ... >` and replace `<a` with `<CallLink site={site}` and remove `href=...`.
    // Then we replace the corresponding `</a>` with `</CallLink>`.
    
    // Actually, it's easier to just do it manually for 14 files or use a slightly smarter script.
    
    let parts = content.split(/(<a\s+[^>]*?href=\{?\`tel:\$\{?(?:site\.)?phone\}?\`\}?[^>]*?>|<\/a>)/g);
    let openCallLinks = 0;
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('<a ') && parts[i].includes('tel:')) {
        parts[i] = parts[i].replace('<a ', '<CallLink site={site} ').replace(/\s*href=\{?\`tel:\$\{?(?:site\.)?phone\}?\`\}?/, '');
        openCallLinks++;
        modified = true;
      } else if (parts[i] === '</a>') {
        if (openCallLinks > 0) {
          parts[i] = '</CallLink>';
          openCallLinks--;
        }
      }
    }
    
    if (modified) {
      let newContent = parts.join('');
      // Add import CallLink from './CallLink'; if not present
      if (!newContent.includes('import CallLink from ')) {
        const lines = newContent.split('\n');
        let importIdx = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith('import ')) {
            importIdx = i + 1;
            break;
          }
        }
        lines.splice(importIdx, 0, 'import CallLink from \'./CallLink\';');
        newContent = lines.join('\n');
      }
      fs.writeFileSync(file, newContent, 'utf8');
      console.log('Modified', file);
    }
  }
});
