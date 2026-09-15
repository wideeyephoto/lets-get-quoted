import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEmailSendRecovery, type EmailSendRecoveryRow } from '@/lib/email-send-recovery';
import { EmailRecoveryPanel } from '@/app/admin/health/EmailRecoveryPanel';

const row: EmailSendRecoveryRow = {
  source: 'document', send_id: 'send-reference', account_id: 'workspace-a', kind: 'invoice',
  state: 'manual_review', phase: 'fallback', attempts: 3, first_attempt_at: '2026-09-14T10:00:00Z',
  retry_before: '2026-09-15T09:00:00Z', reason: 'manual_review',
};
function fake(data: unknown, error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ limit });
  return { admin: { rpc } as unknown as SupabaseClient, rpc, limit };
}
afterEach(() => vi.restoreAllMocks());
describe('email recovery health panel', () => {
  it.each([null, { unexpected: true }])('does not report missing data as healthy', async data => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await loadEmailSendRecovery(fake(data).admin);
    const html = renderToStaticMarkup(<EmailRecoveryPanel emailRecovery={result} />);
    expect(html).toContain('checks are unavailable');
    expect(html).not.toContain('No overdue');
  });
  it('reports query errors without exposing database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await loadEmailSendRecovery(fake([], { message: 'private database details' }).admin)).available).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private database');
  });
  it('distinguishes a successful empty result and limits the all-clear to tracked paths', async () => {
    const result = await loadEmailSendRecovery(fake([]).admin);
    expect(result.available).toBe(true);
    const html = renderToStaticMarkup(<EmailRecoveryPanel emailRecovery={result} />);
    expect(html).toContain('No overdue or uncertain sends found in the tracked email paths');
    expect(html).toContain('Provider acceptance does not confirm delivery');
  });
  it('bounds the dashboard and discloses additional records', async () => {
    const query = fake(Array.from({ length: 51 }, (_, i) => ({ ...row, send_id: `send-${i}` })));
    const result = await loadEmailSendRecovery(query.admin);
    expect(query.rpc).toHaveBeenCalledWith('email_send_recovery_queue');
    expect(query.limit).toHaveBeenCalledWith(51);
    expect(result.rows).toHaveLength(50);
    const html = renderToStaticMarkup(<EmailRecoveryPanel emailRecovery={result} />);
    expect(html).toContain('At least 51');
    expect(html).toContain('Showing the 50 oldest');
    expect(html).not.toContain('send-50');
  });
  it('renders review guidance, the correct workspace, fallback and fixed retry cutoff', () => {
    const html = renderToStaticMarkup(<EmailRecoveryPanel emailRecovery={{ available: true, more: false, rows: [row] }} />);
    expect(html).toContain('href="/admin/accounts/workspace-a"');
    expect(html).toContain('Delivery needs review');
    expect(html).toContain('Platform sender fallback');
    expect(html).toContain('2026-09-15 09:00 UTC');
    expect(html).toContain('sending a replacement can duplicate an accepted message');
    expect(html).not.toContain('<button');
  });
});
