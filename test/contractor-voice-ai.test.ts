import { describe, it, expect, vi } from 'vitest';
import {
  buildContractorVoiceInstructions,
  parseContractorVoicePrompt,
  type ContractorVoiceContext,
} from '@/lib/contractor-voice-ai';

vi.mock('@/lib/ai-model-call', () => ({
  callModel: vi.fn(async (payload) => {
    // Return mock response based on user content
    const userPrompt = payload.messages[1].content;
    if (userPrompt.includes('Miller') && userPrompt.includes('roof leak')) {
      return {
        ok: true,
        json: async () => ({
          targetType: 'lead',
          intent: 'create_lead',
          leadData: {
            name: 'John Miller',
            phone: '415-555-1234',
            address: '742 Evergreen Terrace',
            projectType: 'Roof leak repair',
            message: 'Leaking roof over the garage after the storm',
            score: 'hot',
            requestedDate: '2026-08-28',
            requestedTime: '14:00',
          },
          actionSummary: 'Created hot lead for John Miller at 742 Evergreen Terrace.',
          confidence: 0.95,
        }),
      };
    }

    if (userPrompt.includes('recessed lights')) {
      return {
        ok: true,
        json: async () => ({
          targetType: 'job',
          intent: 'update_job',
          jobData: {
            scope: 'Added 4 recessed LED ceiling lights and dimmer switch',
            quoteItems: [
              { label: 'Recessed LED Ceiling Lights', amount: 650, quantity: 4, unitPrice: 150, kind: 'service' },
            ],
            scheduledFor: '2026-09-01',
            scheduledTime: '08:00',
            feedNote: 'Customer approved adding 4 recessed ceiling lights ($650 total).',
          },
          actionSummary: 'Updated job scope and added $650 quote line item.',
          confidence: 0.92,
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        targetType: 'lead',
        intent: 'update_lead',
        actionSummary: 'Parsed voice notes',
        confidence: 0.85,
      }),
    };
  }),
}));

describe('Contractor Voice AI Parser', () => {
  it('generates rich instructions for existing lead updates', () => {
    const context: ContractorVoiceContext = {
      accountId: 'acc-123',
      targetType: 'lead',
      existingLead: {
        id: 'lead-001',
        name: 'Sarah Connor',
        phone: '555-0199',
        address: '123 Tech Way',
        projectType: 'Panel Upgrade',
      },
    };

    const instructions = buildContractorVoiceInstructions(context);
    const joined = instructions.join('\n');

    expect(joined).toContain('CONTEXT - UPDATING EXISTING LEAD');
    expect(joined).toContain('Sarah Connor');
    expect(joined).toContain('555-0199');
    expect(joined).toContain('SCHEMA TO RETURN AS RAW JSON');
  });

  it('generates rich instructions for existing job updates', () => {
    const context: ContractorVoiceContext = {
      accountId: 'acc-123',
      targetType: 'job',
      existingJob: {
        id: 'job-001',
        ref: 'J-1042',
        clientName: 'Wayne Enterprises',
        scope: 'Main feeder replacement',
        status: 'in_progress',
      },
    };

    const instructions = buildContractorVoiceInstructions(context);
    const joined = instructions.join('\n');

    expect(joined).toContain('CONTEXT - UPDATING EXISTING JOB');
    expect(joined).toContain('J-1042');
    expect(joined).toContain('Wayne Enterprises');
    expect(joined).toContain('quoteItems');
  });

  it('parses spoken contractor lead transcript into structured data', async () => {
    const transcript = 'Add a new lead for John Miller, his phone is 415-555-1234, address 742 Evergreen Terrace, roof leak over garage, needs quote Friday 2pm';
    const result = await parseContractorVoicePrompt(transcript, {
      accountId: 'acc-123',
      targetType: 'lead',
    });

    expect(result.targetType).toBe('lead');
    expect(result.intent).toBe('create_lead');
    expect(result.leadData?.name).toBe('John Miller');
    expect(result.leadData?.phone).toBe('415-555-1234');
    expect(result.leadData?.address).toBe('742 Evergreen Terrace');
    expect(result.leadData?.score).toBe('hot');
  });

  it('parses spoken contractor job transcript into structured items and schedule', async () => {
    const transcript = 'Customer approved adding 4 recessed lights in living room, total 650, schedule for next Tuesday 8am';
    const result = await parseContractorVoicePrompt(transcript, {
      accountId: 'acc-123',
      targetType: 'job',
    });

    expect(result.targetType).toBe('job');
    expect(result.intent).toBe('update_job');
    expect(result.jobData?.quoteItems?.[0]?.label).toContain('Recessed LED');
    expect(result.jobData?.quoteItems?.[0]?.amount).toBe(650);
    expect(result.jobData?.feedNote).toBeTruthy();
  });

  it('rejects empty voice transcripts cleanly', async () => {
    await expect(
      parseContractorVoicePrompt('   ', { accountId: 'acc-123' }),
    ).rejects.toThrow('No voice transcript provided.');
  });
});
