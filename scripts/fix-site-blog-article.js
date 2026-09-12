const fs = require('fs');

let file = fs.readFileSync('src/lib/templates/SiteBlogArticle.tsx', 'utf8');

const themeClassReplacement = `
  let themeClass = '';
  switch (site.template) {
    case 'carbon': themeClass = (await import('./forge.module.css')).default.forge; break;
    case 'professional': themeClass = (await import('./guild.module.css')).default.guild; break;
    case 'modern': themeClass = (await import('./vista.module.css')).default.vista; break;
    case 'handy': themeClass = (await import('./handy.module.css')).default.handy; break;
    case 'coat': themeClass = (await import('./coat.module.css')).default.coat; break;
    case 'fixit': themeClass = (await import('./fixit.module.css')).default.fixit; break;
    case 'reno': themeClass = (await import('./reno.module.css')).default.reno; break;
    case 'shine': themeClass = (await import('./shine.module.css')).default.shine; break;
    default: themeClass = (await import('./forge.module.css')).default.forge; break;
  }
`;

file = file.replace(/const THEME_CLASS: Record<string, string> = \{[\s\S]*?\};\n/, '');
file = file.replace(/const themeClass = THEME_CLASS\[site\.template\] \|\| 'forge';/, themeClassReplacement);

fs.writeFileSync('src/lib/templates/SiteBlogArticle.tsx', file, 'utf8');
console.log('Fixed SiteBlogArticle');
