import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleDisputeEvidence } from '@/lib/dispute-evidence';

describe('Dispute Evidence Lib', () => {
  let supabaseMock: any;
  let fromMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    fromMock = vi.fn();
    supabaseMock = {
      from: fromMock,
    };
    
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns null if payment not found', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
    fromMock.mockReturnValue(query);
    
    const res = await assembleDisputeEvidence(supabaseMock, 'acct', 'pay1');
    expect(res).toBeNull();
  });

  it('assembles evidence when full data available', async () => {
    fromMock.mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(), then: vi.fn() };
      
      if (table === 'payments') {
        q.maybeSingle.mockResolvedValue({
          data: { id: 'pay1', job_id: 'job1', invoice_id: 'inv1', amount: 100, dispute_reason: 'fraud', homeowner_phone: '123' }
        });
      } else if (table === 'jobs') {
        q.maybeSingle.mockResolvedValue({
          data: { id: 'job1', ref: 'J-1', title: 'Fix', client_name: 'John', client_phone: '111', client_email: 'a@b.com' }
        });
      } else if (table === 'invoices') {
        q.maybeSingle.mockResolvedValue({
          data: { id: 'inv1', ref: 'INV-1', total: 100, signed_at: '2023-01-01T12:00:00Z', signer_name: 'John' }
        });
      } else if (table === 'messages') {
        q.then = vi.fn().mockImplementation((resolve) => resolve({ data: [{ id: 'm1' }] }));
      }
      return q;
    });

    const res = await assembleDisputeEvidence(supabaseMock, 'acct', 'pay1');
    expect(res).not.toBeNull();
    expect(res?.paymentId).toBe('pay1');
    expect(res?.clientName).toBe('John');
    expect(res?.contractSigned).toBe(true);
    expect(res?.messagesCount).toBe(1);
    expect(res?.summaryText).toContain('EVIDENCE SUBMISSION FOR PAYMENT DISPUTE');
    expect(res?.summaryText).toContain('Signed by John on 1/1/2023'); // locale string format can vary, but we can just check 'Signed by John'
  });

  it('handles missing invoice', async () => {
    fromMock.mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(), then: vi.fn() };
      if (table === 'payments') {
        q.maybeSingle.mockResolvedValue({
          data: { id: 'pay1', job_id: 'job1', invoice_id: null, amount: 100 }
        });
      } else if (table === 'jobs') {
        q.maybeSingle.mockResolvedValue({
          data: null
        });
      } else if (table === 'messages') {
        q.then = vi.fn().mockImplementation((resolve) => resolve({ data: null }));
      }
      return q;
    });

    const res = await assembleDisputeEvidence(supabaseMock, 'acct', 'pay1');
    expect(res?.contractSigned).toBe(false);
    expect(res?.invoiceRef).toBeNull();
    expect(res?.summaryText).toContain('Authorized online');
  });

  it('handles db errors gracefully', async () => {
    fromMock.mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
      if (table === 'payments') {
        q.maybeSingle.mockRejectedValue(new Error('db fail'));
      }
      return q;
    });

    const res = await assembleDisputeEvidence(supabaseMock, 'acct', 'pay1');
    expect(res).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
