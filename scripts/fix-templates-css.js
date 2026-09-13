const fs = require('fs');
const path = require('path');

const templates = [
  { file: 'forge.tsx', css: 'forge.module.css' },
  { file: 'professional.tsx', css: 'guild.module.css' },
  { file: 'modern.tsx', css: 'vista.module.css' },
  { file: 'handy.tsx', css: 'handy.module.css' },
  { file: 'coat.tsx', css: 'coat.module.css' },
  { file: 'fixit.tsx', css: 'fixit.module.css' },
  { file: 'reno.tsx', css: 'reno.module.css' },
  { file: 'shine.tsx', css: 'shine.module.css' },
];

templates.forEach(t => {
  const p = path.join('src/lib/templates', t.file);
  let content = fs.readFileSync(p, 'utf8');
  
  // We need to inject the import for the theme css
  if (!content.includes(t.css)) {
    content = content.replace("import styles from './themes.module.css';", "import baseStyles from './themes.module.css';\nimport themeStyles from './" + t.css + "';\nconst styles = { ...baseStyles, ...themeStyles };");
    fs.writeFileSync(p, content, 'utf8');
  }
});
console.log('Fixed templates');
