const fs = require('fs');

const css = fs.readFileSync('src/lib/templates/themes.module.css', 'utf8');

const themes = ['forge', 'guild', 'vista', 'handy', 'coat', 'fixit', 'reno', 'shine'];
const themeCss = {};
themes.forEach(t => themeCss[t] = []);
const sharedCss = [];

// A very naive CSS tokenizer/parser for top-level rules.
let currentBlock = '';
let inBlock = false;
let braceDepth = 0;
let currentSelector = '';

let buffer = '';

for (let i = 0; i < css.length; i++) {
  const char = css[i];
  buffer += char;
  
  if (char === '{') {
    braceDepth++;
  } else if (char === '}') {
    braceDepth--;
    if (braceDepth === 0) {
      // End of a top level block (or @media block, which might have nested stuff)
      // Actually, if it's an @media, we shouldn't split inside it unless we have to, 
      // but usually @media is top level.
      // Wait, if it's @media, the selector is `@media ... { .forge ... }`.
      
      // We will just do a simpler approach: regex match.
    }
  }
}
