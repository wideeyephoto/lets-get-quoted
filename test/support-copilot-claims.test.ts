import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { triageSupportTicket, diagnoseContractorOnboarding } from '@/lib/ai-operator/support-copilot';

describe('Customer-Facing Claims and Capability Gate (P3-1)', () => {
  const copilotPath = path.resolve(process.cwd(), 'src/lib/ai-operator/support-copilot.ts');
  const sourceCode = fs.readFileSync(copilotPath, 'utf8');

  it('does not claim dedicated local phone numbers or 100% white-labeling', () => {
    expect(sourceCode).not.toContain('dedicated local SMS number');
    expect(sourceCode).not.toContain('100% white-labeled');
    expect(sourceCode).not.toContain('claim a dedicated business phone number');
  });

  it('does not claim SSL certificates are issued automatically for custom domains', () => {
    expect(sourceCode).not.toContain('SSL certificates are issued automatically');
  });

  it('generates truthful guidance for phone and domain inquiries', () => {
    const phoneTriage = triageSupportTicket({
      subject: 'How do I get an SMS number?',
      body: 'I want a local phone number for customer texting',
    });
    expect(phoneTriage.topic).toBe('sms_phone');
    expect(phoneTriage.suggestedReply).not.toContain('dedicated local');
    expect(phoneTriage.suggestedReply).not.toContain('100% white-labeled');

    const domainTriage = triageSupportTicket({
      subject: 'Connecting my domain',
      body: 'How do I setup my custom website domain and ssl certificate?',
    });
    expect(domainTriage.topic).toBe('website_domain');
    expect(domainTriage.suggestedReply).not.toContain('issued automatically');
    expect(domainTriage.suggestedReply).toContain('CNAME');
  });

  it('queries quotes with quoted_amount > 0 rather than raw unquoted jobs', async () => {
    let queriedQuotesFilter = false;
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'jobs') {
          return {
            select: () => ({
              eq: () => ({
                gt: (col: string, val: number) => {
                  if (col === 'quoted_amount' && val === 0) queriedQuotesFilter = true;
                  return Promise.resolve({ count: 1, error: null });
                },
                in: () => Promise.resolve({ count: 1, error: null }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'acc_1', connect_onboarded: true }, error: null }),
              }),
            }),
          };
        }
        if (table === 'sms_sender_numbers') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [{ id: 'num_1' }], error: null }),
              }),
            }),
          };
        }
        return {};
      },
    } as any;

    await diagnoseContractorOnboarding(mockSupabase, 'acc_1');
    expect(queriedQuotesFilter).toBe(true);
  });
});
