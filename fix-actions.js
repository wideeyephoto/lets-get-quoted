const fs = require('fs');
let file = 'src/app/dashboard/messages/actions.ts';
let text = fs.readFileSync(file, 'utf8');
text = text.replace(/return query.order\('created_at', \{ ascending: false \}\)\.limit\(5\);\n  \}\) as any;/g, 'return query.order(\'created_at\', { ascending: false }).limit(5);\n  })) as any;');
fs.writeFileSync(file, text);
