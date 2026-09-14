import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireOfficeContext: vi.fn(), getInvoiceWithItems: vi.fn(), getJob: vi.fn(), sendInvoiceEmail: vi.fn(),
  sendInvoiceSentConfirmationEmail: vi.fn(), updateInvoiceStatus: vi.fn(), createJobFeedEvent: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'example.com', 'x-forwarded-proto': 'https' }) }));
vi.mock('@/lib/auth', () => ({ requireOfficeContext: mocks.requireOfficeContext }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Builder' }));
vi.mock('@/lib/jobs', () => ({ getJob: mocks.getJob }));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: mocks.createJobFeedEvent }));
vi.mock('@/lib/invoices', () => ({
  getInvoiceWithItems: mocks.getInvoiceWithItems, updateInvoiceStatus: mocks.updateInvoiceStatus,
}));
vi.mock('@/lib/email', () => ({ sendInvoiceEmail: mocks.sendInvoiceEmail, sendInvoiceSentConfirmationEmail: mocks.sendInvoiceSentConfirmationEmail }));
import { updateInvoiceStatusAction } from '@/app/dashboard/jobs/invoices-actions';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOfficeContext.mockResolvedValue({ accountId: 'account', supabase: { auth: { getUser: async () => ({ data: { user: { email: 'owner@example.com' } } }) } } });
  mocks.getInvoiceWithItems.mockResolvedValue({ invoice: { id: 'invoice', job_id: 'job', document_email_revision: 'invoice-rev', ref: 'INV-1', total: 100 }, items: [] });
  mocks.getJob.mockResolvedValue({ id: 'job', document_email_revision: 'job-rev', ref: 'JOB-1', client_email: 'client@example.com', client_name: 'Client' });
  mocks.sendInvoiceEmail.mockResolvedValue({ id: 'provider', alreadyAccepted: false });
});
const send = () => { const form = new FormData(); form.set('status', 'sent'); return updateInvoiceStatusAction('job','invoice',form); };
describe('invoice send status requires acceptance', () => {
  it('does not mark sent or create a sent feed row after uncertainty', async () => {
    mocks.sendInvoiceEmail.mockRejectedValue(new Error('Outcome requires reconciliation'));
    await expect(send()).rejects.toThrow('reconciliation');
    expect(mocks.updateInvoiceStatus).not.toHaveBeenCalled();
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
    expect(mocks.sendInvoiceSentConfirmationEmail).not.toHaveBeenCalled();
  });
  it('passes the saved document and job revisions and updates status after acceptance', async () => {
    await send();
    expect(mocks.sendInvoiceEmail).toHaveBeenCalledWith(expect.objectContaining({ jobRevision: 'job-rev', accountId: 'account',
      invoice: expect.objectContaining({ document_email_revision: 'invoice-rev', job_id: 'job' }) }));
    expect(mocks.sendInvoiceEmail.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateInvoiceStatus.mock.invocationCallOrder[0]);
  });
  it('recovers the status write without another owner receipt when already accepted', async () => {
    mocks.sendInvoiceEmail.mockResolvedValue({ id: 'provider', alreadyAccepted: true });
    await send();
    expect(mocks.updateInvoiceStatus).toHaveBeenCalledOnce();
    expect(mocks.sendInvoiceSentConfirmationEmail).not.toHaveBeenCalled();
  });
  it('rejects a forged nested document before sending', async () => {
    mocks.getInvoiceWithItems.mockResolvedValue(null);
    await expect(send()).rejects.toThrow('Invoice not found');
    expect(mocks.sendInvoiceEmail).not.toHaveBeenCalled();
  });
  it('does not duplicate the feed or owner receipt for an unchanged sent invoice', async () => {
    mocks.getInvoiceWithItems.mockResolvedValue({ invoice: { id: 'invoice', job_id: 'job', status: 'sent' }, items: [] });
    mocks.sendInvoiceEmail.mockResolvedValue({ id: 'provider', alreadyAccepted: true });
    await send();
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
    expect(mocks.sendInvoiceSentConfirmationEmail).not.toHaveBeenCalled();
  });
});
