// Optional real-PostgreSQL regression harness; no production connections.
// Install @electric-sql/pglite separately or set VOICE_PGLITE_MODULE to its file URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.VOICE_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const account = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const job = '33333333-3333-4333-8333-333333333333';
const action = '44444444-4444-4444-8444-444444444444';
const phone = '+12485550101';
let passed = 0;
async function test(name, work) { await work(); passed++; console.log('PASS ' + name); }
const deny = (work) => assert.rejects(work, error => error.code === '42501');

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table jobs(id uuid primary key, account_id uuid, ref text, client_name text,
      client_phone text, address text, scope text, status text, scheduled_for date,
      scheduled_time time, quoted_amount numeric, created_at timestamptz default now(), deleted_at timestamptz);
    grant select on jobs to service_role;
    grant select, insert, update on jobs to authenticated;
    create table voice_call_admissions(account_id uuid, provider text, provider_call_id text,
      caller_number text, caller_kind text, admission_state text, provider_terminal_at timestamptz, admitted_at timestamptz);
    create table voice_events(provider text, provider_call_id text);
    create table voice_tool_actions(id uuid primary key, account_id uuid, provider text,
      provider_call_id text, caller_number text, function_name text, request_payload jsonb,
      target_job_id uuid, target_lead_id uuid, action_state text, outcome jsonb, created_at timestamptz default now());
    create function apply_voice_contractor_action_after_step_up(
      p_account_id uuid,p_call text,p_phone text,p_fn text,p_job uuid,p_lead uuid,p_payload jsonb)
    returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $stub$
    declare v_outcome jsonb;
    begin
      select outcome || '{"replayed":true}'::jsonb into v_outcome from public.voice_tool_actions where id='${action}';
      if found then return v_outcome; end if;
      update public.jobs set status=coalesce(p_payload->>'status',status),
        scheduled_for=coalesce((p_payload->>'scheduled_date')::date,scheduled_for),
        scheduled_time=coalesce((p_payload->>'scheduled_time')::time,scheduled_time)
        where id=p_job and account_id=p_account_id;
      v_outcome := jsonb_build_object('action_id','${action}','job_id',p_job,'replayed',false);
      insert into public.voice_tool_actions(id,account_id,provider,provider_call_id,caller_number,
        function_name,request_payload,target_job_id,target_lead_id,action_state,outcome)
      values('${action}',p_account_id,'signalwire',p_call,p_phone,p_fn,p_payload,p_job,p_lead,'applied',v_outcome);
      return v_outcome;
    end; $stub$;
  `);
  await db.exec(await readFile(new URL('../migrations/20260906105714_voice_dispatch_latency.sql', import.meta.url), 'utf8'));
  await db.query(`insert into jobs(id,account_id,ref,client_name,client_phone,address,scope,status)
    values($1,$2,'J-DEMO-1071','Rosa Holbrook',$3,'42 Maple Street','Replace water heater','in_progress')`, [job,account,phone]);
  await db.query(`insert into jobs(id,account_id,ref,client_name,client_phone,address,status)
    select gen_random_uuid(),$1,'LGQ-' || n,'Different Person ' || n,$2,n || ' Other Road','in_progress'
    from generate_series(1,4500) n`,[account,phone]);
  await db.query(`insert into jobs(id,account_id,ref,client_name,client_phone,address,status)
    values(gen_random_uuid(),$1,'LGQ-FOREIGN','Rosa Holbrook',$2,'Other tenant','in_progress')`,[other,phone]);
  const search = async (query, acct=account, phones=null) => (await db.query(
    'select search_voice_jobs($1,$2,$3) as result',[acct,query,phones])).rows[0].result;
  await test('exact reference finds an old job beyond 4,000 rows', async () => {
    const r = await search('job j demo 1071'); assert.equal(r.total_count,1); assert.equal(r.jobs[0].id,job);
  });
  await test('UUID and spoken numeric suffix resolve the same job', async () => {
    assert.equal((await search(job)).jobs[0].id,job);
    // LGQ-1071 is also present: numeric suffix must remain ambiguous.
    assert.equal((await search('1071')).total_count,2);
  });
  await test('missing UUID and missing name return zero', async () => {
    assert.equal((await search(action)).total_count,0); assert.equal((await search('Harry Lou')).total_count,0);
  });
  await test('cross-account matches are excluded', async () => assert.equal((await search('Rosa Holbrook')).total_count,1));
  await test('phone scoping applies to exact references and human matches', async () => {
    assert.equal((await search('J-DEMO-1071',account,['+12485550999'])).total_count,0);
    assert.equal((await search('Rosa Holbrook',account,[phone])).total_count,1);
    assert.equal((await search('Rosa Holbrook',account,[])).total_count,0);
  });
  await test('broad searches return six rows with an accurate total', async () => {
    const r=await search('Different Person'); assert.equal(r.jobs.length,6); assert.equal(r.total_count,4500);
  });
  await test('address containment tolerates speech additions', async () => assert.equal((await search('the 42 Maple Street job')).jobs[0].id,job));
  await db.query(`insert into jobs(id,account_id,ref,client_name,client_phone,address,status)
    values(gen_random_uuid(),$1,'SECOND','Rosa Holbrook',$2,'84 Oak Street','in_progress'),
      (gen_random_uuid(),$1,'ACCENT','José García',$2,'12 Pine Street','in_progress')`,[account,phone]);
  await test('duplicate names remain ambiguous despite thousands of intervening jobs', async () => assert.equal((await search('Rosa Holbrook')).total_count,2));
  await test('Unicode normalization matches accented and unaccented speech', async () => {
    assert.equal((await search('José García')).jobs[0].ref,'ACCENT');
    assert.equal((await search('Jose Garcia')).jobs[0].ref,'ACCENT');
  });
  await test('punctuation and SQL metacharacters cannot broaden a search', async () => {
    assert.equal((await search("'; DROP TABLE jobs; --")).total_count,0);
    assert.equal((await search('%')).total_count,0);
  });
  await db.exec(`update jobs set deleted_at=now() where ref='SECOND'; update jobs set status='complete' where ref='ACCENT'`);
  await test('deleted jobs never resolve; completed jobs are excluded only from the current list', async () => {
    assert.equal((await search('SECOND')).total_count,0); assert.equal((await search('ACCENT')).total_count,1);
    assert.equal((await search(null)).total_count,4501);
  });
  await test('index maintenance does not break signed-in job updates', async () => {
    await db.exec('set role authenticated');
    await db.query("update jobs set scope='Verified' where id=$1",[job]);
    await db.exec('reset role');
  });
  for (const role of ['anon','authenticated']) await test(role+' cannot execute search or private action status', async () => {
    await db.exec('set role '+role); await deny(()=>search('Rosa'));
    await deny(()=>db.query('select get_voice_contractor_action_status($1,$2,$3,$4,$5,null,$6)',[account,'call',phone,'update_job_details',job,{}]));
    await db.exec('reset role');
  });
  await db.query(`insert into voice_call_admissions values($1,'signalwire','call',$2,'owner','admitted',null,now())`,[account,phone]);
  const payload = {status:'complete', scheduled_date:'2026-09-08',scheduled_time:'09:30'};
  const status = async (overrides={}) => (await db.query('select get_voice_contractor_action_status($1,$2,$3,$4,$5,$6,$7) as result',[
    overrides.account ?? account, overrides.call ?? 'call', overrides.phone ?? phone,
    overrides.fn ?? 'update_job_details',overrides.job ?? job,overrides.lead ?? null,overrides.payload ?? payload])).rows[0].result;
  await test('missing action returns unknown, never a false failure', async () => assert.equal(await status(),null));
  let saved;
  await test('mutation and saved-value snapshot commit together', async () => {
    await db.exec('set role service_role');
    saved=(await db.query('select apply_voice_contractor_action($1,$2,$3,$4,$5,null,$6) as result',[account,'call',phone,'update_job_details',job,payload])).rows[0].result;
    assert.deepEqual(saved.saved,{status:'complete',scheduled_date:'2026-09-08',scheduled_time:'09:30:00'});
    assert.equal((await status()).action_id,action); await db.exec('reset role');
  });
  await test('status does not expose another account, phone, or call', async () => {
    for (const x of [{account:other},{phone:'+12485550999'},{call:'other'}]) await deny(()=>status(x));
  });
  await test('status requires exact original payload and targets', async () => {
    for (const x of [{job:other},{lead:other},{fn:'append_job_caution_or_note'},{payload:{status:'in_progress'}}]) assert.equal(await status(x),null);
  });
  await test('status compares JSONB structurally, independent of key order', async () => {
    assert.equal((await status({payload:{scheduled_time:'09:30',scheduled_date:'2026-09-08',status:'complete'}})).action_id,action);
  });
  await test('replay keeps the original snapshot after a later dashboard change', async () => {
    await db.query("update jobs set status='in_progress' where id=$1",[job]);
    const replay=(await db.query('select apply_voice_contractor_action($1,$2,$3,$4,$5,null,$6) as result',[account,'call',phone,'update_job_details',job,payload])).rows[0].result;
    assert.deepEqual(replay.saved,saved.saved); assert.equal(replay.replayed,true);
  });
  await test('created-lead status resolves its assigned ID from the original create request', async () => {
    await db.query("update voice_tool_actions set function_name='create_or_update_lead',target_job_id=null,target_lead_id=$1,request_payload=$2",[other,{operation:'create',name:'Jamie'}]);
    const r=(await db.query('select get_voice_contractor_action_status($1,$2,$3,$4,null,null,$5) as result',[account,'call',phone,'create_or_update_lead',{operation:'create',name:'Jamie'}])).rows[0].result;
    assert.equal(r.action_id,action);
  });
  await test('terminal receipts close status reads', async () => {
    await db.exec("insert into voice_events values('signalwire','call')"); await deny(()=>status());
  });
  await test('service role cannot read the private action table or bypass the wrapper', async () => {
    await db.exec('set role service_role'); await deny(()=>db.query('select * from voice_tool_actions'));
    await deny(()=>db.query('select apply_voice_contractor_action_after_step_up($1,$2,$3,$4,$5,null,$6)',[account,'call',phone,'update_job_details',job,payload]));
  });
  console.log(JSON.stringify({passed,engine:'PGlite PostgreSQL',productionRecordsTouched:false}));
} catch (error) {
  console.error('FAIL', { message: error.message, code: error.code, where: error.where });
  process.exitCode = 1;
} finally { await db.close(); }
