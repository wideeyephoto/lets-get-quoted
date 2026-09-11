/** Real production/staging browser and HTTP access verification. No injected SQL claims.
 * Required flags are documented in tenant-office-fixtures.mjs. Outputs contain only
 * marked fixture data; credentials, cookies, magic links and tokens never enter evidence.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { admin, db, env, options, origin, privateDir, project, read, snapshot, cleanup } from './tenant-office-fixtures.mjs';

assert.match(options['--commit'] || '', /^[0-9a-f]{40}$/, 'A verified production/source commit is required');
const local = new URL(origin).hostname === 'localhost';
assert(local ? options['--deployment'] === 'local' : /^dpl_[A-Za-z0-9]+$/.test(options['--deployment'] || ''), 'A verified deployment ID (or local for localhost) is required');
const m=read(), [a,b]=m.accounts;
assert.equal(m.accounts.length,2,'Two prepared fixture accounts required');
assert(!m.cleanedAt,'Prepare new fixtures; this audit was already cleaned up');
const evidence={ startedAt:new Date().toISOString(), origin, project, fixtureMarker:m.marker,
  release:{commit:options['--commit'],deployment:options['--deployment'],workingTree:local},
  sourceHashes:Object.fromEntries(['src/lib/job-access-fetch.ts','src/lib/supabase.ts','src/lib/supabase-server.ts',
    'migrations/20260911154456_repair_office_job_write_boundary.sql','migrations/20260911154457_enforce_office_job_read_boundary.sql']
    .map(file=>[file,createHash('sha256').update(readFileSync(resolve(file))).digest('hex')])),
  method:'Chromium magic-link callback; Auth-issued session cookies and their access tokens; no mocked responses or SQL role impersonation',
  cases:[],grantTransitions:[],actors:Object.fromEntries(Object.entries(m.actors).map(([k,v])=>[k,v.id])) };
const output=resolve(options['--evidence'] || 'docs/tenant-office-browser-evidence-2026-09-09.json');
const sessions={}; let browser; let requests=[];
function save(){writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');}
async function check(id,description,fn){
  const row={id,description,at:new Date().toISOString()}; requests=[];
  try{row.observed=await fn();row.status='PASS';}
  catch(e){row.status='FAIL';row.error=String(e.message).replace(/https?:\/\/\S*token\S*/g,'[redacted auth URL]').slice(0,1500);}
  row.requests=[...requests]; evidence.cases.push(row);save(); console.log(`${row.status} ${id}: ${description}`);
}
async function signin(label){
  const actor=m.actors[label];
  const context=await browser.newContext(); const page=await context.newPage();
  page.setDefaultTimeout(30000);
  const {data,error}=await admin.auth.admin.generateLink({type:'magiclink',email:actor.email});
  if(error)throw error;
  const url=new URL('/auth/magic-link-callback',origin);
  url.searchParams.set('token_hash',data.properties.hashed_token);url.searchParams.set('next','/workspaces');
  await page.goto(url.toString(),{waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).pathname,'/workspaces','Real magic-link callback must establish a session');
  const cookies=await context.cookies();
  const base=`sb-${project}-auth-token`;
  const cookie=cookies.filter(c=>c.name===base || c.name.startsWith(base+'.'))
    .sort((x,y)=>x.name.localeCompare(y.name,undefined,{numeric:true})).map(c=>c.value).join('');
  assert(cookie.startsWith('base64-'),'Expected SSR session cookie');
  const token=JSON.parse(Buffer.from(cookie.slice(7),'base64url').toString()).access_token;
  const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  const user=await response.json(); assert.equal(response.status,200);assert.equal(user.id,actor.id);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  sessions[label]={context,page,token,errors};
  return {identity:user.id,path:new URL(page.url()).pathname,sessionFingerprint:createHash('sha256').update(token).digest('hex').slice(0,16)};
}
async function rest(actor,path,{method='GET',body,headers={}}={}){
  const res=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`,{method,headers:{
    apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${sessions[actor].token}`,
    'Content-Type':'application/json',Prefer:'return=representation',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text.slice(0,200)}
  const result={status:res.status,data};requests.push({surface:'Data API',actor,path,method,...result});return result;
}
async function api(actor,path){
  const res=await sessions[actor].context.request.get(origin+path,{maxRedirects:0});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text.slice(0,200)}
  const result={status:res.status(),data:data.detail ?? data,cacheControl:res.headers()['cache-control']};
  requests.push({surface:'App API',actor,path,...result});return result;
}
async function page(actor,path,file){
  const p=sessions[actor].page, errorsStart=sessions[actor].errors.length;
  const response=await p.goto(origin+path,{waitUntil:'load'});
  await p.locator('main[aria-busy="true"]').waitFor({state:'hidden'});
  // Next can stream a redirect after its document starts. Wait for any meta
  // refresh to navigate, then examine the actual rendered destination.
  if(await p.locator('meta[http-equiv="refresh"]').count()) {
    await p.waitForURL(url=>url.pathname!==path);
    await p.waitForLoadState('load');
    await p.locator('main[aria-busy="true"]').waitFor({state:'hidden'});
  }
  // Text can arrive before hydration and a CSS entrance transition settles.
  // Require a visible heading through all its ancestors before scoring/capture.
  await p.waitForFunction(() => {
    const heading=document.querySelector('main h1, h1') || document.querySelector('main');
    // A legitimate denied/not-found page may render only a paragraph.
    if (!heading?.textContent?.trim() || heading.getBoundingClientRect().height === 0 || document.querySelector('main[aria-busy="true"]')) return false;
    for(let node=heading;node;node=node.parentElement) {
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<0.99)return false;
    }
    return true;
  });
  if(await p.locator('h1').count()) await p.locator('h1').first().click({trial:true});
  assert.equal(await p.locator('[data-nextjs-dialog],.vite-error-overlay').count(),0);
  assert.deepEqual(sessions[actor].errors.slice(errorsStart),[]);
  const body=await p.locator('body').innerText(); const html=await p.content();
  // Finish finite entrance animations so evidence captures the rendered page,
  // rather than a transparent initial frame after its text is already present.
  if(file)await p.screenshot({path:resolve(privateDir,file),fullPage:false,animations:'disabled'});
  requests.push({surface:'Browser',actor,requestedPath:path,path:new URL(p.url()).pathname,
    status:response?.status(),body:body.slice(0,6500),quoteSentinel:html.includes(String(a.amount)) || html.includes('17,351.69') || html.includes(a.quoteLabel),
    errors:sessions[actor].errors.slice(errorsStart),screenshot:file??null});
  return {status:response?.status(),path:new URL(p.url()).pathname,body,html};
}
async function grant(keys){
  const r=await rest('ownerA','rpc/replace_office_member_capabilities',{method:'POST',body:{p_account_id:a.id,p_user_id:m.actors.officeA.id,p_capabilities:keys}});
  assert(r.status<300,JSON.stringify(r));
  evidence.grantTransitions.push({at:new Date().toISOString(),keys});save();
}
function noRows(r){assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data,[]);return r;}
function noMoney(value){const text=JSON.stringify(value);assert(!text.includes(String(a.amount)) && !text.includes('17,351.69') && !text.includes(a.quoteLabel),'Restricted quote sentinel was returned');}
async function exactJob(){return (await db.query('select account_id,client_id,scope,quoted_amount from jobs where id=$1',[a.job])).rows[0];}

try{
  await db.connect();
  evidence.baseline=await snapshot(m);
  evidence.database={migration:(await db.query('select max(version) as version from supabase_migrations.schema_migrations')).rows[0].version,
    capabilities:(await db.query('select capability,enabled from office_capabilities order by capability')).rows};
  browser=await chromium.launch({headless:true});
  for(const label of ['ownerA','ownerB','officeA']) await check('SIGNIN-'+label,`Real browser sign-in and identity check: ${label}`,()=>signin(label));
  assert(Object.keys(sessions).length===3,'All positive-control sessions required');
  await check('SERVICE-ROLE-PRICE','Real admin client changes the marked price and the database confirms it',async()=>{
    const before=await exactJob();
    try {
      const {data,error}=await admin.from('jobs').update({quoted_amount:a.amount+2}).eq('id',a.job).eq('test_marker',m.marker).select('id,quoted_amount').single();
      assert.ifError(error);assert.equal(data.quoted_amount,a.amount+2);
      assert.equal(Number((await exactJob()).quoted_amount),a.amount+2);
      return {id:data.id,quoted_amount:data.quoted_amount};
    } finally {await db.query('update jobs set quoted_amount=$2 where id=$1 and test_marker=$3',[a.job,before.quoted_amount,m.marker]);}
  });
  for(const [label,own,other] of [['ownerA',a,b],['ownerB',b,a]]){
    await check('OWNER-'+label,'Owner retrieves exact own fixture and nonzero quote',async()=>{
      const r=await rest(label,`job_access?id=eq.${own.job}&select=id,account_id,quoted_amount,quote_items`);
      assert.equal(r.status,200);assert.equal(r.data[0]?.id,own.job);assert.equal(Number(r.data[0]?.quoted_amount),own.amount);return r;
    });
    await check('TENANT-'+label,'Owner cannot retrieve foreign fixture',async()=>noRows(await rest(label,`job_access?id=eq.${other.job}&select=id,quoted_amount`)));
  }
  await check('NO-GRANTS-PAGE','No-grant office reaches holding page without private data',async()=>{
    const r=await page('officeA','/dashboard','office-no-grants.png');assert.equal(r.path,'/office-access');assert(!r.body.includes(a.clientName));return {path:r.path,status:r.status};
  });
  await check('NO-GRANTS-API','No-grant office JSON API is forbidden',async()=>{const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,403);return r;});
  await check('NO-GRANTS-REST','No-grant office Data API denies own fixture',async()=>noRows(await rest('officeA',`clients?id=eq.${a.client}&select=id`)));
  await grant(['clients.read']);
  await check('CLIENT-ONLY','Client reader can retrieve exact client without job permission',async()=>{
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,200);assert.equal(r.data.id,a.client);noMoney(r.data);return r;
  });
  await check('CLIENT-ONLY-JOB-DENIAL','Client-only office cannot open job page',async()=>{const r=await page('officeA',`/dashboard/jobs/${a.job}`);assert(!r.body.includes(`Operational scope A`));assert(r.path!==`/dashboard/jobs/${a.job}` || r.status===404);return {path:r.path,status:r.status};});
  await grant(['clients.read','jobs.read']);
  await check('PERMIT-SESSION-GETJOB','Owner and restricted office getJob-backed permit history remains available',async()=>{
    const rows=[];
    for (const actor of ['ownerA','officeA']) {
      const r=await api(actor,`/api/jobs/${a.job}/permits/history`);
      assert.equal(r.status,200);noMoney(r.data);rows.push({actor,...r});
    }
    return rows;
  });
  await check('CLIENT-DETAIL-PAGE','Reader sees useful client detail with money redacted',async()=>{
    const r=await page('officeA',`/dashboard/clients/${a.client}`,'office-client-detail.png');assert(r.body.includes(a.clientName));noMoney(r.html);return {path:r.path,status:r.status,clientVisible:true,quoteAbsent:true};
  });
  await check('CLIENT-FOCUS-API','Reader Focus JSON contains correct client/job and no financial sentinel',async()=>{
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,200);assert.equal(r.data.id,a.client);assert(r.data.jobs.some(j=>j.id===a.job));noMoney(r.data);return r;
  });
  await check('JOB-DETAIL-PAGE','Reader job page and serialized data redact quote fields',async()=>{
    const r=await page('officeA',`/dashboard/jobs/${a.job}`,'office-job-detail.png');assert(r.body.toLowerCase().includes(a.ref.toLowerCase()));assert(r.body.includes(a.clientName));noMoney(r.html);return {path:r.path,status:r.status,jobVisible:true};
  });
  await check('FINANCE-REST','jobs.read does not disclose quote amount/items through Data API',async()=>{
    const r=await rest('officeA',`jobs?id=eq.${a.job}&select=id,quoted_amount,quote_items`);
    // Own fixture exists and operational reads were positively verified above.
    if(r.status===200)noMoney(r.data);else assert([401,403].includes(r.status));return r;
  });
  await check('FINANCE-VIEW','Operational view returns the exact job with all protected fields masked',async()=>{
    const r=await rest('officeA',`job_access?id=eq.${a.job}&select=*,clients!jobs_client_id_fkey(id,name)`);
    assert.equal(r.status,200);assert.equal(r.data[0]?.id,a.job);assert.equal(r.data[0].clients.id,a.client);noMoney(r.data);
    assert.equal(r.data[0].quoted_amount,0);assert.equal(r.data[0].quote_items,null);return r;
  });
  await check('FINANCE-FILTER','Raw quote filters and wildcard/embedded reads cannot bypass column privileges',async()=>{
    const rows=[];
    for(const path of [`jobs?id=eq.${a.job}&select=*`,`jobs?quoted_amount=gt.1&select=id`,
      `clients?id=eq.${a.client}&select=id,jobs(quoted_amount)`]){
      const r=await rest('officeA',path);assert.equal(r.status,403);noMoney(r.data);rows.push(r);
    }
    return rows;
  });
  await check('CLIENT-JOB-EMBED','Client-to-job view embedding preserves response shape and confidentiality',async()=>{
    const r=await rest('officeA',`clients?id=eq.${a.client}&select=id,jobs:job_access(id,quoted_amount,quote_items)`);
    assert.equal(r.status,200);assert.equal(r.data[0]?.jobs[0]?.id,a.job);noMoney(r.data);return r;
  });
  await check('PRIVATE-HELPER','Private finance helper is not an exposed Data API RPC',async()=>{
    const r=await rest('officeA','rpc/job_quote_values',{method:'POST',body:{p_job_id:a.job},headers:{'Content-Profile':'private'}});
    assert.equal(r.status,406);assert.equal(r.data.code,'PGRST106');return r;
  });
  await check('TENANT-OFFICE-REST','A-only office cannot read B clients/jobs',async()=>{
    const clients=noRows(await rest('officeA',`clients?id=eq.${b.client}&select=id,name`));
    const jobs=noRows(await rest('officeA',`job_access?account_id=eq.${b.id}&select=id,quoted_amount`));return {clients,jobs};
  });
  await check('TENANT-OFFICE-API','A-only office Focus API cannot retrieve B client',async()=>{const r=await api('officeA',`/api/clients/${b.client}/detail`);assert.equal(r.status,404);return r;});
  await check('TENANT-OFFICE-PAGE','Foreign client/job deep links expose no fixture data',async()=>{
    const rows=[];for(const path of [`/dashboard/clients/${b.client}`,`/dashboard/jobs/${b.job}`]){
      const r=await page('officeA',path);assert(!r.html.includes(b.clientName));assert(!r.html.includes(b.quoteLabel));assert(r.status===404 || r.path!==path || /(?:Client|Job) not found/i.test(r.body));rows.push({path:r.path,status:r.status});}return rows;
  });
  await check('READONLY-WRITE','Read-only Data API edit leaves fixture unchanged',async()=>{
    const before=await exactJob(); const r=await rest('officeA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{scope:'unauthorized read-only edit'}});
    assert.equal(r.status,200);assert.deepEqual(r.data,[]);assert.deepEqual(await exactJob(),before);return r;
  });
  await check('FORGED-WORKSPACE','Forged workspace cookie cannot give A-only office B access',async()=>{
    await sessions.officeA.context.addCookies([{name:'lgq_workspace',value:`${m.actors.officeA.id}:${b.id}`,url:origin}]);
    const r=await api('officeA',`/api/clients/${b.client}/detail`);assert([403,404].includes(r.status));
    const own=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(own.status,200);return {foreign:r.status,safeFallback:own.data.id};
  });
  await check('ADMIN-DENIAL','Owner and office tenant identities cannot open platform admin',async()=>{
    const rows=[];for(const actor of ['ownerA','officeA']){const r=await page(actor,'/admin');assert(r.status===404 || r.path!='/admin');rows.push({actor,path:r.path,status:r.status});}return rows;
  });
  await grant(['clients.read','jobs.read','quotes.read']);
  await check('FINANCE-GRANTED','Explicit quotes.read exposes expected nonzero quote in Focus JSON',async()=>{
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,200);assert.equal(r.data.totals.quoted,a.amount);assert.deepEqual(r.data.payments,[]);return r;
  });
  await grant(['clients.read','jobs.read']);
  await check('FINANCE-REVOKED','Existing cookie loses quote permission on next Focus request',async()=>{
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,200);noMoney(r.data);return r;
  });
  await grant(['clients.read','jobs.read','clients.write','jobs.write']);
  await check('WRITER-POSITIVE','Writer edits harmless scope; independent database read confirms exact change',async()=>{
    assert.notEqual((await exactJob()).scope,'Authorized operational edit','Positive control must change the prior value');
    const r=await rest('officeA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{scope:'Authorized operational edit'}});
    assert.equal(r.status,200);assert.equal((await exactJob()).scope,'Authorized operational edit');return {status:r.status,scope:(await exactJob()).scope};
  });
  await check('WRITER-FINANCE','Operational job writer cannot mass-assign quoted_amount',async()=>{
    const before=await exactJob();const r=await rest('officeA',`jobs?id=eq.${a.job}&select=id,scope`,{method:'PATCH',body:{scope:'Authorized operational edit',quoted_amount:12345.67}});
    const after=await exactJob();
    await db.query('update jobs set scope=$2,quoted_amount=$3 where id=$1 and test_marker=$4',[a.job,before.scope,before.quoted_amount,m.marker]);
    assert.equal(Number(after.quoted_amount),Number(before.quoted_amount),`Unauthorized price changed to ${after.quoted_amount}; restored fixture immediately`);
    assert.equal(r.status,403);assert.equal(r.data.message,'job_quote_write_required');
    return {status:r.status,before,after};
  });
  await check('WRITER-FOREIGN','Operational writer cannot update B job or move A job to B',async()=>{
    const before=await exactJob();const foreign=await rest('officeA',`jobs?id=eq.${b.job}&select=id,scope`,{method:'PATCH',body:{scope:'forbidden foreign edit'}});
    const move=await rest('officeA',`jobs?id=eq.${a.job}&select=id,account_id`,{method:'PATCH',body:{account_id:b.id}});
    assert.equal(foreign.status,200);assert.deepEqual(foreign.data,[]);assert.equal(move.status,403);assert.equal(move.data.code,'42501');assert.equal(move.data.message,'job_identity_cannot_change');
    assert.deepEqual(await exactJob(),before);assert.equal((await db.query('select scope from jobs where id=$1',[b.job])).rows[0].scope,'Operational scope B');return {foreign,move};
  });
  await check('WRITER-FOREIGN-PARENT','Writer cannot attach A job to foreign B client',async()=>{
    const before=await exactJob();const r=await rest('officeA',`jobs?id=eq.${a.job}&select=id,client_id`,{method:'PATCH',body:{client_id:b.client}});const after=await exactJob();
    await db.query('update jobs set client_id=$2 where id=$1 and test_marker=$3',[a.job,before.client_id,m.marker]);
    assert.equal(after.client_id,before.client_id,'Foreign client_id was stored; restored fixture immediately');assert.equal(r.data.code,'23503');return r;
  });
  await check('VIEW-WRITE-GUARDS','View rejects quote mass assignment and foreign parents while retaining original data',async()=>{
    const before=await exactJob();
    const money=await rest('officeA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{scope:'forbidden mixed update',quoted_amount:12345.67}});
    assert.equal(money.status,403);assert.equal(money.data.message,'job_quote_write_required');assert.deepEqual(await exactJob(),before);
    const parent=await rest('officeA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{client_id:b.client}});
    assert.equal(parent.data.code,'23503');assert.deepEqual(await exactJob(),before);return {money,parent};
  });
  await check('JOB-CREATE-GUARDS','Operational create works with defaults; raw/view priced and foreign-parent creates fail',async()=>{
    const id=randomUUID();const base={id,account_id:a.id,client_id:a.client,ref:`CREATE-${id.slice(0,8)}`,client_name:a.clientName,scope:'Disposable API create',test_marker:m.marker};
    try{
      const allowed=await rest('officeA','job_access',{method:'POST',body:base});
      assert.equal(allowed.status,201);assert.equal(allowed.data[0]?.id,id);assert.equal(allowed.data[0]?.quoted_amount,0);
      await db.query('delete from jobs where id=$1 and test_marker=$2',[id,m.marker]);
      const denied=[];
      for(const surface of ['jobs?select=id','job_access'])for(const change of [{quoted_amount:10},{client_id:b.client}]){
        const r=await rest('officeA',surface,{method:'POST',body:{...base,...change}});
        assert.equal(r.data.code,'quoted_amount' in change?'42501':'23503');
        assert.equal((await db.query('select count(*)::int as n from jobs where id=$1',[id])).rows[0].n,0);denied.push(r);
      }
      return {allowed,denied};
    }finally{await db.query('delete from jobs where id=$1 and test_marker=$2',[id,m.marker]);}
  });
  await check('OWNER-QUOTE-SAVE','Owner saves and reads actual quote values through the application view',async()=>{
    const before=await exactJob();
    try{
      const r=await rest('ownerA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{quoted_amount:before.quoted_amount*1+1}});
      assert.equal(r.status,200);assert.equal(r.data[0]?.quoted_amount,a.amount+1);assert.equal(Number((await exactJob()).quoted_amount),a.amount+1);return r;
    }finally{await db.query('update jobs set quoted_amount=$2 where id=$1 and test_marker=$3',[a.job,before.quoted_amount,m.marker]);}
  });
  await check('JOB-UPSERT-GUARDS','Raw upsert cannot change a protected quote or attach a foreign parent',async()=>{
    const before=await exactJob();const results=[];
    for(const change of [{quoted_amount:12},{client_id:b.client}]){
      const r=await rest('officeA','jobs?on_conflict=id&select=id',{method:'POST',body:{id:a.job,account_id:a.id,ref:a.ref,client_name:a.clientName,...change},
        headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
      assert.equal(r.data.code,'quoted_amount' in change?'42501':'23503');assert.deepEqual(await exactJob(),before);results.push(r);
    }
    return results;
  });
  await check('JOB-DELETE-FINANCE','Operational writer cannot delete and recreate a priced job',async()=>{
    const before=await exactJob();const rows=[];
    for (const table of ['jobs','job_access']) {
      const r=await rest('officeA',`${table}?id=eq.${a.job}&select=id`,{method:'DELETE'});
      assert.equal(r.status,403);assert.equal(r.data.code,'42501');assert.deepEqual(await exactJob(),before);rows.push(r);
    }
    return rows;
  });
  await grant(['clients.read','jobs.read']);
  await check('DUAL-SETUP','Fixture actor acquires legitimate B ownership for workspace switch test',async()=>{
    await db.query("insert into memberships(account_id,user_id,role) values($1,$2,'owner') on conflict(account_id,user_id) do nothing",[b.id,m.actors.officeA.id]);
    return {ownerIn:b.id,officeIn:a.id};
  });
  await check('DUAL-SWITCH','Real workspace form switches B owner to A office to B owner',async()=>{
    const p=sessions.officeA.page,rows=[];
    for(const [account,role] of [[b,'Owner'],[a,'Office'],[b,'Owner']]){
      await p.goto(origin+'/workspaces',{waitUntil:'domcontentloaded'});
      await p.getByRole('button',{name:`${account.name} — ${role}`,exact:true}).click();
      await p.waitForURL(url => url.pathname !== '/workspaces');
      const own=await api('officeA',`/api/clients/${account.client}/detail`);assert.equal(own.status,200);assert.equal(own.data.id,account.client);
      if(account===a)noMoney(own.data);else assert.equal(own.data.totals.quoted,b.amount);
      const other=await api('officeA',`/api/clients/${account===a?b.client:a.client}/detail`);assert.equal(other.status,404);
      rows.push({workspace:account.id,role,client:own.data.id,otherStatus:other.status});
    }
    await p.screenshot({path:resolve(privateDir,'workspace-owner-b.png'),animations:'disabled'});return rows;
  });
  await check('DUAL-NO-ESCALATION','B ownership does not grant write authority in A',async()=>{
    const before=await exactJob();const r=await rest('officeA',`job_access?id=eq.${a.job}`,{method:'PATCH',body:{scope:'foreign owner escalation'}});assert.equal(r.status,200);assert.deepEqual(r.data,[]);assert.deepEqual(await exactJob(),before);return r;
  });
  // Restore office A as selected workspace before revocation, without replacing the session.
  await sessions.officeA.context.addCookies([{name:'lgq_workspace',value:`${m.actors.officeA.id}:${a.id}`,url:origin}]);
  await check('REVOCATION-POSITIVE','Existing session still reads A before revocation',async()=>{const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,200);return {status:r.status,id:r.data.id};});
  await grant([]);
  await check('GRANT-REVOCATION','Same session/token loses API, Data API and browser access after grant removal',async()=>{
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert.equal(r.status,403);
    const data=noRows(await rest('officeA',`clients?id=eq.${a.client}&select=id`));
    const view=await page('officeA',`/dashboard/clients/${a.client}`,'office-grants-revoked.png');assert(!view.body.includes(a.clientName));return {api:r,data,page:{path:view.path,status:view.status}};
  });
  await grant(['clients.read','jobs.read']);
  await check('MEMBERSHIP-DEACTIVATION','Existing session loses A after membership deactivation',async()=>{
    await db.query('update memberships set deactivated_at=now() where account_id=$1 and user_id=$2',[a.id,m.actors.officeA.id]);
    const r=await api('officeA',`/api/clients/${a.client}/detail`);assert([403,404].includes(r.status));
    noRows(await rest('officeA',`jobs?id=eq.${a.job}&select=id`));
    const view=await page('officeA',`/dashboard/clients/${a.client}`);assert(!view.body.includes(a.clientName));
    return {api:r.status,page:{path:view.path,status:view.status}};
  });
  await check('MEMBERSHIP-REMOVAL','Owner removal RPC revokes office membership with old token retained',async()=>{
    await db.query('update memberships set deactivated_at=null where account_id=$1 and user_id=$2',[a.id,m.actors.officeA.id]);
    const before=await rest('officeA',`clients?id=eq.${a.client}&select=id`);assert.equal(before.data[0]?.id,a.client);
    const removed=await rest('ownerA','rpc/remove_office_user',{method:'POST',body:{p_account_id:a.id,p_user_id:m.actors.officeA.id}});assert.equal(removed.status,200);assert.equal(removed.data,true);
    noRows(await rest('officeA',`clients?id=eq.${a.client}&select=id`));const r=await api('officeA',`/api/clients/${a.client}/detail`);assert([403,404].includes(r.status));return {removed,api:r.status};
  });
  await check('ANONYMOUS-API','Unauthenticated caller gets JSON 401 from private Focus API',async()=>{
    const context=await browser.newContext();const r=await context.request.get(origin+`/api/clients/${a.client}/detail`,{maxRedirects:0});const data=await r.text();await context.close();assert.equal(r.status(),401);assert(r.headers()['content-type'].includes('application/json'));return {status:r.status(),body:data};
  });
}catch(e){evidence.fatal=String(e.message).slice(0,1500);console.error(evidence.fatal);process.exitCode=1;}
finally{
  await browser?.close();
  try {evidence.after=await snapshot(m);}catch(e){evidence.reconciliationError=e.message;process.exitCode=1;}
  if(options['--keep-fixtures']!=='1') {
    try {evidence.cleanup=await cleanup(m);evidence.afterCleanup=await snapshot(m);}
    catch(e){evidence.cleanupError=e.message;process.exitCode=1;}
  }
  evidence.finishedAt=new Date().toISOString();evidence.summary={total:evidence.cases.length,passed:evidence.cases.filter(x=>x.status==='PASS').length,failed:evidence.cases.filter(x=>x.status==='FAIL').length};
  save();console.log(JSON.stringify(evidence.summary));await db.end();
  if(evidence.summary.failed)process.exitCode=1;
}
