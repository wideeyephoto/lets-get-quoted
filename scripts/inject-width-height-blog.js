const fs = require('fs');

function injectWidthHeight(filePath, matchStr, itemObj) {
  let file = fs.readFileSync(filePath, 'utf8');
  file = file.replace(new RegExp('<SafeImage([^>]*' + matchStr + '[^>]*)/>', 'g'), (match, p1) => {
    if (match.includes('width=')) return match;
    return `<SafeImage${p1} width={${itemObj}.coverImageWidth || undefined} height={${itemObj}.coverImageHeight || undefined} />`;
  });
  fs.writeFileSync(filePath, file, 'utf8');
}

injectWidthHeight('src/lib/templates/SiteBlogIndex.tsx', 'src=\\{post.coverImage\\}', 'post');
injectWidthHeight('src/lib/templates/SiteBlogIndex.tsx', 'src=\\{posts\\[0\\]\\.coverImage\\}', 'posts[0]');
injectWidthHeight('src/lib/templates/SiteBlogArticle.tsx', 'src=\\{post.coverImage\\}', 'post');

console.log('Injected width/height into blog');
