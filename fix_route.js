const fs = require('fs');
let lines = fs.readFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', 'utf-8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('router.push(/dashboard/jobs//lien-help);')) {
    lines[i] = lines[i].replace('router.push(/dashboard/jobs//lien-help);', 'router.push(\/dashboard/jobs/\/lien-help\);');
  }
}
fs.writeFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', lines.join('\n'));
