import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_TOOLS_DECLARATION, executeAssistantTool, type ToolExecutionContext } from '@/lib/ai-assistant/tools';
import { hydrateActiveRecordContext } from '@/lib/ai-assistant/engine';

describe('AI Assistant Tools Declaration', () => {
  it('defines all required contractor tool declarations', () => {
    const names = ASSISTANT_TOOLS_DECLARATION.map((t) => t.name);
    expect(names).toContain('modify_active_job');
    expect(names).toContain('add_quote_line_item');
    expect(names).toContain('add_job_task');
    expect(names).toContain('get_active_record_details');
    expect(names).toContain('create_quote_or_job');
    expect(names).toContain('search_clients');
    expect(names).toContain('search_jobs_and_quotes');
    expect(names).toContain('get_unpaid_invoices_and_payments');
    expect(names).toContain('get_schedule');
    expect(names).toContain('get_business_summary');
    expect(names).toContain('navigate_to');
  });

  it('validates schema requirements for create_quote_or_job', () => {
    const tool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'create_quote_or_job');
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toEqual(['clientName', 'scope']);
    expect(tool?.parameters.properties?.['clientName']?.type).toBe('STRING');
    expect(tool?.parameters.properties?.['amount']?.type).toBe('NUMBER');
  });

  it('validates schema requirements for modify_active_job and add_quote_line_item', () => {
    const modifyTool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'modify_active_job');
    expect(modifyTool).toBeDefined();

    const lineItemTool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'add_quote_line_item');
    expect(lineItemTool).toBeDefined();
    expect(lineItemTool?.parameters.required).toEqual(['label', 'amount']);
  });
});

describe('executeAssistantTool Routing & Handlers', () => {
  const mockAccountId = 'acc-12345678-1234';
  const mockUserId = 'usr-12345678-1234';

  it('handles navigate_to destination mapping', async () => {
    const mockCtx: ToolExecutionContext = {
      supabase: {} as any,
      accountId: mockAccountId,
      userId: mockUserId,
      role: 'owner',
    };

    const result = await executeAssistantTool(
      'navigate_to',
      { destination: 'settings', description: 'Connect Stripe' },
      mockCtx,
    );

    expect(result.data).toEqual({
      destination: 'Business Settings',
      path: '/dashboard/settings',
    });
    expect(result.actionCard?.type).toBe('navigation');
    expect(result.actionCard?.linkUrl).toBe('/dashboard/settings');
  });

  it('handles modify_active_job on active screen record', async () => {
    const mockJob = {
      id: 'job-11111111-1111-1111-1111-111111111111',
      account_id: mockAccountId,
      ref: 'J-1002',
      client_name: 'John Doe',
      status: 'in_progress',
      scheduled_for: '2026-08-30',
      scope: 'Roof repair',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockJob, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...mockJob, status: 'complete' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const mockCtx: ToolExecutionContext = {
      supabase: mockSupabase as any,
      accountId: mockAccountId,
      userId: mockUserId,
      role: 'owner',
      activeRecord: {
        type: 'job',
        id: mockJob.id,
      },
    };

    const result = await executeAssistantTool(
      'modify_active_job',
      { status: 'complete' },
      mockCtx,
    );

    expect((result.data as any).status).toBe('complete');
    expect(result.actionCard?.type).toBe('job_updated');
    expect(result.actionCard?.linkUrl).toBe(`/dashboard/jobs/${mockJob.id}`);
  });

  it('handles add_job_task on active job', async () => {
    const mockJobId = 'job-11111111-1111-1111-1111-111111111111';
    const mockTask = {
      id: 'task-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      title: 'Pick up materials',
      done: false,
      sort_order: 0,
      created_at: '2026-08-26T00:00:00Z',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTask, error: null }),
          }),
        }),
      }),
    };

    const mockCtx: ToolExecutionContext = {
      supabase: mockSupabase as any,
      accountId: mockAccountId,
      userId: mockUserId,
      role: 'owner',
      activeRecord: {
        type: 'job',
        id: mockJobId,
      },
    };

    const result = await executeAssistantTool(
      'add_job_task',
      { title: 'Pick up materials' },
      mockCtx,
    );

    expect((result.data as any).title).toBe('Pick up materials');
    expect(result.actionCard?.type).toBe('task_created');
  });

  it('handles search_clients tool execution', async () => {
    const mockClients = [
      {
        id: 'client-1',
        name: 'John Doe',
        phone: '555-111-2222',
        email: 'john@example.com',
        address: '123 Elm St',
        notes: null,
        created_at: '2026-08-01T00:00:00Z',
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
      }),
    };

    const mockCtx: ToolExecutionContext = {
      supabase: mockSupabase as any,
      accountId: mockAccountId,
      userId: mockUserId,
      role: 'owner',
    };

    const result = await executeAssistantTool(
      'search_clients',
      { query: 'John', limit: 5 },
      mockCtx,
    );

    expect(result.data).toBeDefined();
    expect((result.data as any).count).toBe(1);
    expect((result.data as any).clients[0].name).toBe('John Doe');
    expect(result.actionCard?.type).toBe('client_list');
  });

  it('throws for unknown tool names', async () => {
    const mockCtx: ToolExecutionContext = {
      supabase: {} as any,
      accountId: mockAccountId,
      userId: mockUserId,
      role: 'owner',
    };

    await expect(
      executeAssistantTool('non_existent_tool', {}, mockCtx),
    ).rejects.toThrow('Unknown tool: non_existent_tool');
  });
});

describe('AI Assistant File & Multimodal Uploads', () => {
  const mockAccountId = 'acc-12345678-1234';
  const mockUserId = 'usr-12345678-1234';

  it('handles file attachments in fallback mode when API key is missing', async () => {
    const origKey = process.env.GEMINI_API_KEY;
    const origGoogleKey = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    try {
      const { runAssistantConversation } = await import('@/lib/ai-assistant/engine');

      const mockCtx = {
        userId: mockUserId,
        accountId: mockAccountId,
        role: 'owner' as const,
        businessName: 'Apex Plumbing',
        companionId: 'sparky',
      };

      const mockToolCtx: ToolExecutionContext = {
        supabase: {} as any,
        accountId: mockAccountId,
        userId: mockUserId,
        role: 'owner',
      };

      const result = await runAssistantConversation(
        [
          {
            role: 'user',
            content: 'Can you analyze this receipt?',
            file: {
              name: 'homedepot_receipt.png',
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              mimeType: 'image/png',
            },
          },
        ],
        mockCtx,
        mockToolCtx,
      );

      expect(result.message).toBeDefined();
      expect(result.message.content).toContain('Sparky');
      expect(result.message.content).toContain('GEMINI_API_KEY');
    } finally {
      if (origKey) process.env.GEMINI_API_KEY = origKey;
      if (origGoogleKey) process.env.GOOGLE_API_KEY = origGoogleKey;
    }
  });
});
