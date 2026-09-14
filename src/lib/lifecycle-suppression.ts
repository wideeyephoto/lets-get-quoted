import type { SupabaseClient } from '@supabase/supabase-js';

/** Preflight only; the durable lifecycle claim checks current suppression again. */
export async function loadLifecycleSuppressedRecipients(admin: SupabaseClient,
  recipients: Array<{ accountId: string; email: string }>): Promise<Set<string>> {
  const unique = new Map<string, { accountId: string; email: string }>();
  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (!recipient.accountId?.trim() || !email || /[\r\n]/.test(email)) {
      throw new Error('Lifecycle suppression recipient could not be verified.');
    }
    unique.set(`${recipient.accountId}:${email}`, { accountId: recipient.accountId, email });
  }
  if (unique.size > 500) throw new Error('Lifecycle suppression preflight exceeds 500 recipients; split the batch.');
  const pairs = [...unique.entries()];
  const suppressed = new Set<string>();
  for (let offset = 0; offset < pairs.length; offset += 100) {
    const chunk = pairs.slice(offset, offset + 100);
    const requested = chunk.map(([,pair]) => ({account_id:pair.accountId,email:pair.email}));
    const { data, error } = await admin.rpc('lifecycle_recipient_suppression', {p_recipients:requested});
    if (error || !Array.isArray(data) || data.length !== requested.length
      || data.some((row,index) => !row || row.account_id !== requested[index].account_id
        || row.email !== requested[index].email || typeof row.blocked !== 'boolean')) {
      throw new Error('Email suppression lookup failed; no lifecycle emails sent.');
    }
    data.forEach((row,index) => { if (row.blocked) suppressed.add(chunk[index][0]); });
  }
  return suppressed;
}
