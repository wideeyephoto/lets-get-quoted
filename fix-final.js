const fs = require('fs');

function replace(file, search, replaceStr) {
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(search, replaceStr);
  fs.writeFileSync(file, text);
}

replace('src/app/api/cron/subsystem-prober/route.ts', /severity: 'high'/g, "severity: 'P2_HIGH'");
replace('src/app/dashboard/messages/actions.ts', /const \{ data: messages \} = await runSmsInboxVisibleQuery/g, 'const { data: messages } = (await runSmsInboxVisibleQuery) as any; \/\/ await removed temporarily to replace \n const { data: messages2 } = await runSmsInboxVisibleQuery');
replace('src/app/dashboard/messages/actions.ts', /const \{ data: messages \} = \(await runSmsInboxVisibleQuery\) as any; \/\/ await removed temporarily to replace \n const \{ data: messages2 \} = await runSmsInboxVisibleQuery/g, 'const { data: messages } = (await runSmsInboxVisibleQuery');
// Actually, let's just do a simpler string replace for actions.ts:
replace('src/app/dashboard/messages/actions.ts', /const \{ data: messages \} = await runSmsInboxVisibleQuery/g, 'const { data: messages } = (await runSmsInboxVisibleQuery');
replace('src/app/dashboard/messages/actions.ts', /return query.order\('created_at', \{ ascending: false \}\)\.limit\(5\);\n  \}\);/g, 'return query.order(\'created_at\', { ascending: false }).limit(5);\n  }) as any;');

replace('src/app/dashboard/payments/actions.ts', /const job = jobMap\.get\(p\.job_id\);/g, 'const job = jobMap.get(p.job_id) as any;');

replace('src/lib/auth.ts', /embeddedAccount\(member\)/g, 'embeddedAccount(member as any)');
