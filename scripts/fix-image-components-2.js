const fs = require('fs');

function replaceImages(filePath) {
  let file = fs.readFileSync(filePath, 'utf8');
  
  if (!file.includes('SafeImage')) {
    if (filePath.includes('SiteContentSections')) {
      file = file.replace("import styles from './themes.module.css';", "import styles from './themes.module.css';\nimport SafeImage from './SafeImage';");
    } else if (filePath.includes('ProjectShowcase')) {
      file = file.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport SafeImage from './SafeImage';");
    } else if (filePath.includes('BeforeAfterSlider')) {
      file = file.replace("import styles from './themes.module.css';", "import styles from './themes.module.css';\nimport SafeImage from './SafeImage';");
    } else if (filePath.includes('SiteBlogIndex')) {
      file = file.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport SafeImage from './SafeImage';");
    } else if (filePath.includes('SiteBlogArticle')) {
      file = file.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport SafeImage from './SafeImage';");
    }
  }

  // Replace <img ... /> with <SafeImage ... />
  file = file.replace(/<img([^>]*)src=\{([^}]+)\}([^>]*)>/g, (match, before, src, after) => {
    if (match.includes('googleAvatar') || match.includes('avatar') || match.includes('referrerPolicy')) return match;
    if (match.includes('heroBand')) return match;
    
    // remove the trailing / from `after` if it exists, because we will add it back
    const afterClean = after.replace(/\/\s*$/, '');
    
    return `<SafeImage${before}src={${src}}${afterClean} />`;
  });
  
  fs.writeFileSync(filePath, file, 'utf8');
}

function injectWidthHeight(filePath, matchStr, itemObj) {
  let file = fs.readFileSync(filePath, 'utf8');
  file = file.replace(new RegExp('<SafeImage([^>]*' + matchStr + '[^>]*)/>', 'g'), (match, p1) => {
    if (match.includes('width=')) return match;
    return `<SafeImage${p1} width={${itemObj}.width || undefined} height={${itemObj}.height || undefined} />`;
  });
  fs.writeFileSync(filePath, file, 'utf8');
}


const files = [
  'src/lib/templates/SiteContentSections.tsx',
  'src/lib/templates/ProjectShowcase.tsx',
  'src/lib/templates/BeforeAfterSlider.tsx',
  'src/lib/templates/SiteBlogIndex.tsx',
  'src/lib/templates/SiteBlogArticle.tsx'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    replaceImages(file);
    console.log('SafeImage added to', file);
  }
}

injectWidthHeight('src/lib/templates/SiteContentSections.tsx', 'src=\\{item.imageUrl\\}', 'item');
injectWidthHeight('src/lib/templates/ProjectShowcase.tsx', 'src=\\{item.url\\}', 'item');

// for blog we have post.coverImage. Width and height are in post.coverImageWidth/Height?
// The blog post doesn't have width/height in schema, but the task says "Give gallery and blog images intrinsic dimensions".
// Wait, we can add `coverImageWidth?: number; coverImageHeight?: number;` to blog posts.

console.log('Done');
