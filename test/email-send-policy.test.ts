import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions, Resend } from 'resend';
import { assertEmailSendAllowed, sendAccountScopedEmail } from '@/lib/email-send-policy';
import { sendWithDomainFallback } from '@/lib/email-domain-fallback';
import { loadSuppressedEmails } from '@/lib/email-suppression';

const payload = (kind = 'appointment_reminder'): CreateEmailOptions => ({ from: 'Builder <quotes@builder.example>',
  to: 'Client <CLIENT@example.com>', subject: 'Message', html: 'Hello',
  tags: [{ name: 'kind', value: kind }, { name: 'account_id', value: 'workspace-a' }] });
function fake(data: unknown = [], error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data, error }) };
  const from = vi.fn().mockReturnValue(query);
  return { admin: { from } as unknown as SupabaseClient, query, from };
}
describe('last-moment shared email policy', () => {
  it.each(['', 'workspace-b'])('rejects an absent or conflicting authoritative workspace: %s', async accountId => {
    const send = vi.fn();
    const { admin, from } = fake();
    await expect(sendAccountScopedEmail(admin, { emails: { send } } as unknown as Resend, accountId, payload())).rejects.toThrow('workspace');
    expect(from).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['hard_bounce','complaint','provider_suppressed'])('blocks transactional %s', async reason => {
    const { admin } = fake([{ email: 'client@example.com', reason }]);
    await expect(assertEmailSendAllowed(admin, payload())).rejects.toThrow('blocked');
  });
  it.each(['unsubscribe_link','one_click_unsubscribe'])('allows transactional mail after %s', async reason => {
    await expect(assertEmailSendAllowed(fake([{ reason }]).admin, payload())).resolves.toBeUndefined();
  });
  it.each(['campaign','review_request','rebook_invite'])('blocks opted-out %s even when its caller forgot the preflight', async kind => {
    await expect(assertEmailSendAllowed(fake([{ reason: 'one_click_unsubscribe' }]).admin, payload(kind))).rejects.toThrow('opted out');
  });
  it('checks exact normalized to, cc and bcc addresses within the tagged workspace', async () => {
    const { admin, query } = fake();
    await assertEmailSendAllowed(admin, { ...payload(), cc: ['a_b@example.com'], bcc: ['percent%tag@example.com', 'client@example.com'] });
    expect(query.eq).toHaveBeenCalledWith('account_id', 'workspace-a');
    expect(query.in).toHaveBeenCalledWith('email', ['client@example.com','a_b@example.com','percent%tag@example.com']);
  });
  it('rejects a header injection before extracting the display-name address', async () => {
    const { admin, from } = fake();
    await expect(assertEmailSendAllowed(admin, { ...payload(), to: 'Client\r\nBcc: hidden@example.com <client@example.com>' })).rejects.toThrow('could not be verified');
    expect(from).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: [], error: { message: 'offline' } }])('does not send on incomplete reads', async ({ data, error }) => {
    await expect(assertEmailSendAllowed(fake(data,error).admin, payload())).rejects.toThrow('could not be checked');
  });
  it('rechecks suppression before the platform fallback', async () => {
    const { admin, query } = fake();
    query.in.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ reason: 'complaint' }], error: null });
    const provider = vi.fn().mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'The builder.example domain is not verified.' } });
    await expect(sendWithDomainFallback(async message => { await assertEmailSendAllowed(admin,message); return provider(message); }, payload())).rejects.toThrow('blocked');
    expect(provider).toHaveBeenCalledOnce();
  });
  it('does not borrow another workspace scope for platform mail', async () => {
    const { admin, from } = fake();
    await assertEmailSendAllowed(admin, { ...payload(), tags: [{ name: 'kind', value: 'support_case_staff' }] });
    expect(from).not.toHaveBeenCalled();
  });
  it.each([null, Array.from({ length: 1000 }, () => ({ email: 'opted-out@example.com' }))])('refuses an unavailable or capped marketing suppression list', async data => {
    const admin = { from: () => ({ select: () => ({ eq: async () => ({ data, error: null }) }) }) } as unknown as SupabaseClient;
    await expect(loadSuppressedEmails(admin, 'workspace-a')).rejects.toThrow('unavailable or potentially truncated');
  });
});
