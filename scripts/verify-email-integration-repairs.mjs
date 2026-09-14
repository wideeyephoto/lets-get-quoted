import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

export async function verifyEmailIntegrationRepairs(db,other,root,passed) {
 await db.query('reset role');await other.query('reset role');
 // Add the existing application columns absent from the earlier narrow fixtures.
 await db.query(`alter table jobs add column if not exists quote_signed_at timestamptz,add column if not exists quote_signer_name text,add column if not exists quote_signature_path text,add column if not exists quote_signature_method text,add column if not exists client_email text,add column if not exists document_email_revision uuid default gen_random_uuid();
 alter table accounts add column if not exists suspended_at timestamptz,add column if not exists test_marker text,add column if not exists deposit_on_approval boolean default false,add column if not exists deposit_percent numeric;
 create table if not exists leads(id uuid primary key default gen_random_uuid(),account_id uuid,converted_job uuid,status text);
 create table if not exists client_feed(id uuid primary key default gen_random_uuid(),account_id uuid,client_id uuid,kind text,title text,body text,meta jsonb);
 create table if not exists email_suppression(id uuid primary key default gen_random_uuid(),account_id uuid,email text,reason text);
 create table if not exists invoices(id uuid primary key default gen_random_uuid(),account_id uuid,job_id uuid,ref text,status text,total numeric default 0,created_at timestamptz default now(),discount_percent numeric default 0,tax_rate numeric default 0,document_email_revision uuid default gen_random_uuid());
 create table if not exists invoice_items(id uuid primary key default gen_random_uuid(),invoice_id uuid,description text,amount numeric,sort_order integer);
 alter table payments add column if not exists kind text,add column if not exists label text,add column if not exists invoice_id uuid,add column if not exists homeowner_phone text,add column if not exists sms_consent boolean,add column if not exists sms_consent_at timestamptz,add column if not exists created_at timestamptz default now();
 alter table warranties add column if not exists title text,add column if not exists service_interval_months integer,add column if not exists next_service_due date,add column if not exists service_reminded_at timestamptz;
 create table if not exists subcontractor_requests(id uuid primary key,account_id uuid);
 create table if not exists subcontractor_offers(id uuid primary key,account_id uuid,request_id uuid);
 grant select,insert,update,delete on leads,invoices,invoice_items,client_feed,subcontractor_requests,subcontractor_offers,email_suppression to service_role;
 alter table email_suppression enable row level security;
 alter table leads enable row level security;alter table invoices enable row level security;alter table invoice_items enable row level security;alter table client_feed enable row level security;alter table subcontractor_requests enable row level security;alter table subcontractor_offers enable row level security;`);
 const doc=readFileSync(join(root,'migrations/20260914135714_document_email_send_ledger.sql'),'utf8');
 await db.query(doc.slice(doc.indexOf('create table public.document_email_sends')));
 for(const f of readdirSync(join(root,'migrations')).filter(f=>/^2026091420[2354]|^20260914210/.test(f)).sort()) {
  const sql=readFileSync(join(root,'migrations',f),'utf8');assert.ok(readFileSync(join(root,'schema.sql'),'utf8').includes(sql.trim()));
  await db.query(sql);passed('repaired migration applies: '+f);
 }
 const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
 const job=(await db.query("insert into jobs(account_id,quoted_amount,status,client_email) values($1,200,'new_lead','audit@example.test') returning id",[account])).rows[0].id;
 const payload={to:'audit@example.test',from:'Example <quotes@tenant.example>',subject:'Test',html:'Test',reply_to:'owner@example.test',tags:[{name:'account_id',value:account},{name:'kind',value:'campaign'}]};
 const claim=(conn,key,kind='campaign',jobId=null,p=payload,scope='a'.repeat(64))=>conn.query('select claim_customer_email_send($1,$2,$3,$4,$5,$6) r',[account,kind,key,p,scope,jobId]);
 const concurrent=await Promise.all([claim(db,'one'),claim(other,'one')]);assert.deepEqual(concurrent.map(r=>r.rows[0].r.action).sort(),['busy','send']);
 const c=concurrent.find(r=>r.rows[0].r.action==='send').rows[0].r;
 await db.query("select finish_customer_email_send($1,$2,$3,null,'rate limited')",[c.id,account,c.token]);
 assert.equal((await claim(db,'one')).rows[0].r.action,'busy');
 await db.query("update customer_email_sends set first_attempt_at=now()-interval '2 days',next_retry_at=now()-interval '1 minute' where id=$1",[c.id]);
 assert.equal((await claim(db,'one')).rows[0].r.action,'review');
 passed('customer claims have one concurrent winner, respect backoff and retain outcomes beyond the retry window');
 assert.equal((await claim(db,'selection','selection_reminder',job)).rows[0].r.action,'send');
 assert.equal((await claim(db,'rebook','rebook_invite')).rows[0].r.action,'send');
 const f=(await claim(db,'fallback')).rows[0].r;
 assert.equal((await db.query("select fallback_customer_email_send($1,$2,$3,'validation_error','Subject invalid') r",[f.id,account,f.token])).rows[0].r,null);
 const fb=(await db.query("select fallback_customer_email_send($1,$2,$3,'validation_error','The tenant.example domain is not verified.') r",[f.id,account,f.token])).rows[0].r;
 assert.equal(fb.payload.from,'Example <hello@letsgetquoted.com>');assert.notEqual(fb.key,f.key);assert.equal(fb.payload.reply_to,payload.reply_to);
 await db.query("select finish_customer_email_send($1,$2,$3,null,'temporary failure')",[fb.id,account,fb.token]);
 await db.query("update customer_email_sends set next_retry_at=now()-interval '1 second' where id=$1",[fb.id]);
 const resumed=(await claim(db,'fallback')).rows[0].r;assert.equal(resumed.phase,'fallback');assert.equal(resumed.key,fb.key);
 passed('selection and jobless rebooking claims work; fallback is domain-specific, preserves Reply-To and survives retry');
 const args=[account,job,randomUUID(),'b'.repeat(64),{quote_items:[],quoted_amount:200},null,200,'Client',null,'typed','Quote approved','Accepted'];
 await db.query("insert into leads(account_id,converted_job,status) values($1,$2,'quoted')",[account,job]);
 const approve=conn=>conn.query('select save_client_quote_approval($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) r',args);
 await Promise.all([approve(db),approve(other)]);
 assert.equal((await db.query('select status from leads where converted_job=$1',[job])).rows[0].status,'won');
 assert.equal((await db.query("select count(*)::int n from job_feed where source_id=$1 and kind='quote_approved'",[job])).rows[0].n,1);
 args[2]=randomUUID();assert.equal((await approve(db)).rows[0].r.replayed,true);
 await db.query('update accounts set deposit_on_approval=true,deposit_percent=20 where id=$1',[account]);
 const deposit=conn=>conn.query('select ensure_quote_approval_deposit($1,$2,200,null,false) id',[account,job]);
 const deposits=await Promise.all([deposit(db),deposit(other)]);assert.equal(deposits[0].rows[0].id,deposits[1].rows[0].id);
 assert.equal((await db.query("select count(*)::int n from payments where job_id=$1 and kind='deposit'",[job])).rows[0].n,1);
 passed('approval replays retain one history event, mark the lead won and create only one automatic deposit');
 const w=(await db.query("insert into warranties(account_id,job_id,title,service_interval_months,next_service_due) values($1,$2,'Water heater',6,current_date) returning id",[account,job])).rows[0].id;
 const warranty=conn=>conn.query("select record_warranty_service_reminders($1,$2,'ignored','ignored') id",[account,[w]]);
 const notices=await Promise.all([warranty(db),warranty(other)]);assert.equal(notices.filter(r=>r.rows[0].id!==null).length,1);
 passed('concurrent warranty sweeps enqueue only warranties actually claimed');
 for(const kind of ['review_feedback','customer_plan_change']) {
  const id=(await db.query("insert into job_feed(account_id,job_id,kind,title,body,visibility,meta) values($1,$2,$3,'Notice','Body','internal','{\"owner_email_notice\":\"v1\"}') returning id",[account,job,kind])).rows[0].id;
  assert.equal((await db.query('select count(*)::int n from owner_event_notices where source_id=$1',[id])).rows[0].n,1);
 }
 passed('job feedback and plan changes retain their owner-notice triggers');
 const rev=(await db.query('select document_email_revision from jobs where id=$1',[job])).rows[0].document_email_revision;
  const original=(await db.query('select claim_document_email_send($1,$2,null,$3,null,$4,$5) r',[account,job,rev,{...payload,tags:[{name:'account_id',value:account},{name:'kind',value:'client_quote'}]},'a'.repeat(64)])).rows[0].r;
 assert.equal(original.action,'send');
 await db.query('select finish_document_email_send($1,$2,$3,$4,null)',[original.id,account,original.token,'provider-original']);
 const resendKey=randomUUID();
 const resend=conn=>conn.query('select submit_document_email_resend($1,$2,$3,$4,$5) r',[original.id,account,'operator@example.test',resendKey,'a'.repeat(64)]);
 const resends=await Promise.all([resend(db),resend(other)]);assert.deepEqual(resends.map(r=>r.rows[0].r.action).sort(),['busy','send']);
 const send=resends.find(r=>r.rows[0].r.action==='send').rows[0].r;assert.notEqual(send.key,original.key);
 assert.equal(send.payload.tags.find(t=>t.name==='document_send_id').value,send.id);
 await db.query('select finish_document_email_send($1,$2,$3,$4,null)',[send.id,account,send.token,'provider-resend']);
 assert.equal((await resend(db)).rows[0].r.action,'already_sent');
 passed('deliberate resends have one lease, independent callback identity and idempotent completion');
 const platform=(await db.query("insert into platform_event_notices(event_family,source_id,payload) values('auth_link',$1,'{}') returning id",[randomUUID()])).rows[0].id;
 const notice=(await db.query('select id,attempted_at::text from claim_platform_event_notices(5)')).rows.find(n=>n.id===platform);
 await db.query('select prepare_platform_event_notice($1,$2,$3)',[platform,notice.attempted_at,'owner@example.test']);
 const message={to:'owner@example.test',from:"Let's Get Quoted <hello@letsgetquoted.com>",reply_to:'hello@letsgetquoted.com',subject:'Sign in',html:'<p>Link</p>',
   tags:[{name:'kind',value:'auth_link'},{name:'delivery_scope',value:'platform_transactional'},{name:'platform_event_notice_id',value:platform}]};
 assert.equal((await db.query('select prepare_platform_event_notice_snapshot($1,$2,$3,$4,$5) ok',[platform,notice.attempted_at,message,'a'.repeat(64),'platform-event:v1:'+platform])).rows[0].ok,true);
 assert.equal((await db.query("select confirm_platform_event_notice($1,$2,$3,'delivered',now(),'callback-id') result",[platform,message.to,'platform-provider'])).rows[0].result,'confirmed');
 assert.equal((await db.query('select state from platform_event_notices where id=$1',[platform])).rows[0].state,'resolved');
 passed('platform messages bind their saved payload and reconcile delivery before the send response returns');
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query("select has_function_privilege($1,'submit_document_email_resend(uuid,uuid,text,text,text)','execute') ok",[role])).rows[0].ok,false);
  assert.equal((await db.query("select has_table_privilege($1,'customer_email_sends','insert') ok",[role])).rows[0].ok,false);
 }
 passed('new private send tables and resend operations remain unavailable to public roles');
}
