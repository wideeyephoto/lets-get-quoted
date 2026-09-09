#!/usr/bin/env node
// Isolated local preview of a restored project, with no live provider secrets.
import { readdir, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readEnv } from './lib/dr-capture.mjs';
import { assertScratchTarget } from './lib/dr-target.mjs';
const root=resolve(import.meta.dirname,'..');
const primary=await readEnv(resolve(root,'.env.local'));
const staging=await readEnv(resolve(root,'.env.staging.local'));
const expected=process.argv.find(a=>a.startsWith('--project='))?.slice(10);
if(!/^[a-z]{20}$/.test(expected||''))throw Error('Explicit --project is required');
assertScratchTarget(staging.DATABASE_URL,primary.DATABASE_URL,expected);
if(new URL(staging.NEXT_PUBLIC_SUPABASE_URL).hostname!==expected+'.supabase.co')throw Error('API project mismatch');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
// An existing empty variable wins over Next's automatic .env.local loading.
for(const file of await readdir(root))if(/^\.env(?:\.|$)/.test(file)){
  for(const key of Object.keys(await readEnv(resolve(root,file))))env[key]='';
}
for(const key of ['DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_EMAILS'])env[key]=staging[key];
Object.assign(env,{NODE_ENV:'development',NEXT_PUBLIC_APP_URL:'http://localhost:3014',NEXT_DIST_DIR:'tmp/.next-dr-recovery',NEXT_TELEMETRY_DISABLED:'1',CRON_SECRET:randomBytes(32).toString('hex'),RESEND_API_KEY:'re_dr_placeholder',STRIPE_SECRET_KEY:'sk_test_dr_placeholder',TWILIO_ACCOUNT_SID:'AC00000000000000000000000000000000',TWILIO_AUTH_TOKEN:'dr-placeholder'});
const log=await open(resolve(root,'tmp/dr-preview.log'),'a',0o600);
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3014'],{cwd:root,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
console.log(JSON.stringify({pid:child.pid,url:'http://localhost:3014',targetProject:expected,liveProviderSecrets:false,log:'tmp/dr-preview.log'}));
child.on('exit',code=>{process.exitCode=code||0;});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
