const fs = require('fs');

let f;
f = 'src/app/dashboard/jobs/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/if\s*\(\s*job:\s*any\s*\)/g, 'if (job)');
  fs.writeFileSync(f, text);
}