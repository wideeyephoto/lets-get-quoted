import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

// Login/security history for the admin account profile. Direct mirror of
// account-events.ts's shape. Hooked into the owner-facing auth callbacks
// (OAuth, magic link, phone) right after ensureAccountMembership resolves the
// account — never inside ensureAccountMembership itself, which also runs on
// every requireOwnerContext() page load, not just at sign-in.
//
// Recording is always best-effort: a write failure here must never block a
// sign-in that otherwise succeeded.

export type LoginEventMethod = 'oauth' | 'magic_link' | 'phone';

export async function recordLoginEvent(input: {
  accountId: string;
  userId: string;
  method: LoginEventMethod;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('login_events').insert({
      account_id: input.accountId,
      user_id: input.userId,
      method: input.method,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('recordLoginEvent failed:', error instanceof Error ? error.message : error);
  }
}

export type LoginEvent = {
  id: string;
  user_id: string;
  method: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export async function listLoginEvents(supabase: SupabaseClient, accountId: string, limit = 10): Promise<LoginEvent[]> {
  try {
    const { data, error } = await supabase
      .from('login_events')
      .select('id, user_id, method, ip, user_agent, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as LoginEvent[];
  } catch {
    return [];
  }
}
