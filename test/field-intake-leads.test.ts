import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSmsFieldLeads } from '@/lib/field-intake-leads';
import { createAdminClient } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('loadSmsFieldLeads', () => {
  const accountId = 'acct-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries completed create_lead tasks and joins leads with tenant isolation', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        sms_message_id: 'sms-msg-1',
        task_state: 'completed',
        created_at: '2026-09-04T12:00:00Z',
        outcome: {
          intent: 'create_lead',
          target_id: 'lead-uuid-456',
        },
        sms_messages: {
          body: 'New lead Dave Miller 2485550199 roof leak estimate',
          phone_number: '+12485559876',
        },
      },
    ];

    const mockLeads = [
      {
        id: 'lead-uuid-456',
        name: 'Dave Miller',
        phone: '+12485550199',
        address: '742 Evergreen Terr',
        message: 'roof leak estimate',
        status: 'new',
        created_at: '2026-09-04T12:00:05Z',
      },
    ];

    // Build chainable mocks
    const taskLimit = vi.fn().mockResolvedValue({ data: mockTasks, error: null });
    const taskOrder = vi.fn().mockReturnValue({ limit: taskLimit });
    const taskFilter = vi.fn().mockReturnValue({ order: taskOrder });
    const taskEqState = vi.fn().mockReturnValue({ filter: taskFilter });
    const taskEqAccount = vi.fn().mockReturnValue({ eq: taskEqState });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEqAccount });

    const leadIn = vi.fn().mockResolvedValue({ data: mockLeads, error: null });
    const leadEqAccount = vi.fn().mockReturnValue({ in: leadIn });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqAccount });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_inbound_action_tasks') {
          return { select: taskSelect };
        }
        if (table === 'leads') {
          return { select: leadSelect };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const results = await loadSmsFieldLeads(accountId);

    // Verify task query contracts
    expect(mockAdmin.from).toHaveBeenCalledWith('sms_inbound_action_tasks');
    expect(taskSelect).toHaveBeenCalledWith('id, sms_message_id, outcome, created_at, sms_messages(body, phone_number)');
    expect(taskEqAccount).toHaveBeenCalledWith('account_id', accountId);
    expect(taskEqState).toHaveBeenCalledWith('task_state', 'completed');
    expect(taskFilter).toHaveBeenCalledWith('outcome->>intent', 'eq', 'create_lead');
    expect(taskOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(taskLimit).toHaveBeenCalledWith(20);

    // Verify tenant-scoped lead query
    expect(mockAdmin.from).toHaveBeenCalledWith('leads');
    expect(leadSelect).toHaveBeenCalledWith('id, name, phone, address, message, status, created_at');
    expect(leadEqAccount).toHaveBeenCalledWith('account_id', accountId);
    expect(leadIn).toHaveBeenCalledWith('id', ['lead-uuid-456']);

    // Verify mapped lead record
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      leadId: 'lead-uuid-456',
      leadName: 'Dave Miller',
      phone: '+12485550199',
      address: '742 Evergreen Terr',
      message: 'roof leak estimate',
      rawSmsText: 'New lead Dave Miller 2485550199 roof leak estimate',
      senderPhone: '+12485559876',
      status: 'new',
      createdAt: '2026-09-04T12:00:05Z',
    });
  });

  it('returns empty array when no tasks are found', async () => {
    const taskLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              filter: vi.fn(() => ({
                order: vi.fn(() => ({ limit: taskLimit })),
              })),
            })),
          })),
        })),
      })),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const results = await loadSmsFieldLeads(accountId);
    expect(results).toEqual([]);
    expect(mockAdmin.from).not.toHaveBeenCalledWith('leads');
  });

  it('returns empty array when tasks have no target_id in outcome jsonb', async () => {
    const mockTasks = [
      {
        id: 'task-no-target',
        outcome: { intent: 'create_lead' },
        created_at: '2026-09-04T12:00:00Z',
        sms_messages: null,
      },
    ];

    const taskLimit = vi.fn().mockResolvedValue({ data: mockTasks, error: null });
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              filter: vi.fn(() => ({
                order: vi.fn(() => ({ limit: taskLimit })),
              })),
            })),
          })),
        })),
      })),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const results = await loadSmsFieldLeads(accountId);
    expect(results).toEqual([]);
    expect(mockAdmin.from).not.toHaveBeenCalledWith('leads');
  });

  it('handles database query errors gracefully by logging and returning []', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const taskLimit = vi.fn().mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              filter: vi.fn(() => ({
                order: vi.fn(() => ({ limit: taskLimit })),
              })),
            })),
          })),
        })),
      })),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const results = await loadSmsFieldLeads(accountId);
    expect(results).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Text-to-Job field lead tasks unreadable:', { message: 'relation does not exist' });

    errorSpy.mockRestore();
  });

  it('handles missing lead row gracefully by applying sensible fallbacks', async () => {
    const mockTasks = [
      {
        id: 'task-orphan',
        outcome: { intent: 'create_lead', target_id: 'missing-lead-id' },
        created_at: '2026-09-04T11:00:00Z',
        sms_messages: { body: 'Inbound memo from field', phone_number: '+12485551111' },
      },
    ];

    const taskLimit = vi.fn().mockResolvedValue({ data: mockTasks, error: null });
    const leadIn = vi.fn().mockResolvedValue({ data: [], error: null });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_inbound_action_tasks') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  filter: vi.fn(() => ({
                    order: vi.fn(() => ({ limit: taskLimit })),
                  })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: leadIn,
            })),
          })),
        };
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const results = await loadSmsFieldLeads(accountId);
    expect(results).toHaveLength(1);
    expect(results[0].leadName).toBe('New Prospect');
    expect(results[0].status).toBe('new');
    expect(results[0].createdAt).toBe('2026-09-04T11:00:00Z');
    expect(results[0].rawSmsText).toBe('Inbound memo from field');
  });
});
