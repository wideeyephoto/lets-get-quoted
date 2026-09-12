const fs = require('fs');

function injectWidthHeight(filePath, matchStr, itemObj) {
  let file = fs.readFileSync(filePath, 'utf8');
  file = file.replace(new RegExp('<SafeImage([^>]*' + matchStr + '[^>]*)>', 'g'), (match, p1) => {
    if (match.includes('width=')) return match; // already injected
    return `<SafeImage${p1} width={${itemObj}.width || undefined} height={${itemObj}.height || undefined}>`;
  });
  fs.writeFileSync(filePath, file, 'utf8');
}

injectWidthHeight('src/lib/templates/SiteContentSections.tsx', 'src=\\{item.imageUrl\\}', 'item');
injectWidthHeight('src/lib/templates/ProjectShowcase.tsx', 'src=\\{item.url\\}', 'item');
// BeforeAfter slider items don't have width/height in SiteImage because they are SiteBeforeAfterItem. Let's see if we should just leave it.

console.log('Injected width/height');
