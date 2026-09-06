import { describe, expect, it, vi } from 'vitest';
import { CREW_TOOLS_DECLARATION, executeCrewTool, type CrewToolExecutionContext } from '@/lib/ai-assistant/crew-tools';
import { buildCrewSystemInstruction, runCrewAssistantConversation, type CrewAssistantContext } from '@/lib/ai-assistant/crew-engine';
import type { CrewMember } from '@/lib/crew';

describe('Crew AI Copilot - Security Boundaries & Declarations', () => {
  it('defines all allowed crew tool declarations', () => {
    const names = CREW_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).toContain('get_my_route_and_schedule');
    expect(names).toContain('get_job_access_and_details');
    expect(names).toContain('get_timecard_and_hours');
    expect(names).toContain('clock_in_or_out');
    expect(names).toContain('add_job_note_or_task');
  });

  it('strictly enforces security: does NOT include owner financial tools', () => {
    const names = CREW_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).not.toContain('get_business_summary');
    expect(names).not.toContain('get_unpaid_invoices_and_payments');
    expect(names).not.toContain('create_quote_or_job');
    expect(names).not.toContain('modify_active_job');
    expect(names).not.toContain('log_expense');
    expect(names).not.toContain('analyze_receipt_or_expense');
  });
});

describe('Crew AI Copilot - System Instruction', () => {
  it('includes companion name, crew member, business name, and security boundary', () => {
    const ctx: CrewAssistantContext = {
      userId: 'user-123',
      accountId: 'acc-456',
      businessName: 'Apex Roofing & Solar',
      crewName: 'Dave Miller',
      crewRole: 'Lead Installer',
      companionId: 'sparky',
      activeJobId: 'job-789',
      activeJobRef: '104',
    };

    const instruction = buildCrewSystemInstruction(ctx);

    // Identity and role
    expect(instruction).toContain('Sparky');
    expect(instruction).toContain('Dave Miller');
    expect(instruction).toContain('Apex Roofing & Solar');
    expect(instruction).toContain('#104');

    // Security boundaries
    expect(instruction).toContain('MUST NOT disclose business finances');
    expect(instruction).toContain('profit margins');
    expect(instruction).toContain('ONLY ASSIGNED JOBS');
  });
});

describe('Crew AI Copilot - Tool Execution & Job Assignment Security', () => {
  const mockCrew: CrewMember = {
    id: 'crew-001',
    account_id: 'acc-456',
    user_id: 'user-123',
    name: 'Dave Miller',
    email: 'dave@example.com',
    phone: '555-123-4567',
    role_label: 'Lead Tech',
    hourly_rate: 35,
    photo_path: null,
    deleted_at: null,
    active: true,
    created_at: new Date().toISOString(),
  };


  it('refuses access to jobs not assigned to the crew member', async () => {
    // Mock Supabase client where isJobAssignedToCrew returns false
    const queryMock: any = {};
    queryMock.eq = vi.fn().mockReturnValue(queryMock);
    queryMock.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'crew_assignments') {
          return {
            select: vi.fn().mockReturnValue(queryMock),
          };
        }
        return {};
      }),
    };


    const toolCtx: CrewToolExecutionContext = {
      supabase: mockSupabase,
      accountId: 'acc-456',
      crew: mockCrew,
      businessName: 'Apex Roofing',
    };

    const result = await executeCrewTool(
      'get_job_access_and_details',
      { jobId: 'unassigned-job-999' },
      toolCtx,
    );

    expect(result.data).toHaveProperty('error');
    expect((result.data as any).error).toContain('not assigned to this job');
  });


  it('handles unknown tool gracefully', async () => {
    const toolCtx: CrewToolExecutionContext = {
      supabase: {} as any,
      accountId: 'acc-456',
      crew: mockCrew,
      businessName: 'Apex Roofing',
    };

    const result = await executeCrewTool('non_existent_tool', {}, toolCtx);
    expect(result.data).toHaveProperty('error');
    expect((result.data as any).error).toContain('not recognized or permitted');
  });
});


describe('Crew AI Copilot - Graceful Fallback without API Key', () => {
  it('returns friendly onboarding message when no GEMINI_API_KEY is configured', async () => {
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    try {
      const mockCrew: CrewMember = {
        id: 'crew-001',
        account_id: 'acc-456',
        user_id: 'user-123',
        name: 'Dave Miller',
        email: 'dave@example.com',
        phone: '555-123-4567',
        role_label: 'Lead Tech',
        hourly_rate: 35,
        photo_path: null,
        deleted_at: null,
        active: true,
        created_at: new Date().toISOString(),
      };


      const ctx: CrewAssistantContext = {
        userId: 'user-123',
        accountId: 'acc-456',
        businessName: 'Apex Roofing',
        crewName: 'Dave Miller',
        companionId: 'sparky',
      };

      const toolCtx: CrewToolExecutionContext = {
        supabase: {} as any,
        accountId: 'acc-456',
        crew: mockCrew,
        businessName: 'Apex Roofing',
      };

      const result = await runCrewAssistantConversation(
        [{ role: 'user', content: 'What is my schedule today?' }],
        ctx,
        toolCtx,
      );

      expect(result.message).toBeDefined();
      expect(result.message.content).toContain('Sparky');
      expect(result.message.content).toContain('setup mode');
    } finally {
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
      if (originalGoogle) process.env.GOOGLE_API_KEY = originalGoogle;
    }
  });
});
