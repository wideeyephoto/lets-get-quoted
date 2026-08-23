import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const admin = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function main() {
  const { data: l, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'brett.arnold@live.com' });
  if (error) {
    console.error('Error generating link:', error);
    process.exit(1);
  }
  console.log(`LOGIN_URL:http://localhost:3010/auth/confirm?token_hash=${l.properties.hashed_token}&type=magiclink`);
}

main();
