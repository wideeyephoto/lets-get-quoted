const fs = require('fs');
let file = 'src/app/api/cron/subsystem-prober/route.ts';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/metadata: \{/g, "summary: 'Money cron failed', details: {");
text = text.replace(/metadata: apm/g, "summary: 'High APM Error Rate', details: apm as any");

fs.writeFileSync(file, text);
