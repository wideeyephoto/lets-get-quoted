import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import IntakeApprovalWorkspace, { type CaughtIntakeItem } from './IntakeApprovalWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Field Intake Result | Let’s Get Quoted',
  description: 'View the result of a voice dictation or field text that was processed for your business.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

type ReviewRole = 'owner' | 'crew';

type ReviewAccess = {
  role: ReviewRole;
  businessName: string;
};

const JOB_TARGET_INTENTS = new Set([
  'append_internal_note',
  'log_cost',
  'add_job_task',
  'complete_job_task',
  'reschedule_job',
  'assign_crew',
  'add_quote_line_item',
  'send_client_quote_link',
]);

const APPLIED_INTENTS = new Set([
  'append_internal_note',
  'log_cost',
  'add_job_task',
  'complete_job_task',
  'create_lead',
]);

/**
 * Authorize the signed-in person against the task's exact account.
 *
 * This deliberately does not use either dashboard guard: a person may own one
 * business and work on another crew, while this link must resolve against the
 * account recorded on the intake task rather than whichever role a generic
 * guard happens to prefer. Service-role reads stay server-only, and every
 * database error fails closed.
 */
async function reviewAccessForTask(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  accountId: string,
  outcomeCrewId: string | null,
): Promise<ReviewAccess | null> {
  const crewLookup = outcomeCrewId
    ? admin
        .from('crew')
        .select('id')
        .eq('id', outcomeCrewId)
        .eq('user_id', userId)
        .eq('account_id', accountId)
        .eq('active', true)
        .is('deleted_at', null)
        .is('access_revoked_at', null)
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [accountResult, ownerResult, crewResult] = await Promise.all([
    admin
      .from('accounts')
      .select('business_name')
      .eq('id', accountId)
      .is('suspended_at', null)
      .limit(1)
      .maybeSingle(),
    admin
      .from('memberships')
      .select('account_id')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('role', 'owner')
      .is('deactivated_at', null)
      .limit(1)
      .maybeSingle(),
    crewLookup,
  ]);

  if (accountResult.error || !accountResult.data) return null;
  if (ownerResult.error) return null;
  const businessName = accountResult.data.business_name
    && accountResult.data.business_name !== 'My Business'
    ? accountResult.data.business_name
    : "Let's Get Quoted";
  if (ownerResult.data) return { role: 'owner', businessName };
  if (crewResult.error || !crewResult.data) return null;
  return { role: 'crew', businessName };
}

function resultStatus(
  taskState: string,
  intent: string,
  unsupported: boolean,
): CaughtIntakeItem['status'] {
  if (taskState !== 'completed') {
    return taskState === 'pending' || taskState === 'processing' ? 'pending' : 'not_applied';
  }
  if (unsupported || !APPLIED_INTENTS.has(intent)) return 'not_applied';
  return 'applied';
}

function itemTitle(intent: string, unsupported: boolean): string {
  if (unsupported) return 'This field request is not supported yet';
  if (intent === 'append_internal_note') return 'Internal Job Note';
  if (intent === 'log_cost') return 'Material / Expense Cost';
  if (intent === 'add_job_task') return 'Punch List / Checklist Task';
  if (intent === 'complete_job_task') return 'Completed Job Task';
  if (intent === 'create_lead') return 'New Lead / Prospect Intake';
  if (intent === 'report_ambiguity') return 'More information is needed';
  if (intent === 'no_action') return 'No record change was needed';
  return 'Field Intake Result';
}

function itemType(intent: string): CaughtIntakeItem['type'] {
  if (intent === 'log_cost') return 'cost';
  if (intent === 'add_job_task' || intent === 'complete_job_task') return 'task';
  if (intent === 'create_lead') return 'lead';
  if (intent === 'reschedule_job') return 'schedule';
  if (intent === 'update_client') return 'client';
  if (intent === 'assign_crew') return 'crew';
  return 'note';
}

export default async function FieldIntakeReviewPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  // Authenticate with the cookie-scoped client before touching service-role
  // data. getUser() verifies the session with Supabase Auth; getSession() is not
  // sufficient for an authorization decision because it trusts cookie storage.
  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser();
  if (userError || !user) notFound();

  const admin = createAdminClient();
  const { data: task, error: taskError } = await admin
    .from('sms_inbound_action_tasks')
    .select('id, account_id, outcome, task_state, created_at, sms_message_id')
    .eq('id', id)
    .maybeSingle();

  if (taskError || !task?.account_id || !task.sms_message_id) notFound();

  const outcome = (task.outcome && typeof task.outcome === 'object' && !Array.isArray(task.outcome)
    ? task.outcome
    : {}) as Record<string, unknown>;
  const outcomeCrewId = typeof outcome.crew_id === 'string' && outcome.crew_id
    ? outcome.crew_id
    : null;
  const reviewAccess = await reviewAccessForTask(
    admin,
    user.id,
    task.account_id,
    outcomeCrewId,
  );
  if (!reviewAccess) notFound();

  const intent = typeof outcome.intent === 'string' && outcome.intent ? outcome.intent : 'field_intake';
  const unsupported = outcome.unsupported_intent === true;
  const targetId = typeof outcome.target_id === 'string' && outcome.target_id ? outcome.target_id : null;
  const candidateJobId = targetId && JOB_TARGET_INTENTS.has(intent) ? targetId : null;

  // The transcript belongs to the durable SMS message linked by the task. The
  // webhook receipt intentionally does not carry a message_body column.
  const messagePromise = admin
    .from('sms_messages')
    .select('body')
    .eq('id', task.sms_message_id)
    .eq('account_id', task.account_id)
    .maybeSingle();
  const jobPromise = candidateJobId
    ? admin
        .from('jobs')
        .select('id')
        .eq('id', candidateJobId)
        .eq('account_id', task.account_id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [messageResult, jobResult] = await Promise.all([
    messagePromise,
    jobPromise,
  ]);
  if (messageResult.error || !messageResult.data) notFound();

  const rawTranscript = typeof messageResult.data.body === 'string' ? messageResult.data.body : '';
  // Only a verified job row from this same account becomes a job link. A
  // create_lead outcome also has a target_id, but that UUID is a lead, not a job.
  const targetJobId = !jobResult.error && jobResult.data?.id === candidateJobId
    ? candidateJobId
    : null;
  const status = resultStatus(String(task.task_state ?? ''), intent, unsupported);

  const caughtItems: CaughtIntakeItem[] = [{
    id: 'item-1',
    type: itemType(intent),
    title: itemTitle(intent, unsupported),
    subtitle: rawTranscript || String(outcome.confirmation_text ?? 'Field input captured'),
    status,
  }];

  const createdAtFormatted = task.created_at
    ? new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · Today'
    : 'Just now';

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '1rem' }}>
      <IntakeApprovalWorkspace
        rawTranscript={rawTranscript}
        createdAt={createdAtFormatted}
        senderRole="Owner / Crew Field Intake"
        businessName={reviewAccess.businessName}
        targetJobId={targetJobId}
        backHref={reviewAccess.role === 'owner' ? '/dashboard/text-to-job' : '/field'}
        backLabel={reviewAccess.role === 'owner' ? 'Back to Text-to-Job' : 'Back to Field Dashboard'}
        initialItems={caughtItems}
      />
    </main>
  );
}
