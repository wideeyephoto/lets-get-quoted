import { describe, it, expect, vi } from 'vitest';
import { ASSISTANT_TOOLS_DECLARATION, executeAssistantTool, type ToolExecutionContext } from '@/lib/ai-assistant/tools';

describe('Sparky AI Assistant Expense Tools', () => {
  it('declares log_job_expense in ASSISTANT_TOOLS_DECLARATION with required amount and description', () => {
    const tool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'log_job_expense');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Logs a material, subcontractor, labor');
    expect(tool?.parameters.required).toContain('amount');
    expect(tool?.parameters.required).toContain('description');
  });

  it('declares get_job_cost_analysis in ASSISTANT_TOOLS_DECLARATION', () => {
    const tool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'get_job_cost_analysis');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('financial intelligence');
  });

  it('includes expenses in navigate_to destination list', () => {
    const tool = ASSISTANT_TOOLS_DECLARATION.find((t) => t.name === 'navigate_to');
    expect(tool).toBeDefined();
    const destProp = (tool?.parameters.properties as Record<string, { description: string }>).destination;
    expect(destProp.description).toContain('expenses');
  });

  it('navigates to /dashboard/expenses when destination is expenses', async () => {
    const ctx: ToolExecutionContext = {
      supabase: {} as any,
      accountId: 'acc-test',
      userId: 'user-test',
      role: 'owner',
    };

    const result = await executeAssistantTool('navigate_to', { destination: 'expenses' }, ctx);
    expect(result.data).toEqual({
      destination: 'All Expenses Ledger',
      path: '/dashboard/expenses',
    });
    expect(result.actionCard?.type).toBe('navigation');
    expect(result.actionCard?.linkUrl).toBe('/dashboard/expenses');
  });

  it('throws when log_job_expense is invoked without a target job', async () => {
    const ctx: ToolExecutionContext = {
      supabase: {} as any,
      accountId: 'acc-test',
      userId: 'user-test',
      role: 'owner',
    };

    await expect(
      executeAssistantTool('log_job_expense', { amount: 150, description: 'Lumber' }, ctx),
    ).rejects.toThrow('No target job specified or detected on screen');
  });

  it('throws when log_job_expense is called with 0 or negative amount', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'job-1', ref: 'J-101', client_name: 'Bob' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any;

    const ctx: ToolExecutionContext = {
      supabase: mockSupabase,
      accountId: 'acc-test',
      userId: 'user-test',
      role: 'owner',
      activeRecord: { type: 'job', id: 'job-1' },
    };

    await expect(
      executeAssistantTool('log_job_expense', { amount: 0, description: 'Lumber' }, ctx),
    ).rejects.toThrow('Expense amount must be greater than $0.00.');
  });
});
