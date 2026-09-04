import { createAdminClient } from '@/lib/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SmsFieldLeadRecord = {
  leadId: string;
  leadName: string;
  phone: string | null;
  address: string | null;
  message: string | null;
  rawSmsText: string;
  senderPhone: string | null;
  status: string;
  createdAt: string;
};

/**
 * Loads leads created specifically through inbound field SMS or voice memos.
 *
 * Correlates completed `sms_inbound_action_tasks` with `outcome->>intent = 'create_lead'`
 * to the `leads` and `sms_messages` tables. This guarantees that website inquiries,
 * Google LSA leads, and office-typed leads remain in the general Leads pipeline and
 * never falsely appear as contractor field dictation.
 */
export async function loadSmsFieldLeads(accountId: string): Promise<SmsFieldLeadRecord[]> {
  try {
    const admin = createAdminClient();
    const { data: tasks, error: tasksError } = await admin
      .from('sms_inbound_action_tasks')
      .select('id, sms_message_id, outcome, created_at, sms_messages(body, phone_number)')
      .eq('account_id', accountId)
      .eq('task_state', 'completed')
      .filter('outcome->>intent', 'eq', 'create_lead')
      .order('created_at', { ascending: false })
      .limit(20);

    if (tasksError) {
      console.error('Text-to-Job field lead tasks unreadable:', tasksError);
      return [];
    }

    if (!tasks || tasks.length === 0) return [];

    const leadIds = tasks
      .map((t) => (t.outcome as { target_id?: string } | null)?.target_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (leadIds.length === 0) return [];

    const { data: leads, error: leadsError } = await admin
      .from('leads')
      .select('id, name, phone, address, message, status, created_at')
      .eq('account_id', accountId)
      .in('id', leadIds);

    if (leadsError) {
      console.error('Text-to-Job field leads unreadable:', leadsError);
      return [];
    }

    type RawLeadRow = {
      id: string;
      name: string | null;
      phone: string | null;
      address: string | null;
      message: string | null;
      status: string | null;
      created_at: string;
    };

    const leadMap = new Map<string, RawLeadRow>((leads || []).map((l) => [l.id, l as RawLeadRow]));

    return tasks.map((t) => {
      const targetId = (t.outcome as { target_id?: string } | null)?.target_id ?? '';
      const lead = leadMap.get(targetId);
      const rawMessage = t.sms_messages as unknown as { body?: string; phone_number?: string } | null;

      return {
        leadId: targetId,
        leadName: lead?.name || 'New Prospect',
        phone: lead?.phone || null,
        address: lead?.address || null,
        message: lead?.message || null,
        rawSmsText: rawMessage?.body || lead?.message || 'New prospect field intake',
        senderPhone: rawMessage?.phone_number || null,
        status: lead?.status || 'new',
        createdAt: lead?.created_at || t.created_at,
      };
    });
  } catch (err) {
    console.error('Unexpected error loading SMS field leads:', err);
    return [];
  }
}

export type TextToJobStatus = {
  count: number;
  newestCreatedAt: string | null;
};

/**
 * Counts field intake messages (voice memos, SMS updates, costs, tasks, and field leads)
 * and retrieves the timestamp of the newest arrival. Drives the Text-to-Job nav badge and "New" pill.
 */
export async function loadTextToJobStatus(
  admin: SupabaseClient,
  accountId: string,
): Promise<TextToJobStatus> {
  try {
    const [feedRes, leadTasksRes] = await Promise.all([
      admin
        .from('job_feed')
        .select('id, created_at', { count: 'exact' })
        .eq('account_id', accountId)
        .in('kind', ['field_voice_note', 'field_sms_update', 'cost_added', 'task_created'])
        .order('created_at', { ascending: false })
        .limit(1),
      admin
        .from('sms_inbound_action_tasks')
        .select('id, created_at', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('task_state', 'completed')
        .filter('outcome->>intent', 'eq', 'create_lead')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const count = (feedRes.count ?? 0) + (leadTasksRes.count ?? 0);
    const newestFeed = feedRes.data?.[0]?.created_at as string | undefined;
    const newestLead = leadTasksRes.data?.[0]?.created_at as string | undefined;

    let newestCreatedAt: string | null = null;
    if (newestFeed && newestLead) {
      newestCreatedAt =
        new Date(newestFeed).getTime() >= new Date(newestLead).getTime()
          ? newestFeed
          : newestLead;
    } else {
      newestCreatedAt = newestFeed ?? newestLead ?? null;
    }

    return { count, newestCreatedAt };
  } catch (err) {
    console.error('Error loading Text-to-Job status:', err);
    return { count: 0, newestCreatedAt: null };
  }
}

