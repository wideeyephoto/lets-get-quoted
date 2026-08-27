import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const c = await readFile('.env.local', 'utf8');
const env = {};
c.split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
});

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: memberships, error } = await admin
  .from('memberships')
  .select('account_id, user_id, role')
  .limit(10);

if (error) console.error('Membership error:', error);

for (const m of (memberships || [])) {
  const { data: acc } = await admin.from('accounts').select('id, business_name').eq('id', m.account_id).single();
  const { data: u } = await admin.auth.admin.getUserById(m.user_id);
  console.log(`Account: ${acc?.business_name} (${m.account_id}) | Role: ${m.role} | Email: ${u?.user?.email}`);
}
