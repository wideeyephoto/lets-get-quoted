const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src/app/site/[kind]/[tenant]');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Change params: { subdomain: string } to params: { kind: string, tenant: string }
  content = content.replace(/\{\s*subdomain:\s*string\s*\}/g, '{ kind: string; tenant: string }');

  // Change params: Promise<{ subdomain: string, slug: string }> to { kind: string, tenant: string, slug: string }
  content = content.replace(/\{\s*subdomain:\s*string;\s*slug:\s*string\s*\}/g, '{ kind: string; tenant: string; slug: string }');

  // Same for non-promise forms
  content = content.replace(/\{\s*subdomain:\s*string,\s*slug:\s*string\s*\}/g, '{ kind: string; tenant: string; slug: string }');

  fs.writeFileSync(file, content, 'utf8');
});

// Also fix HeroQuickForm typescript error temporarily
let heroForm = fs.readFileSync('src/lib/templates/HeroQuickForm.tsx', 'utf8');
heroForm = heroForm.replace(/if \(result\?\.continuationToken/g, 'if ((result as any)?.continuationToken');
heroForm = heroForm.replace(/result\.continuationToken as string/g, '(result as any).continuationToken as string');
fs.writeFileSync('src/lib/templates/HeroQuickForm.tsx', heroForm, 'utf8');

console.log('Fixed typescript errors.');
