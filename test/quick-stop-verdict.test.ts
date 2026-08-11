import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeQuickStopVerdictToken,
  readQuickStopVerdictToken,
  VERDICT_TTL_MS,
  type QuickStopVerdictFacts,
} from '@/lib/quick-stop-verdict';
import { reaffirmQualification, screenerVerdict, type QuickStopQualification } from '@/lib/quick-stop-qualify';

const ACCOUNT = 'd3202ae8-5b13-441c-8a34-d7beec8a3250';
const OTHER_ACCOUNT = '11111111-2222-3333-4444-555555555555';

const FACTS: QuickStopVerdictFacts = {
  issue: 'A limb came down off the maple and is lying across the front bed',
  startedWhen: 'Last night',
  worsening: 'no',
  propertyType: 'house',
};

function approved(over: Partial<QuickStopQualification> = {}): QuickStopQualification {
  return {
    eligible: true,
    unsafe: false,
    summary: 'Remove a fallen limb from the front bed',
    visitMinutes: 30,
    complexity: 'simple',
    confidence: 0.8,
    exclusions: [],
    safety: null,
    reason: null,
    decidedBy: 'ai',
    ...over,
  };
}

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

describe('the verdict token carries a real answer back', () => {
  it('round-trips an AI approval for the same account and the same job', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    expect(token).toBeTruthy();
    const back = readQuickStopVerdictToken(token, ACCOUNT, FACTS);
    expect(back?.eligible).toBe(true);
    expect(back?.visitMinutes).toBe(30);
    expect(back?.summary).toBe('Remove a fallen limb from the front bed');
  });

  it('round-trips a refusal too — a remembered "no" is just as binding', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved({ eligible: false, exclusions: ['Too complex for a short visit'], reason: 'Too big for one visit.' }));
    const back = readQuickStopVerdictToken(token, ACCOUNT, FACTS);
    expect(back?.eligible).toBe(false);
    expect(back?.reason).toBe('Too big for one visit.');
  });

  it('ignores case and spacing — retyping the same words is not a different job', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    const reformatted: QuickStopVerdictFacts = {
      ...FACTS,
      issue: '  A LIMB came down off the maple   and is lying across the front bed ',
    };
    expect(readQuickStopVerdictToken(token, ACCOUNT, reformatted)?.eligible).toBe(true);
  });
});

describe('the verdict token is not a way in', () => {
  it('is refused for a different contractor', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    expect(readQuickStopVerdictToken(token, OTHER_ACCOUNT, FACTS)).toBeNull();
  });

  it('is refused once the job has been reworded', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    expect(readQuickStopVerdictToken(token, ACCOUNT, { ...FACTS, issue: 'Take the whole maple down' })).toBeNull();
  });

  it('is refused when any of the scoping answers changed', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    expect(readQuickStopVerdictToken(token, ACCOUNT, { ...FACTS, worsening: 'yes' })).toBeNull();
    expect(readQuickStopVerdictToken(token, ACCOUNT, { ...FACTS, propertyType: 'commercial' })).toBeNull();
    expect(readQuickStopVerdictToken(token, ACCOUNT, { ...FACTS, startedWhen: 'Three weeks ago' })).toBeNull();
  });

  it('expires', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved());
    const now = Date.now();
    expect(readQuickStopVerdictToken(token, ACCOUNT, FACTS, now + VERDICT_TTL_MS - 1000)?.eligible).toBe(true);
    expect(readQuickStopVerdictToken(token, ACCOUNT, FACTS, now + VERDICT_TTL_MS + 1000)).toBeNull();
  });

  it('is refused when the signature does not match the payload', () => {
    const token = makeQuickStopVerdictToken(ACCOUNT, FACTS, approved()) as string;
    const [payload, signature] = token.split('.');
    // Same signature, a payload that now claims eligibility on a longer visit.
    const forged = Buffer.from(JSON.stringify({ account: ACCOUNT, facts: 'x', issued: Date.now(), qualification: approved({ visitMinutes: 480 }) }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(readQuickStopVerdictToken(`${forged}.${signature}`, ACCOUNT, FACTS)).toBeNull();
    expect(readQuickStopVerdictToken(`${payload}.notasignature`, ACCOUNT, FACTS)).toBeNull();
  });

  it('is refused for empty, malformed and non-string input', () => {
    for (const bad of ['', 'nodot', '.', 'a.', null, undefined]) {
      expect(readQuickStopVerdictToken(bad as string | null, ACCOUNT, FACTS)).toBeNull();
    }
  });

  it('is never minted for a screener verdict or an unavailable one', () => {
    // Both are cheap or wrong to remember: the screener is deterministic and
    // will agree with itself for free, and 'unavailable' is a failure that
    // should be retried rather than cached.
    expect(makeQuickStopVerdictToken(ACCOUNT, FACTS, approved({ decidedBy: 'screener', eligible: false }))).toBeNull();
    expect(makeQuickStopVerdictToken(ACCOUNT, FACTS, approved({ decidedBy: 'unavailable' }))).toBeNull();
    expect(makeQuickStopVerdictToken('', FACTS, approved())).toBeNull();
  });
});

describe('reaffirmQualification — a token skips the AI, never the safety net', () => {
  const clean = 'A limb came down off the maple \n Last night \n house \n Any time after 2pm';

  it('leaves a clean approval exactly as it was', () => {
    const cached = approved();
    expect(reaffirmQualification(cached, clean, { maxVisitMinutes: 60 })).toEqual(cached);
  });

  it('overrides an approval when the text added since trips an unsafe rule', () => {
    // Availability is typed AFTER the check and the screener reads it. This is
    // the one thing a remembered "yes" must never be able to carry through.
    const out = reaffirmQualification(approved(), `${clean} \n also I smell gas near the meter`, { maxVisitMinutes: 60 });
    expect(out.eligible).toBe(false);
    expect(out.unsafe).toBe(true);
    expect(out.safety).toBeTruthy();
    expect(out.decidedBy).toBe('screener');
  });

  it('overrides an approval when the added text is out of scope', () => {
    const out = reaffirmQualification(approved(), `${clean} \n it will need a crew of three`, { maxVisitMinutes: 60 });
    expect(out.eligible).toBe(false);
    expect(out.unsafe).toBe(false);
    expect(out.exclusions).toContain('Multi-worker job');
  });

  it('re-applies the account visit-minute limit, so a verdict cannot outlive it', () => {
    const out = reaffirmQualification(approved({ visitMinutes: 45 }), clean, { maxVisitMinutes: 30 });
    expect(out.eligible).toBe(false);
    expect(out.exclusions).toEqual(['Longer than your 30-minute Quick Stop limit']);
    expect(out.reason).toMatch(/30-minute visit/);
  });

  it('does not resurrect a remembered refusal just because the text is clean', () => {
    const cached = approved({ eligible: false, exclusions: ['Too complex for a short visit'], reason: 'Too big.' });
    expect(reaffirmQualification(cached, clean, { maxVisitMinutes: 60 }).eligible).toBe(false);
  });

  it('screenerVerdict returns null when there is nothing to object to', () => {
    expect(screenerVerdict(clean, 'A limb came down')).toBeNull();
  });
});

describe('the flow is wired end to end', () => {
  it('the qualify route mints and returns a token', () => {
    const source = read('src', 'app', 'api', 'public', 'leads', 'quick-stop-qualify', 'route.ts');
    expect(source).toContain('makeQuickStopVerdictToken');
    expect(source).toMatch(/verdictToken/);
  });

  it('the booking form sends the token back on submit', () => {
    const source = read('src', 'app', 'book', '[subdomain]', 'QuickStopFlow.tsx');
    expect(source).toContain("fd.set('verdictToken'");
  });

  it('the submit action reads the token and only re-qualifies without one', () => {
    const source = read('src', 'app', 'book', '[subdomain]', 'actions.ts');
    expect(source).toContain('readQuickStopVerdictToken');
    // The AI pass must sit on the false branch of "did we remember an answer".
    expect(source).toMatch(/remembered\s*\?\s*reaffirmQualification[\s\S]{0,200}:\s*await qualifyQuickStop/);
  });

  it('the screening is still logged whichever way the verdict was reached', () => {
    // The owner's insights panel counts refusals; a remembered verdict that
    // skipped the log would quietly stop counting them.
    const source = read('src', 'app', 'book', '[subdomain]', 'actions.ts');
    const submit = source.slice(source.indexOf('export async function submitQuickStopRequestAction'));
    const qualified = submit.indexOf('const qualification =');
    const logged = submit.indexOf('recordQuickStopScreening');
    const returned = submit.indexOf('if (!qualification.eligible)');
    expect(qualified).toBeGreaterThan(-1);
    expect(logged).toBeGreaterThan(qualified);
    expect(returned).toBeGreaterThan(logged);
  });
});

describe('a refusal at the last step announces itself', () => {
  const flow = read('src', 'app', 'book', '[subdomain]', 'QuickStopFlow.tsx');

  it('says the request was not sent, rather than printing a bare reason', () => {
    expect(flow).toContain("Your request wasn&apos;t sent");
    expect(flow).toMatch(/Nothing was booked and your contact details weren&apos;t passed on/);
  });

  it('clears the "looks like a fit" banner when the send is refused', () => {
    const branch = flow.slice(flow.indexOf('result.notAFit'), flow.indexOf('setError(result.error)'));
    expect(branch).toContain('setVerdict(null)');
    expect(branch).toContain('setRefused(result.error)');
  });

  it('offers the door that is still open', () => {
    expect(flow).toContain('Request a regular booking');
  });

  it('a fresh check clears a previous refusal', () => {
    const check = flow.slice(flow.indexOf('async function checkEligibility'), flow.indexOf('async function submit'));
    expect(check).toContain('setRefused(null)');
  });

  it('the action distinguishes a screening refusal from every other failure', () => {
    const source = read('src', 'app', 'book', '[subdomain]', 'actions.ts');
    expect(source).toContain('notAFit: true');
    // Rate limits, duplicates and missing fields stay plain errors.
    expect(source).toMatch(/error: 'Too many requests[^']*' \}/);
    expect(source).not.toMatch(/notAFit: true[\s\S]{0,80}Too many requests/);
  });

  it('has styling that puts the heading first', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('.es-refused-head');
    const lite = readFileSync(join(process.cwd(), 'src', 'app', 'globals-lite.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(lite).toContain('.es-refused-head');
  });
});
