import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import FieldIntakeReviewPage from '@/app/field/intake/[id]/page';
import IntakeApprovalWorkspace from '@/app/field/intake/[id]/IntakeApprovalWorkspace';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_ID = '66666666-6666-4666-8666-666666666666';
const CREW_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_CREW_ID = '88888888-8888-4888-8888-888888888888';

type Row = Record<string, unknown>;
type Seed = {
  rows: Record<string, Row[]>;
  errors?: Record<string, { message: string }>;
};

function makeAdmin(seed: Seed) {
  const selected: Array<{ table: string; columns: string }> = [];
  const queriedTables: string[] = [];
  const appliedFilters: Array<{
    table: string;
    operator: 'eq' | 'is';
    column: string;
    value: unknown;
  }> = [];

  const from = vi.fn((table: string) => {
    queriedTables.push(table);
    const filters: Array<{ column: string; value: unknown }> = [];
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn((columns: string) => {
      selected.push({ table, columns });
      return query;
    });
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      appliedFilters.push({ table, operator: 'eq', column, value });
      return query;
    });
    query.is = vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      appliedFilters.push({ table, operator: 'is', column, value });
      return query;
    });
    query.limit = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => {
      const error = seed.errors?.[table] ?? null;
      if (error) return { data: null, error };
      const data = (seed.rows[table] ?? []).find((row) =>
        filters.every(({ column, value }) => row[column] === value),
      ) ?? null;
      return { data, error: null };
    });
    return query;
  });

  return {
    client: { from },
    queriedTables,
    selected,
    appliedFilters,
  };
}

function task(outcome: Row): Row {
  return {
    id: TASK_ID,
    account_id: ACCOUNT_ID,
    sms_message_id: MESSAGE_ID,
    task_state: 'completed',
    created_at: '2026-09-03T13:06:00.000Z',
    outcome,
  };
}

function setSession(userId: string | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
  } as never);
}

function workspaceProps(element: ReactElement) {
  const child = element.props.children as ReactElement;
  return child.props as {
    rawTranscript: string;
    targetJobId: string | null;
    backHref: string;
    initialItems: Array<{ type: string; status: string; title: string }>;
  };
}

describe('field intake review page authorization and data provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not found before creating a service-role client when no user is signed in', async () => {
    setSession(null);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns not found for a signed-in user who has no role on the task account', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({ intent: 'append_internal_note', target_id: TARGET_ID })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        memberships: [{
          user_id: USER_ID,
          account_id: OTHER_ACCOUNT_ID,
          role: 'owner',
          deactivated_at: null,
        }],
        crew: [],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'private transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.queriedTables).not.toContain('sms_messages');
    expect(db.queriedTables).toContain('accounts');
  });

  it('fails closed for a deactivated owner membership before reading the transcript', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({ intent: 'append_internal_note', target_id: TARGET_ID })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        memberships: [{
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          role: 'owner',
          deactivated_at: '2026-09-03T12:00:00.000Z',
        }],
        crew: [],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'private transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.appliedFilters).toContainEqual({
      table: 'memberships',
      operator: 'is',
      column: 'deactivated_at',
      value: null,
    });
    expect(db.queriedTables).not.toContain('sms_messages');
  });

  it('fails closed for a suspended task account with an otherwise active owner', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({ intent: 'append_internal_note', target_id: TARGET_ID })],
        accounts: [{
          id: ACCOUNT_ID,
          business_name: 'Holbrook Contracting',
          suspended_at: '2026-09-03T12:00:00.000Z',
        }],
        memberships: [{
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          role: 'owner',
          deactivated_at: null,
        }],
        crew: [],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'private transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.appliedFilters).toContainEqual({
      table: 'accounts',
      operator: 'is',
      column: 'suspended_at',
      value: null,
    });
    expect(db.queriedTables).not.toContain('sms_messages');
  });

  it('fails closed for a suspended task account with otherwise active exact crew', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({
          intent: 'append_internal_note',
          target_id: TARGET_ID,
          crew_id: CREW_ID,
        })],
        accounts: [{
          id: ACCOUNT_ID,
          business_name: 'Holbrook Contracting',
          suspended_at: '2026-09-03T12:00:00.000Z',
        }],
        memberships: [],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: null,
        }],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'private transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.appliedFilters).toContainEqual({
      table: 'accounts',
      operator: 'is',
      column: 'suspended_at',
      value: null,
    });
    expect(db.queriedTables).not.toContain('sms_messages');
  });

  it('does not authorize account crew when the task outcome has no crew id', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({ intent: 'append_internal_note', target_id: TARGET_ID })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        memberships: [],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: null,
        }],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'owner transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.queriedTables).not.toContain('crew');
    expect(db.queriedTables).not.toContain('sms_messages');
  });

  it('does not authorize a different crew member than the one recorded in the outcome', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({
          intent: 'append_internal_note',
          target_id: TARGET_ID,
          crew_id: OTHER_CREW_ID,
        })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        memberships: [],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: null,
        }],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'other crew transcript' }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    expect(db.appliedFilters).toContainEqual({
      table: 'crew',
      operator: 'eq',
      column: 'id',
      value: OTHER_CREW_ID,
    });
    expect(db.queriedTables).not.toContain('sms_messages');
  });

  it('allows the task-account owner, reads the linked SMS body, and never links a lead as a job', async () => {
    setSession(USER_ID);
    const transcript = 'Create a lead for Rosa at 123 Main';
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({ intent: 'create_lead', target_id: TARGET_ID })],
        memberships: [{
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          role: 'owner',
          deactivated_at: null,
        }],
        crew: [],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: transcript }],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    const page = await FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) });
    const props = workspaceProps(page);

    expect(props.rawTranscript).toBe(transcript);
    expect(props.initialItems[0]).toMatchObject({ type: 'lead', status: 'applied' });
    expect(props.targetJobId).toBeNull();
    expect(props.backHref).toBe('/dashboard/text-to-job');
    expect(db.selected).toContainEqual({ table: 'sms_inbound_action_tasks', columns: 'id, account_id, outcome, task_state, created_at, sms_message_id' });
    expect(db.selected).toContainEqual({ table: 'sms_messages', columns: 'body' });
    expect(db.appliedFilters).toContainEqual({
      table: 'accounts',
      operator: 'is',
      column: 'suspended_at',
      value: null,
    });
    expect(db.appliedFilters).toContainEqual({
      table: 'memberships',
      operator: 'is',
      column: 'deactivated_at',
      value: null,
    });
    expect(db.queriedTables).not.toContain('sms_webhook_receipts');
    expect(db.queriedTables).not.toContain('jobs');
  });

  it('allows an active, non-deleted, non-revoked crew member and verifies the related job account', async () => {
    setSession(USER_ID);
    const db = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({
          intent: 'append_internal_note',
          target_id: TARGET_ID,
          crew_id: CREW_ID,
        })],
        memberships: [],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: null,
        }],
        sms_messages: [{ id: MESSAGE_ID, account_id: ACCOUNT_ID, body: 'Finished the drywall' }],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        jobs: [{ id: TARGET_ID, account_id: ACCOUNT_ID }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);

    const page = await FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) });
    const props = workspaceProps(page);

    expect(props.targetJobId).toBe(TARGET_ID);
    expect(props.backHref).toBe('/field');
    expect(props.initialItems[0]).toMatchObject({ type: 'note', status: 'applied' });
    expect(db.appliedFilters).toContainEqual({
      table: 'crew',
      operator: 'eq',
      column: 'id',
      value: CREW_ID,
    });
  });

  it('fails closed for revoked crew and for an owner-membership lookup error', async () => {
    setSession(USER_ID);
    const revoked = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({
          intent: 'append_internal_note',
          target_id: TARGET_ID,
          crew_id: CREW_ID,
        })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        memberships: [],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: '2026-09-03T12:00:00.000Z',
        }],
      },
    });
    vi.mocked(createAdminClient).mockReturnValueOnce(revoked.client as never);
    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');

    const lookupFailure = makeAdmin({
      rows: {
        sms_inbound_action_tasks: [task({
          intent: 'append_internal_note',
          target_id: TARGET_ID,
          crew_id: CREW_ID,
        })],
        accounts: [{ id: ACCOUNT_ID, business_name: 'Holbrook Contracting', suspended_at: null }],
        crew: [{
          id: CREW_ID,
          user_id: USER_ID,
          account_id: ACCOUNT_ID,
          active: true,
          deleted_at: null,
          access_revoked_at: null,
        }],
      },
      errors: { memberships: { message: 'membership lookup failed' } },
    });
    vi.mocked(createAdminClient).mockReturnValueOnce(lookupFailure.client as never);
    await expect(FieldIntakeReviewPage({ params: Promise.resolve({ id: TASK_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('field intake result UI', () => {
  it('shows the already-applied result without fake Approve or Undo controls', () => {
    const html = renderToStaticMarkup(createElement(IntakeApprovalWorkspace, {
      rawTranscript: 'Log $85 copper on the Smith job',
      createdAt: '01:06 PM · Today',
      senderRole: 'Owner / Crew Field Intake',
      businessName: 'Holbrook Contracting',
      targetJobId: TARGET_ID,
      backHref: '/dashboard/text-to-job',
      backLabel: 'Back to Text-to-Job',
      initialItems: [{
        id: 'item-1',
        type: 'cost',
        title: 'Material / Expense Cost',
        status: 'applied',
      }],
    }));

    expect(html).toContain('already applied');
    expect(html).not.toContain('atomically');
    expect(html).toContain(`/dashboard/jobs/${TARGET_ID}`);
    expect(html).not.toContain('Approve All Inputs');
    expect(html).not.toContain('Undo');
  });
});
