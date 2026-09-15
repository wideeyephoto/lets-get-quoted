const fs = require('fs');

let f;
f = 'src/app/dashboard/jobs/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/formatJobQuoteSummary\(job:\s*any\)/g, 'formatJobQuoteSummary(job)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/marketing/referrals/page.tsx';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/getLeadTriage\(lead:\s*any\)/g, 'getLeadTriage(lead)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/sites/actions.ts';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/push\(c:\s*any\)/g, 'push(c)');
  fs.writeFileSync(f, text);
}

f = 'src/app/dashboard/text-to-job/page.tsx';
if(fs.existsSync(f)) {
  let text = fs.readFileSync(f, 'utf8');
  text = text.replace(/isCrewPhoneVerified\(c:\s*any\)/g, 'isCrewPhoneVerified(c)');
  text = text.replace(/resolveCrewPhoneVerification\(c:\s*any\)/g, 'resolveCrewPhoneVerification(c)');
  fs.writeFileSync(f, text);
}