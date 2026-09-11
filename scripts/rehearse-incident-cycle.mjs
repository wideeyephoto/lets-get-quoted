import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const contents = await readFile(resolve(root, '.env.live.local'), 'utf8').catch(() => '');
function getEnv(key) {
  if (process.env[key]) return process.env[key];
  return contents.split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${key}=`))
    ?.slice(`${key}=`.length)
    .replace(/^['"]|['"]$/g, '');
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.log('Skipping database test: missing Supabase credentials.');
  process.exit(0);
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('--- Rehearsing Incident Cycle ---');
  
  console.log('1. Admin creates a drafted incident (published = false)');
  const { data: drafted, error: draftErr } = await adminClient
    .from('platform_incidents')
    .insert({
      title: 'Test Incident - Rehearsal',
      description: 'We are investigating an issue.',
      kind: 'incident',
      severity: 'minor',
      owner: 'test@example.com',
      created_by: 'test@example.com',
      published: false
    })
    .select()
    .single();
    
  if (draftErr) throw draftErr;
  
  console.log('2. Anon attempts to read the drafted incident (should be hidden)');
  const { data: anonView1 } = await anonClient.from('platform_incidents').select('*').eq('id', drafted.id);
  if (anonView1 && anonView1.length > 0) throw new Error('Anon was able to read a draft incident! RLS failed.');
  console.log('   -> Success: incident is hidden from anon.');

  console.log('3. Admin publishes the incident');
  await adminClient.from('platform_incidents').update({ published: true }).eq('id', drafted.id);
  
  console.log('4. Anon attempts to read the published incident (should be visible)');
  const { data: anonView2 } = await anonClient.from('platform_incidents').select('*').eq('id', drafted.id);
  if (!anonView2 || anonView2.length === 0) throw new Error('Anon could not read a published incident! RLS failed.');
  console.log('   -> Success: incident is visible to anon.');

  console.log('5. Admin resolves the incident');
  await adminClient.from('platform_incidents').update({ 
    resolved_at: new Date().toISOString(), 
    resolution_summary: 'Issue resolved.' 
  }).eq('id', drafted.id);
  
  console.log('6. Cleanup: delete rehearsal incident');
  await adminClient.from('platform_incidents').delete().eq('id', drafted.id);
  
  console.log('--- Incident Cycle Rehearsal Complete ---');
}

run().catch(console.error);
