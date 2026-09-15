import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), getRequest: vi.fn(), loadRefundTiers: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/quick-stop-requests', () => ({ getQuickStopRequestById: mocks.getRequest }));
vi.mock('@/lib/quick-stop-refunds', () => ({ loadRefundTiers: mocks.loadRefundTiers }));
vi.mock('@/app/quick-stop/[id]/actions', () => ({
  customerCancelQuickStopAction: vi.fn(), reportNoShowQuickStopAction: vi.fn(),
  acceptRevisedWindowQuickStopAction: vi.fn(), declineRevisedWindowQuickStopAction: vi.fn(),
  approveDiagnosticConversionAction: vi.fn(), declineDiagnosticConversionAction: vi.fn(),
}));
import QuickStopStatusPage from '@/app/quick-stop/[id]/page';

describe('Quick Stop customer reporting and refund status', () => {
  let renderer: ReactTestRenderer | undefined;
  const request = {
    id: 'request-1', account_id: 'account-1', status: 'confirmed',
    payment_id: 'payment-1', job_id: 'job-1', paid_at: '2026-09-14T17:00:00Z',
    arrival_date: '2026-09-14', arrival_start: '14:00', arrival_end: '15:00',
    arrived_at: null, refund_cents: 0, fee_cents: 10000,
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T22:30:00Z'));
    mocks.getRequest.mockResolvedValue({ ...request });
    mocks.loadRefundTiers.mockResolvedValue({
      withinGraceMinutes: 5, grace: 100, beforeEnRoute: 75, afterEnRoute: 25,
      afterArrived: 0, contractorMissedWindow: 100, contractorCancel: 100, noShow: 100,
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: table === 'sites' ? { company_name: 'Example Service' } : { timezone: 'America/Los_Angeles' } }),
      })),
    });
  });
  afterEach(() => { renderer?.unmount(); vi.useRealTimers(); });
  async function render(search: { done?: string; error?: string } = {}) {
    renderer = create(await QuickStopStatusPage({ params: Promise.resolve({ id: request.id }), searchParams: Promise.resolve(search) }));
    return renderer;
  }
  const reportButtons = (page: ReactTestRenderer) => page.root.findAllByType('button').filter((button) => button.children.includes('Report a no-show'));
  const text = (page: ReactTestRenderer) => page.root.findAllByType('p').map((node) => node.children.filter((child) => typeof child === 'string').join('')).join(' ');

  it('shows reporting during the account-local reporting window', async () => {
    expect(reportButtons(await render())).toHaveLength(1);
  });
  it('hides reporting before the window ends and explains an early submission', async () => {
    vi.setSystemTime(new Date('2026-09-14T21:59:59Z'));
    const page = await render({ error: 'early' });
    expect(reportButtons(page)).toHaveLength(0);
    expect(text(page)).toContain('You can report a no-show after the arrival window ends.');
  });
  it('hides reporting after the two-hour deadline or without paid appointment evidence', async () => {
    vi.setSystemTime(new Date('2026-09-15T00:00:00.001Z'));
    expect(reportButtons(await render())).toHaveLength(0);
    mocks.getRequest.mockResolvedValue({ ...request, paid_at: null });
    vi.setSystemTime(new Date('2026-09-14T22:30:00Z'));
    expect(reportButtons(await render())).toHaveLength(0);
  });
  it.each(['pending','processing','retry'])('shows a %s refund without claiming it was issued', async (refundState) => {
    mocks.getRequest.mockResolvedValue({ ...request, status: 'customer_canceled', refund_state: refundState });
    const content = text(await render({ done: 'canceled' }));
    expect(content).toContain('Your Quick Stop was canceled. Your refund is pending.');
    expect(content).not.toContain('Any refund due has been issued');
    expect(content).not.toContain('A refund of');
  });
  it('keeps a pending refund visible when returning without a redirect query', async () => {
    mocks.getRequest.mockResolvedValue({ ...request, status: 'customer_canceled', refund_state: 'retry' });
    expect(text(await render())).toContain('Your refund is pending.');
  });
  it('shows the verified completed amount for a no-show refund', async () => {
    mocks.getRequest.mockResolvedValue({ ...request, status: 'no_show_confirmed', refund_state: 'completed', refund_cents: 10000 });
    expect(text(await render({ done: 'no_show' }))).toContain('A refund of $100 has been issued.');
  });
  it('discloses when a refund needs review', async () => {
    mocks.getRequest.mockResolvedValue({ ...request, status: 'customer_canceled', refund_state: 'review' });
    expect(text(await render())).toContain('Your refund needs a support review.');
  });
});
