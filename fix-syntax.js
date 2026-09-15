const fs = require('fs');

let f;
f = 'src/app/dashboard/cash-flow/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/update\(row:\s*any\)/g, 'update(row)');
  text = text.replace(/insert\(row:\s*any\)/g, 'insert(row)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/jobs/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/update\(row:\s*any\)/g, 'update(row)');
  text = text.replace(/insert\(row:\s*any\)/g, 'insert(row)');
  text = text.replace(/match\(j:\s*any\)/g, 'match(j)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/marketing/referrals/page.tsx';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/match\(c:\s*any\)/g, 'match(c)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/sites/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/update\(row:\s*any\)/g, 'update(row)');
  text = text.replace(/insert\(row:\s*any\)/g, 'insert(row)');
  text = text.replace(/match\(j:\s*any\)/g, 'match(j)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/text-to-job/page.tsx';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/match\(c:\s*any\)/g, 'match(c)');
  text = text.replace(/match\(row:\s*any\)/g, 'match(row)');
  fs.writeFileSync(f, text);
}