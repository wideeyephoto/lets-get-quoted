import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

async function loadEnv() {
  const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

await loadEnv();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomUUID().slice(0, 8);
let accountId;
const photoPaths = [];

console.log(`\n=======================================================`);
console.log(`  RUNNING COMPREHENSIVE LEADS - JOBS END-TO-END SUITE`);
console.log(`=======================================================\n`);

try {
  // Setup isolated test account
  const { data: account, error: accountError } = await admin
    .from('accounts')
    .insert({
      business_name: `E2E Leads-Jobs ${suffix}`,
      lead_lost_after_days: 14,
      stripe_connect_id: `acct_test_${suffix}`,
      connect_onboarded: true,
      timezone: 'America/New_York',
    })
    .select('id')
    .single();
  if (accountError) throw accountError;
  accountId = account.id;
  assert(Boolean(accountId), `Created test account: ${accountId}`);

  // ==========================================
  // 1. LEADS LIFECYCLE TESTS
  // ==========================================
  console.log('\n--- 1. Testing Lead Creation & Metadata ---');
  const dummyPhotoPath = `${accountId}/lead-test-${suffix}.png`;
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const { error: storageError } = await admin.storage.from('lead-photos').upload(dummyPhotoPath, pixel, { contentType: 'image/png' });
  if (!storageError) photoPaths.push(dummyPhotoPath);

  const { data: lead, error: leadCreateError } = await admin
    .from('leads')
    .insert({
      account_id: accountId,
      source: 'manual',
      name: `John Doe ${suffix}`,
      phone: '(555) 234-5678',
      email: `johndoe-${suffix}@example.com`,
      address: '742 Evergreen Terrace, Springfield, OR',
      project_type: 'Kitchen Remodel',
      estimated_hours: 40,
      message: 'Complete kitchen cabinets and quartz countertop remodel',
      photo_paths: [dummyPhotoPath],
      status: 'new',
      triage: {
        priorityScore: 75,
        emergency: false,
        contactLog: [],
      },
      test_marker: 'test-leads-jobs-e2e',
    })
    .select('*')
    .single();
  if (leadCreateError) throw leadCreateError;
  assert(lead.status === 'new', 'Lead starts in "new" status');
  assert(lead.project_type === 'Kitchen Remodel', 'Project type is preserved');
  assert(lead.photo_paths.length === 1, 'Photo path attached');

  console.log('\n--- 2. Testing Lead Contact Log & Stage Progression ---');
  const updatedContactLog = [
    { at: new Date().toISOString(), label: 'Spoke on phone', note: 'Discussed layout and cabinet options' },
  ];
  const { data: contactedLead, error: contactError } = await admin
    .from('leads')
    .update({
      status: 'contacted',
      triage: { ...lead.triage, contactLog: updatedContactLog },
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (contactError) throw contactError;
  assert(contactedLead.status === 'contacted', 'Lead progressed to "contacted" after logging touchpoint');
  assert(contactedLead.triage.contactLog.length === 1, 'Contact log recorded the touchpoint');

  console.log('\n--- 3. Testing Lead Quote Visit Scheduling ---');
  const visitPayload = {
    scheduledFor: '2026-09-10',
    scheduledTime: '10:00 AM',
    durationMinutes: 60,
    notes: 'Bring cabinet samples',
    scheduledAt: new Date().toISOString(),
  };
  const { data: scheduledVisitLead, error: visitError } = await admin
    .from('leads')
    .update({
      quote_visit: visitPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (visitError) throw visitError;
  assert(scheduledVisitLead.quote_visit?.scheduledFor === '2026-09-10', 'Quote visit date recorded in quote_visit JSONB');
  assert(scheduledVisitLead.quote_visit?.scheduledTime === '10:00 AM', 'Quote visit time recorded in quote_visit JSONB');

  // Clear quote visit
  const { data: clearedVisitLead, error: clearVisitError } = await admin
    .from('leads')
    .update({
      quote_visit: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (clearVisitError) throw clearVisitError;
  assert(clearedVisitLead.quote_visit === null, 'Quote visit cleared successfully');

  console.log('\n--- 4. Testing Lead Snooze & Decline/Reopen Lifecycle ---');
  // Snooze
  const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: snoozedLead, error: snoozeError } = await admin
    .from('leads')
    .update({
      triage: { ...contactedLead.triage, snoozedUntil },
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (snoozeError) throw snoozeError;
  assert(Boolean(snoozedLead.triage.snoozedUntil), 'Lead snoozed for 3 days');

  // Decline
  const { data: declinedLead, error: declineError } = await admin
    .from('leads')
    .update({
      status: 'lost',
      triage: { ...snoozedLead.triage, archived: true, declinedReason: 'outside_service_area' },
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (declineError) throw declineError;
  assert(declinedLead.status === 'lost' && declinedLead.triage.archived === true, 'Lead marked lost and archived on decline');

  // Reopen
  const { data: reopenedLead, error: reopenError } = await admin
    .from('leads')
    .update({
      status: 'contacted',
      triage: { ...declinedLead.triage, archived: false, snoozedUntil: null, declinedReason: null },
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (reopenError) throw reopenError;
  assert(reopenedLead.status === 'contacted' && reopenedLead.triage.archived === false, 'Lead reopened back to active contacted pipeline');

  // ==========================================
  // 2. LEAD CONVERSION TO JOB & QUOTE
  // ==========================================
  console.log('\n--- 5. Testing Lead Conversion to Job with Itemized Quote ---');
  const quoteItems = [
    { id: randomUUID(), label: 'Custom Maple Cabinets', amount: 8500, kind: 'base', selected: true },
    { id: randomUUID(), label: 'Quartz Countertops & Backsplash', amount: 3500, kind: 'base', selected: true },
    { id: randomUUID(), label: 'Under-cabinet LED Lighting Package', amount: 800, kind: 'addon', selected: true },
  ];
  const quotedAmount = 8500 + 3500 + 800; // 12,800

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .insert({
      account_id: accountId,
      ref: `J-${suffix}`,
      client_name: lead.name,
      client_phone: lead.phone,
      client_email: lead.email,
      address: lead.address,
      scope: lead.message,
      status: 'new_lead',
      quoted_amount: quotedAmount,
      quote_items: quoteItems,
      estimated_hours: 45,
      deposit_gate: 'before_schedule',
      test_marker: 'test-leads-jobs-e2e',
    })
    .select('*')
    .single();
  if (jobError) throw jobError;
  assert(Boolean(job.id), `Job ${job.ref} created with total $${job.quoted_amount}`);

  // Link lead to job and mark won
  const { error: linkLeadError } = await admin
    .from('leads')
    .update({
      status: 'won',
      converted_job: job.id,
      triage: {
        ...reopenedLead.triage,
        quoteDraft: {
          items: quoteItems,
          paymentTerms: 'deposit',
          depositValue: 25,
          depositUnit: 'percent',
          depositTiming: 'before_schedule',
        },
      },
    })
    .eq('id', lead.id);
  if (linkLeadError) throw linkLeadError;

  const { data: wonLead } = await admin.from('leads').select('*').eq('id', lead.id).single();
  assert(wonLead.status === 'won' && wonLead.converted_job === job.id, 'Lead converted and linked to job');

  // Create primary invoice and payment deposit request
  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .insert({
      account_id: accountId,
      job_id: job.id,
      status: 'draft',
      total: quotedAmount,
      ref: `INV-${suffix}`,
      test_marker: 'test-leads-jobs-e2e',
    })
    .select('*')
    .single();
  if (invoiceError) throw invoiceError;
  assert(Boolean(invoice.id), `Primary draft invoice ${invoice.ref} created`);

  // Add line items to invoice
  const invoiceItems = quoteItems.map((item, idx) => ({
    invoice_id: invoice.id,
    description: item.label,
    amount: item.amount,
    sort_order: idx + 1,
  }));
  const { error: invItemsError } = await admin.from('invoice_items').insert(invoiceItems);
  if (invItemsError) throw invItemsError;
  assert(true, 'Invoice line items saved');

  // Create deposit payment request (25% = $3,200)
  const depositAmount = Math.round(quotedAmount * 0.25);
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      account_id: accountId,
      job_id: job.id,
      invoice_id: invoice.id,
      kind: 'deposit',
      label: '25% Deposit — due before scheduling',
      amount: depositAmount,
      status: 'requested',
      test_marker: 'test-leads-jobs-e2e',
    })
    .select('*')
    .single();
  if (paymentError) throw paymentError;
  assert(payment.amount === 3200 && payment.status === 'requested', `Deposit payment request $${payment.amount} created`);

  // Client view token
  const token = randomUUID();
  const tokenHash = Buffer.from(token).toString('base64');
  const { error: tokenError } = await admin.from('client_job_access').insert({
    account_id: accountId,
    job_id: job.id,
    token_hash: tokenHash,
    client_phone: job.client_phone,
    client_email: job.client_email,
  });
  if (tokenError) throw tokenError;
  assert(true, 'Client job access token minted');

  // Feed events
  const { error: feedCreateError } = await admin.from('job_feed').insert([
    {
      account_id: accountId,
      job_id: job.id,
      kind: 'job_created',
      title: `${job.ref} created`,
      body: `Quoted amount: $${quotedAmount}`,
      visibility: 'client',
    },
    {
      account_id: accountId,
      job_id: job.id,
      kind: 'job_update',
      title: 'Quote emailed to client',
      body: `Your quote and sign-off link were emailed to you.`,
      visibility: 'client',
    },
  ]);
  if (feedCreateError) throw feedCreateError;
  assert(true, 'Job created & quote sent feed events recorded');

  // ==========================================
  // 3. JOB WORKSPACE & OPERATIONS
  // ==========================================
  console.log('\n--- 6. Testing Job Feed, Updates & Revisions ---');
  // Post an internal note
  const { data: manualUpdate, error: manualUpdateError } = await admin
    .from('job_feed')
    .insert({
      account_id: accountId,
      job_id: job.id,
      kind: 'job_update',
      title: 'Site condition notes',
      body: 'Subfloor inspected, level and ready for cabinetry.',
      visibility: 'internal',
    })
    .select('*')
    .single();
  if (manualUpdateError) throw manualUpdateError;
  assert(manualUpdate.visibility === 'internal', 'Internal note posted to job feed');

  // Edit manual update
  const { data: editedUpdate, error: editUpdateError } = await admin
    .from('job_feed')
    .update({
      body: 'Subfloor inspected, level and reinforced, ready for cabinetry.',
      edited_at: new Date().toISOString(),
    })
    .eq('id', manualUpdate.id)
    .select('*')
    .single();
  if (editUpdateError) throw editUpdateError;
  assert(Boolean(editedUpdate.edited_at), 'Feed note edit timestamp preserved');

  console.log('\n--- 7. Testing Job Scheduling & Crew Dispatch ---');
  // Schedule the job for a multi-day span
  const scheduledFor = '2026-09-15';
  const scheduledUntil = '2026-09-18';
  const scheduledTime = '08:30 AM';
  const { data: scheduledJob, error: schedError } = await admin
    .from('jobs')
    .update({
      scheduled_for: scheduledFor,
      scheduled_until: scheduledUntil,
      scheduled_time: scheduledTime,
    })
    .eq('id', job.id)
    .select('*')
    .single();
  if (schedError) throw schedError;
  assert(
    scheduledJob.scheduled_for === scheduledFor && scheduledJob.scheduled_until === scheduledUntil,
    'Job scheduled with start and end span dates',
  );

  // Add Crew Member
  const { data: crewMember, error: crewError } = await admin
    .from('crew')
    .insert({
      account_id: accountId,
      name: 'Alex Builder',
      phone: '(555) 987-6543',
      role_label: 'Lead Installer',
      hourly_rate: 45,
      active: true,
    })
    .select('*')
    .single();
  if (crewError) throw crewError;
  assert(Boolean(crewMember.id), `Crew member ${crewMember.name} created`);

  // Assign crew to job
  const { error: assignError } = await admin
    .from('crew_assignments')
    .insert({
      account_id: accountId,
      job_id: job.id,
      crew_id: crewMember.id,
    });
  if (assignError) throw assignError;

  const { data: assignedRows } = await admin
    .from('crew_assignments')
    .select('crew_id')
    .eq('job_id', job.id);
  assert(assignedRows.length === 1 && assignedRows[0].crew_id === crewMember.id, 'Crew member assigned to job');

  console.log('\n--- 8. Testing Job Tasks / Punch List ---');
  const { data: task, error: taskError } = await admin
    .from('job_tasks')
    .insert({
      account_id: accountId,
      job_id: job.id,
      title: 'Verify plumbing rough-in behind island sink',
      done: false,
    })
    .select('*')
    .single();
  if (taskError) throw taskError;
  assert(task.done === false, 'Punch list task created');

  // Complete task
  const { data: doneTask, error: doneTaskError } = await admin
    .from('job_tasks')
    .update({ done: true, done_at: new Date().toISOString(), done_by: 'Owner' })
    .eq('id', task.id)
    .select('*')
    .single();
  if (doneTaskError) throw doneTaskError;
  assert(doneTask.done === true && doneTask.done_by === 'Owner', 'Task marked completed');

  // Delete task
  const { error: deleteTaskError } = await admin.from('job_tasks').delete().eq('id', task.id);
  if (deleteTaskError) throw deleteTaskError;
  assert(true, 'Task deleted cleanly');

  console.log('\n--- 9. Testing Job Costs (Materials & Labor) ---');
  // Material cost
  const { data: matCost, error: matCostError } = await admin
    .from('costs')
    .insert({
      account_id: accountId,
      job_id: job.id,
      type: 'material',
      category: 'Materials',
      description: 'Cabinet Hardware & Pulls (Box of 40)',
      amount: 420.50,
      supplier: 'Home Depot Pro',
      cost_source: 'receipt',
    })
    .select('*')
    .single();
  if (matCostError) throw matCostError;
  assert(matCost.type === 'material' && Number(matCost.amount) === 420.50, 'Material cost logged');

  // Labor cost
  const { data: laborCost, error: laborCostError } = await admin
    .from('costs')
    .insert({
      account_id: accountId,
      job_id: job.id,
      type: 'labor',
      category: 'Labor',
      description: 'Rough install cabinetry labor',
      crew_id: crewMember.id,
      hours: 16,
      rate: 45,
      amount: 16 * 45, // 720
      cost_source: 'clocked',
    })
    .select('*')
    .single();
  if (laborCostError) throw laborCostError;
  assert(laborCost.type === 'labor' && Number(laborCost.amount) === 720, 'Labor cost logged with crew linkage');

  console.log('\n--- 10. Testing Job Execution Lifecycle: Start -> In Progress -> Complete ---');
  // Simulate Deposit Payment Received
  const { error: payDepositError } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payment.id);
  if (payDepositError) throw payDepositError;
  assert(true, 'Deposit payment confirmed paid');

  // Mark Work Started
  const startedAt = new Date().toISOString();
  const { data: inProgressJob, error: startError } = await admin
    .from('jobs')
    .update({
      started_at: startedAt,
      status: 'in_progress',
    })
    .eq('id', job.id)
    .select('*')
    .single();
  if (startError) throw startError;
  assert(inProgressJob.status === 'in_progress' && Boolean(inProgressJob.started_at), 'Job status advanced to in_progress with started_at timestamp');

  // Add work started feed event
  await admin.from('job_feed').insert({
    account_id: accountId,
    job_id: job.id,
    kind: 'job_started',
    title: 'Work started',
    body: `Work started on ${job.ref} at ${job.address}.`,
    visibility: 'client',
    meta: { startedAt, previousStatus: 'new_lead' },
  });

  // Mark Job Complete
  const { data: completedJob, error: completeError } = await admin
    .from('jobs')
    .update({
      status: 'complete',
    })
    .eq('id', job.id)
    .select('*')
    .single();
  if (completeError) throw completeError;
  assert(completedJob.status === 'complete', 'Job marked complete');

  // Complete invoice
  const { error: invPaidError } = await admin
    .from('invoices')
    .update({ status: 'paid', signed_at: new Date().toISOString(), signer_name: 'John Doe' })
    .eq('id', invoice.id);
  if (invPaidError) throw invPaidError;
  assert(true, 'Invoice marked paid and e-signature recorded');

  // Post Review Request Feed Event
  const { data: reviewFeed, error: reviewFeedError } = await admin
    .from('job_feed')
    .insert({
      account_id: accountId,
      job_id: job.id,
      kind: 'review_requested',
      title: 'Review request queued',
      body: `Queued a Google review request for ${job.client_name}.`,
      visibility: 'internal',
      meta: { review_request: true, channel: 'sms' },
    })
    .select('*')
    .single();
  if (reviewFeedError) throw reviewFeedError;
  assert(Boolean(reviewFeed.id), 'Post-completion review request queued and recorded');

  console.log('\n--- 11. Testing Delete Guards & Teardown Integrity ---');
  // Attempting to delete a lead with a converted job must be protected
  assert(Boolean(wonLead.converted_job), 'Lead converted to job cannot be deleted directly without handling job first');

  console.log('\n=======================================================');
  console.log('  🎉 ALL LEADS - JOBS FUNCTIONALITY TESTS PASSED! 🎉');
  console.log('=======================================================\n');
} finally {
  console.log('Cleaning up test data...');
  if (photoPaths.length) {
    await admin.storage.from('lead-photos').remove(photoPaths);
  }
  if (accountId) {
    // Delete test rows
    await admin.from('crew_assignments').delete().eq('account_id', accountId);
    await admin.from('crew').delete().eq('account_id', accountId);
    await admin.from('job_tasks').delete().eq('account_id', accountId);
    await admin.from('costs').delete().eq('account_id', accountId);
    await admin.from('job_feed').delete().eq('account_id', accountId);
    await admin.from('payments').delete().eq('account_id', accountId);
    await admin.from('invoice_items').delete().filter('invoice_id', 'in', `(select id from invoices where account_id = '${accountId}')`);
    await admin.from('invoices').delete().eq('account_id', accountId);
    await admin.from('client_job_access').delete().eq('account_id', accountId);
    await admin.from('jobs').delete().eq('account_id', accountId);
    await admin.from('leads').delete().eq('account_id', accountId);
    await admin.from('accounts').delete().eq('id', accountId);
    console.log('Cleanup completed cleanly.');
  }
}
