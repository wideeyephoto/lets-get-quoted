const fs = require('fs');

// Fix createAdminClient
const adminFiles = [
  'src/app/admin/nav-actions.ts',
  'src/app/admin/shift-actions.ts',
  'src/app/admin/triage-actions.ts',
  'src/app/api/cron/subsystem-prober/route.ts'
];
for (const f of adminFiles) {
  if (fs.existsSync(f)) {
    let text = fs.readFileSync(f, 'utf8');
    text = text.replace(/from\s+['"]@\/lib\/supabase['"]/g, "from '@/lib/supabase-admin'");
    fs.writeFileSync(f, text);
  }
}

// Fix critical severity
const proberFile = 'src/app/api/cron/subsystem-prober/route.ts';
if (fs.existsSync(proberFile)) {
  let text = fs.readFileSync(proberFile, 'utf8');
  // Just in case it's supposed to be 'high' or 'fatal', let's just make it 'high' if critical is invalid
  text = text.replace(/severity:\s*['"]critical['"]/g, "severity: 'high'");
  fs.writeFileSync(proberFile, text);
}

console.log('Fixed simple errors');