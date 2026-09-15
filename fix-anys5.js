const fs = require('fs');
const files = [
  'src/app/dashboard/cash-flow/actions.ts',
  'src/app/dashboard/claims/page.tsx',
  'src/app/dashboard/clients/[id]/page.tsx',
  'src/app/dashboard/jobs/actions.ts',
  'src/app/dashboard/marketing/campaigns/page.tsx',
  'src/app/dashboard/marketing/links/page.tsx',
  'src/app/dashboard/marketing/page.tsx',
  'src/app/dashboard/marketing/performance/page.tsx',
  'src/app/dashboard/marketing/referrals/page.tsx',
  'src/app/dashboard/messages/actions.ts',
  'src/app/dashboard/messages/page.tsx',
  'src/app/dashboard/payments/actions.ts',
  'src/app/dashboard/settings/page.tsx',
  'src/app/dashboard/sites/actions.ts',
  'src/app/dashboard/sites/page.tsx',
  'src/app/dashboard/text-to-job/page.tsx',
  'src/app/dashboard/voice-calls/page.tsx'
];

for(let f of files) {
  if(!fs.existsSync(f)) continue;
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/\(row\)/g, '(row: any)');
  text = text.replace(/\(r\)/g, '(r: any)');
  text = text.replace(/\(r,\s*idx\)/g, '(r: any, idx: number)');
  text = text.replace(/\(c\)/g, '(c: any)');
  text = text.replace(/\(l\)/g, '(l: any)');
  text = text.replace(/\(m\)/g, '(m: any)');
  text = text.replace(/\(p\)/g, '(p: any)');
  text = text.replace(/\(j\)/g, '(j: any)');
  text = text.replace(/\(o\)/g, '(o: any)');
  text = text.replace(/\(sum,\s*o\)/g, '(sum: any, o: any)');
  text = text.replace(/\(sum,\s*c\)/g, '(sum: any, c: any)');
  text = text.replace(/\(res\)/g, '(res: any)');
  text = text.replace(/\(lead\)/g, '(lead: any)');
  text = text.replace(/\(identity\)/g, '(identity: any)');
  text = text.replace(/\(job\)/g, '(job: any)');
  text = text.replace(/\(path\)/g, '(path: any)');
  text = text.replace(/\(path,\s*index\)/g, '(path: any, index: number)');
  text = text.replace(/\(photo\)/g, '(photo: any)');
  text = text.replace(/\(photo,\s*index\)/g, '(photo: any, index: number)');
  text = text.replace(/row\s*=>/g, '(row: any) =>');
  text = text.replace(/r\s*=>/g, '(r: any) =>');
  text = text.replace(/c\s*=>/g, '(c: any) =>');
  text = text.replace(/m\s*=>/g, '(m: any) =>');
  text = text.replace(/p\s*=>/g, '(p: any) =>');
  text = text.replace(/j\s*=>/g, '(j: any) =>');
  text = text.replace(/l\s*=>/g, '(l: any) =>');
  text = text.replace(/photo\s*=>/g, '(photo: any) =>');
  fs.writeFileSync(f, text);
}
console.log('Done');
