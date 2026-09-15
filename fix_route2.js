const fs = require('fs');
let text = fs.readFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', 'utf-8');
const search = "onOpenNoiGenerator={(item) => {\r\n              if (item.jobId) {\r\n                router.push(/dashboard/jobs//lien-help);\r\n              } else {\r\n                alert('No job associated with this payment.');\r\n              }\r\n            }}";
const replace = "onOpenNoiGenerator={(item) => {\n              if (item.jobId) {\n                router.push(\/dashboard/jobs/\/lien-help\);\n              } else {\n                alert('No job associated with this payment.');\n              }\n            }}";
text = text.replace(search, replace);
// If Windows newlines are getting mixed up, just replace the exact line
let lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('router.push(/dashboard/jobs/')) {
    lines[i] = "                router.push(\/dashboard/jobs/\/lien-help\);";
  }
}
fs.writeFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', lines.join('\n'));
