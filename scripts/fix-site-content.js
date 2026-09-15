const fs = require('fs');

let file = fs.readFileSync('src/lib/site-content.ts', 'utf8');

file = file.replace('coverImage: string;', 'coverImage: string;\n  coverImageWidth?: number;\n  coverImageHeight?: number;');
file = file.replace('beforeUrl: string;', 'beforeUrl: string;\n  beforeWidth?: number;\n  beforeHeight?: number;');
file = file.replace('afterUrl: string;', 'afterUrl: string;\n  afterWidth?: number;\n  afterHeight?: number;');

fs.writeFileSync('src/lib/site-content.ts', file, 'utf8');
console.log('Fixed site-content.ts');
