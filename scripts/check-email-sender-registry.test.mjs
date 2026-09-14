import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {inspectTransportSource, compareRegistry, scanTransports} from './check-email-sender-registry.mjs';
const record = signatures => ({purpose:'Sample',recipientScope:'platform',transport:'SDK',suppression:'delivery blocks',remaining:'hosted verification',signatures});

test('ignores comments and ordinary URLs; detects function-scoped SDK calls',()=>{
 const found=inspectTransportSource(`// client.emails.send({}); https://api.resend.com/emails
 export async function notify(){return client.emails.send({});}
 const url='https://example.com';`);
 assert.deepEqual(found,{'notify:sdk-email-submit':1});
});
test('detects direct HTTP, interpolated provider origin and ledger requests',()=>{
 const found=inspectTransportSource('function deliver(){fetch("https://api.resend.com/emails"); client.fetchRequest("/emails",{}); resendRequest("/emails",{}); } const endpoint=`https://api.resend.com${path}`;');
 assert.equal(found['deliver:provider-url'],1); assert.equal(found['deliver:provider-email-request'],2);
 assert.equal(found['<module>:provider-url'],1);
});
test('detects renamed wrappers, namespace calls and provider imports including dynamic imports',()=>{
 const found=inspectTransportSource(`import {sendAccountScopedEmail as checked} from './policy';
 import smtp from 'nodemailer'; async function deliver(){await import('resend'); checked(a,b,c); runtime.preparePlatformTransactionalEmail(a,b);}`);
 assert.equal(found['deliver:gate:sendAccountScopedEmail'],1);
 assert.equal(found['deliver:gate:preparePlatformTransactionalEmail'],1);
 assert.equal(found['<module>:provider-import:nodemailer'],1);
 assert.equal(found['deliver:provider-import:resend'],1);
});
test('new sender in an existing file changes its reviewed signature',()=>{
 const before=inspectTransportSource('function first(){api.emails.send({})}');
 const after=inspectTransportSource('function first(){api.emails.send({})} function second(){api.emails.send({})}');
 assert.match(compareRegistry({'sender.ts':after},{senders:{'sender.ts':record(before)}})[0],/Transport changed/);
});
test('additional submission in the same function changes the count',()=>{
 const before=inspectTransportSource('function send(){api.emails.send({})}');
 const after=inspectTransportSource('function send(){api.emails.send({});api.emails.send({})}');
 assert.match(compareRegistry({'sender.ts':after},{senders:{'sender.ts':record(before)}})[0],/Transport changed/);
});
test('new and deleted files require review',()=>{
 assert.match(compareRegistry({'new.ts':{}},{senders:{}})[0],/Unreviewed/);
 assert.match(compareRegistry({}, {senders:{'old.ts':record({})}})[0],/Stale/);
});
test('missing policy descriptions fail even with matching signatures',()=>{
 const entry=record({}); entry.recipientScope='';
 assert.match(compareRegistry({'a.ts':{}},{senders:{'a.ts':entry}})[0],/Missing recipientScope/);
});
test('formatting and JSON key order do not create drift',()=>{
 const found=inspectTransportSource('function send() {\n api.emails . send ( {} );\n}');
 assert.deepEqual(found,inspectTransportSource('function send(){api.emails.send({});}'));
 assert.deepEqual(compareRegistry({'a.ts':{b:1,a:2}},{senders:{'a.ts':record({a:2,b:1})}}),[]);
});
test('unparseable source fails closed',()=>{
 assert.throws(()=>inspectTransportSource('function broken( {'),/invalid source/);
});
test('filesystem scan excludes documented test and verification fixtures',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sender-registry-'));
 try{
  await mkdir(join(directory,'src')); await mkdir(join(directory,'scripts'));
  for(const file of ['send.ts','send.test.ts']) await writeFile(join(directory,'src',file),'api.emails.send({});');
  await writeFile(join(directory,'scripts','verify-send.mjs'),'api.emails.send({});');
  await writeFile(join(directory,'scripts','operational-send.mjs'),'api.emails.send({});');
  assert.deepEqual(Object.keys(await scanTransports(directory)).sort(),['scripts/operational-send.mjs','src/send.ts']);
 }finally{
  const cleanupPath=resolve(directory), within=relative(resolve(tmpdir()),cleanupPath);
  if(!within || within.startsWith('..') || isAbsolute(within) || !within.startsWith('sender-registry-')) throw Error('Unexpected cleanup path');
  await rm(cleanupPath,{recursive:true,force:true});
 }
});
