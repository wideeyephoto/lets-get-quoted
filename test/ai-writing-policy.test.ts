import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_WRITING_CALLS_REQUIRING_ACCOUNT,
  UNDECIDED_KINDS,
  billsAiWritingDrafts,
  type AiWritingKind,
} from '@/lib/ai-writing-policy';
import {
  AI_WRITING_GATE_FLAG,
  AI_WRITING_METER_FLAG,
  AI_WRITING_RESOURCE_CODE,
  aiWritingMode,
  beginAiWritingUsage,
} from '@/lib/billing/ai-writing-usage';

/**
 * Which model calls a contractor pays for. Pricing assertions, not
 * implementation ones - changing one should require deciding to.
 */

const src = readFileSync(join(process.cwd(), 'src/lib/ai-writing-policy.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const bills = (kind: AiWritingKind, accountId: string | null = ACCOUNT) =>
  billsAiWritingDrafts({ accountId, kind });

describe('what a draft credit is spent on', () => {
  it('charges for the drafts the allowance is named after', () => {
    expect(bills('quote_draft')).toBe(true);
    expect(bills('change_order_draft')).toBe(true);
    expect(bills('marketing_draft')).toBe(true);
  });

  it('does not charge for a guard the contractor never asked for', () => {
    // Billing a safety check is how a safety check gets switched off.
    expect(bills('guard')).toBe(false);
  });

  it('does not charge for transcription or routing', () => {
    expect(bills('transcription')).toBe(false);
    expect(bills('qualifier')).toBe(false);
  });

  it('never charges a contractor for LGQ writing its own blog', () => {
    expect(bills('platform_content')).toBe(false);
  });

  it('never charges without a workspace to charge', () => {
    expect(bills('quote_draft', null)).toBe(false);
  });
});

describe('the answer that is a placeholder, not a decision', () => {
  it('does not yet charge for import assistance', () => {
    expect(bills('import_assist')).toBe(false);
    expect(bills('site_copy')).toBe(false);
    expect([...UNDECIDED_KINDS]).toEqual(['import_assist', 'site_copy']);
  });

  it('defaults it to exempt rather than billed', () => {
    for (const kind of UNDECIDED_KINDS) expect(code).toMatch(new RegExp(`${kind}:\\s*false`));
  });
});

describe('the gap that would otherwise be silent', () => {
  it('names the modules whose kind bills but which have no account yet', () => {
    // A billable generation with a null account does not bill and looks exactly
    // like one that is exempt on purpose. That is why the list is written down.
    expect([...AI_WRITING_CALLS_REQUIRING_ACCOUNT].sort())
      .toEqual(['change-order-ai.ts', 'marketing-draft.ts']);
  });

  it('decides billing in one table and nowhere else', () => {
    expect(code.match(/const BILLABLE/g) ?? []).toHaveLength(1);
    expect(code).not.toContain('process.env');
  });

  it('is required at the egress point, so nothing can generate unclassified', () => {
    const caller = readFileSync(join(process.cwd(), 'src/lib/ai-model-call.ts'), 'utf8');
    expect(caller).toContain('context: AiWritingContext,');
    expect(caller).not.toContain('context?: AiWritingContext');
  });

  it('leaves only the two known places that talk to the model', () => {
    // The point of callModel: ten modules each holding their own fetch is fine
    // until something has to be true of every model call, and drafts are sold
    // per generation. A new module reaching for the endpoint directly would
    // bill nothing and nobody would notice - which is what this catches.
    //
    // AI Intake is the deliberate exception, and writing it down is the whole
    // reason this list is exact rather than a count. That route bills a
    // different resource entirely (`ai_intake_threads`, via ai-intake-usage.ts,
    // not writing drafts), and it wraps its fetch in a per-request provider
    // attempt budget that callModel has no notion of. Routing it through here
    // would mean teaching callModel about a meter it does not own.
    const files = readdirSync(join(process.cwd(), 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f): f is string => typeof f === 'string' && /\.(ts|tsx)$/.test(f));
    const direct = files
      .filter((f) => readFileSync(join(process.cwd(), 'src', f), 'utf8').includes('api.openai.com'))
      .map((f) => f.replace(/\\/g, '/'))
      .sort();
    expect(direct).toEqual([
      'app/api/public/leads/classify-estimate/route.ts',
      'lib/ai-model-call.ts',
    ]);
  });
});

describe('measure before enforce', () => {
  it('is off until the meter is on, whatever the gate says', () => {
    expect(aiWritingMode({})).toBe('off');
    expect(aiWritingMode({ [AI_WRITING_GATE_FLAG]: '1' })).toBe('off');
  });

  it('enforces only with both', () => {
    expect(aiWritingMode({ [AI_WRITING_METER_FLAG]: '1' })).toBe('measure');
    expect(aiWritingMode({
      [AI_WRITING_METER_FLAG]: '1', [AI_WRITING_GATE_FLAG]: '1',
    })).toBe('enforce');
  });
});

describe('holding a draft', () => {
  const rpc = vi.fn();
  const admin = { rpc } as never;
  const input = { accountId: ACCOUNT, generationKey: 'gen-1' };
  const insufficient = {
    code: 'P0001',
    message: 'insufficient usage credits for resource ai_writing_drafts (missing 1 units)',
  };

  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('holds one credit per generation', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginAiWritingUsage(admin, input, { mode: 'measure' });
    expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
      p_resource_code: AI_WRITING_RESOURCE_CODE, p_units: 1,
    }));
  });

  it('refuses outright when enforcing and exhausted', async () => {
    // Unlike text credits, this one MAY fail closed: a model call is
    // discretionary and the contractor is sitting in front of it.
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginAiWritingUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused' });
  });

  it('still generates while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginAiWritingUsage(admin, input, { mode: 'measure' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'exhausted_not_enforced' });
  });

  it('touches no ledger while dark', async () => {
    expect(await beginAiWritingUsage(admin, input, { mode: 'off' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'not_metered' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
