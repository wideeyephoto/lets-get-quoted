const fs = require('fs');

let m = fs.readFileSync('src/app/dashboard/messages/actions.ts', 'utf8');
m = m.replace(/QueryResult/g, 'any'); // Just cast to any for this one file or fix it
fs.writeFileSync('src/app/dashboard/messages/actions.ts', m);

let p = fs.readFileSync('src/app/dashboard/payments/actions.ts', 'utf8');
p = p.replace(/const metadata = session\.metadata \|\| \{\};/g, 'const metadata: any = session.metadata || {};');
p = p.replace(/const paymentIntent = stripeEvent\.data\.object;/g, 'const paymentIntent: any = stripeEvent.data.object;');
fs.writeFileSync('src/app/dashboard/payments/actions.ts', p);

let auth = fs.readFileSync('src/lib/auth.ts', 'utf8');
auth = auth.replace(/\{ account_id: accountId, role \}/g, '{ account_id: accountId, role } as any');
auth = auth.replace(/\{ account_id: account\.id, role: 'owner' \}/g, '{ account_id: account.id, role: \\'owner\\' } as any');
fs.writeFileSync('src/lib/auth.ts', auth);

console.log('Fixed others');
