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
  // We need to map `src` to `src`, `alt` to `alt`. If width/height exist, pass them, else omit.
  // Wait, SafeImage takes width and height but they are optional now!
  file = file.replace(/<img([^>]*)src=\{([^}]+)\}([^>]*)>/g, (match, before, src, after) => {
    // skip avatar/googleAvatar which might be small or specific
    if (match.includes('googleAvatar') || match.includes('avatar') || match.includes('referrerPolicy')) {
      return match;
    }
    // skip hero bands
    if (match.includes('heroBand')) {
      return match;
    }
    return `<SafeImage${before}src={${src}}${after}>`;
  });
  
  // What if it is `src="..."`?
  // Let's replace those too, except we don't have static strings.
  
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
    console.log('Fixed', file);
  }
}
