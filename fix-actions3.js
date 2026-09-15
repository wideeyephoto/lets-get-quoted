const fs = require('fs');
let file = 'src/app/dashboard/messages/actions.ts';
let text = fs.readFileSync(file, 'utf8');
let lines = text.split('\n');
lines[532] = '  })) as any;';
fs.writeFileSync(file, lines.join('\n'));
