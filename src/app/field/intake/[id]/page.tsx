import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import IntakeApprovalWorkspace, { type CaughtIntakeItem } from './IntakeApprovalWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review & Approve Field Dictation | Let’s Get Quoted',
  description: 'Review and approve all inputs caught from your voice dictation or text message.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FieldIntakeReviewPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const admin = createAdminClient();

  // Load task and receipt details
  const { data: task } = await admin
    .from('sms_inbound_action_tasks')
    .select('id, account_id, outcome, task_state, created_at, webhook_receipt_id')
    .eq('id', id)
    .maybeSingle();

  let rawTranscript = '';
  let businessName = "Let's Get Quoted";

  if (task?.webhook_receipt_id) {
    const { data: receipt } = await admin
      .from('sms_webhook_receipts')
      .select('message_body, from_number')
      .eq('id', task.webhook_receipt_id)
      .maybeSingle();

    if (receipt?.message_body) {
      rawTranscript = receipt.message_body;
    }
  }

  if (task?.account_id) {
    const { data: account } = await admin
      .from('accounts')
      .select('business_name')
      .eq('id', task.account_id)
      .maybeSingle();

    if (account?.business_name && account.business_name !== 'My Business') {
      businessName = account.business_name;
    }
  }

  const outcome = (task?.outcome || {}) as Record<string, unknown>;
  const actionKind = String(outcome.action_kind ?? 'field_intake');
  const targetId = outcome.target_id ? String(outcome.target_id) : null;

  // Build items summary from outcome / receipt
  const caughtItems: CaughtIntakeItem[] = [];

  if (actionKind === 'append_internal_note' || (!actionKind && rawTranscript)) {
    caughtItems.push({
      id: 'item-1',
      type: 'note',
      title: 'Internal Job Note',
      subtitle: rawTranscript ? `"${rawTranscript}"` : 'Site progress note',
      status: 'approved',
    });
  } else if (actionKind === 'log_cost') {
    caughtItems.push({
      id: 'item-1',
      type: 'cost',
      title: 'Material / Expense Cost',
      subtitle: String(outcome.reply_body ?? 'Expense logged against job'),
      status: 'approved',
    });
  } else if (actionKind === 'add_job_task') {
    caughtItems.push({
      id: 'item-1',
      type: 'task',
      title: 'Punch List / Checklist Task',
      subtitle: rawTranscript || 'Checklist task added to crew queue',
      status: 'approved',
    });
  } else if (actionKind === 'create_lead') {
    caughtItems.push({
      id: 'item-1',
      type: 'lead',
      title: 'New Lead / Prospect Intake',
      subtitle: rawTranscript || 'Client contact details logged to pipeline',
      status: 'approved',
    });
  } else {
    caughtItems.push({
      id: 'item-1',
      type: 'note',
      title: 'Dictated Field Update',
      subtitle: rawTranscript || 'Field input captured and applied',
      status: 'approved',
    });
  }

  const createdAtFormatted = task?.created_at
    ? new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · Today'
    : 'Just now';

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '1rem' }}>
      <IntakeApprovalWorkspace
        intakeId={id}
        rawTranscript={rawTranscript}
        createdAt={createdAtFormatted}
        senderRole="Contractor / Truck Dictation"
        businessName={businessName}
        targetJobRef={null}
        targetJobId={targetId}
        initialItems={caughtItems}
      />
    </main>
  );
}
