import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireOfficeContext = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => mockRequireOfficeContext(...args),
}));

const mockLoadVoiceGroundingContext = vi.fn();
const mockBuildVoiceSystemPrompt = vi.fn();
vi.mock('@/lib/voice/grounding', () => ({
  loadVoiceGroundingContext: (...args: unknown[]) => mockLoadVoiceGroundingContext(...args),
  buildVoiceSystemPrompt: (...args: unknown[]) => mockBuildVoiceSystemPrompt(...args),
}));

import { POST } from '@/app/api/voice/simulate/route';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('Voice Simulation Sandbox Route', () => {
  beforeEach(() => {
    mockRequireOfficeContext.mockReset();
    mockLoadVoiceGroundingContext.mockReset();
    mockBuildVoiceSystemPrompt.mockReset();

    mockRequireOfficeContext.mockResolvedValue({
      supabase: {},
      accountId: ACCOUNT_ID,
    });

    mockLoadVoiceGroundingContext.mockResolvedValue({
      companyName: 'Apex Air & Plumbing',
      trade: 'HVAC Contractor',
      serviceNames: ['AC Repair', 'Heat Pump Installation'],
      serviceAreas: 'Greater Metro',
      availableSlots: ['Wednesday Morning (8:00 AM - 12:00 PM)'],
      voiceTone: 'professional',
      isLicensed: true,
      recognizedCaller: null,
    });

    mockBuildVoiceSystemPrompt.mockReturnValue('MOCK_SYSTEM_PROMPT');
  });

  it('handles appointment booking scenario with tool execution', async () => {
    const req = new NextRequest('http://localhost/api/voice/simulate', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'booking',
        message: 'Hi, do you have any open slots to send an AC technician tomorrow?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.toolsExecuted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'check_available_slots' }),
      ]),
    );
    expect(json.spokenResponse).toContain('Wednesday Morning');
    expect(json.extractedIntake.urgency).toBe('normal');
    expect(json.extractedIntake.isEmergency).toBe(false);
  });

  it('detects emergency hazards and dispatches simulated alert', async () => {
    const req = new NextRequest('http://localhost/api/voice/simulate', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'emergency',
        message: 'Emergency! A water pipe just burst in our kitchen and water is flooding into the electrical panel!',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.toolsExecuted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'automated_hazard_detection' }),
      ]),
    );
    expect(json.extractedIntake.isEmergency).toBe(true);
    expect(json.extractedIntake.urgency).toBe('critical');
    expect(json.spokenResponse).toContain('emergency');
  });

  it('handles clean energy IRA rebate inquiries with incentive tools', async () => {
    const req = new NextRequest('http://localhost/api/voice/simulate', {
      method: 'POST',
      body: JSON.stringify({
        scenario: 'rebates',
        message: 'Do you offer heat pumps that qualify for federal IRA 25C tax credits?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.toolsExecuted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'check_rebates_and_incentives' }),
      ]),
    );
    expect(json.spokenResponse).toContain('IRA 25C');
  });

  it('respects warm and friendly persona tone prefix', async () => {
    mockLoadVoiceGroundingContext.mockResolvedValueOnce({
      companyName: 'Apex Air & Plumbing',
      trade: 'HVAC Contractor',
      serviceNames: ['AC Repair'],
      serviceAreas: 'Greater Metro',
      availableSlots: [],
      voiceTone: 'friendly',
      isLicensed: true,
      recognizedCaller: null,
    });

    const req = new NextRequest('http://localhost/api/voice/simulate', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Hello, what services do you provide?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tone).toBe('friendly');
    expect(json.spokenResponse).toContain('Thanks for reaching out to Apex Air & Plumbing!');
  });
});
