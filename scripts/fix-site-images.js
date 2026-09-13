const fs = require('fs');

let file = fs.readFileSync('src/lib/site-images.ts', 'utf8');

file = file.replace(/export type SiteImage = \{([^}]+)\};/g, "export type SiteImage = {$1  width?: number;\n  height?: number;\n};");

fs.writeFileSync('src/lib/site-images.ts', file, 'utf8');
console.log('Fixed site-images.ts');
