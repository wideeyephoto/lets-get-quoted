import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ACTIONS = readFileSync(join(ROOT, 'src/app/dashboard/messages/actions.ts'), 'utf8');
const SMS = readFileSync(join(ROOT, 'src/lib/sms.ts'), 'utf8');

function exportedBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} export`).toBeGreaterThan(-1);
  const end = source.indexOf('\nexport ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

describe('Messages consent boundary', () => {
  it('never manufactures consent from a reply URL and requires durable thread evidence', () => {
    const body = exportedBody(ACTIONS, 'sendReplyAction');
    expect(body).not.toContain('ensureSmsConsentBaseline(');
    expect(body).toContain('const normalized = normalizeUsPhone(phone)');
    expect(body).toContain('requireExistingThread: true');
    expect(body).not.toContain('recordSmsConsent(');
  });

  it('requires existing current consent for manual compose and does not create it', () => {
    const body = exportedBody(ACTIONS, 'startConversationAction');
    expect(body).toContain('await hasCurrentSmsConsent(');
    expect(body).toContain('requireExistingThread: false');
    expect(body).not.toContain('recordSmsConsent(');
    expect(body).not.toContain('ensureSmsConsentBaseline(');
  });

  it('keeps the generic consent STOP guard in the update itself', () => {
    const body = exportedBody(SMS, 'recordSmsConsent');
    expect(body).toContain(".neq('status', 'opted_out')");
    expect(body.indexOf(".neq('status', 'opted_out')")).toBeLessThan(body.indexOf(".from('sms_consent').insert"));
    expect(body).not.toContain(".from('sms_consent').upsert");
  });

  it('fails manual-compose consent reads closed', () => {
    const body = exportedBody(SMS, 'hasCurrentSmsConsent');
    expect(body).toContain(".from('sms_consent_scopes')");
    expect(body).toContain(".eq('consent_scope', 'customer')");
    expect(body).toContain('if (baseResult.error || scopeResult.error)');
    expect(body).toContain('return false;');
    expect(body).toContain("scopeResult.data?.consent_scope === 'customer'");
    expect(body).toContain("base?.status === 'opted_in'");
    expect(body).toContain('Boolean(base.consented_at)');
    expect(body).toContain('!base.opted_out_at');
  });

  it('baselines recipient-initiated portal and missed-call replies before enqueue', () => {
    for (const name of ['sendClientPortalLinkSms', 'sendMissedCallTextBack']) {
      const body = exportedBody(SMS, name);
      const baseline = body.indexOf('await ensureSmsConsentBaseline(');
      const enqueue = body.indexOf('queueAccountSms({');
      expect(baseline, name).toBeGreaterThan(-1);
      expect(enqueue, name).toBeGreaterThan(baseline);
      expect(body).toContain('if (!(await ensureSmsConsentBaseline(');
    }
    const helper = exportedBody(SMS, 'ensureSmsConsentBaseline');
    expect(helper).toContain("rpc('ensure_sms_consent_baseline_scope'");
    expect(helper).toContain("typeof data !== 'boolean'");
    expect(SMS).toContain("error.code === 'P5112'");
  });

  it('gives the morning sweep a stable business key', () => {
    const sweep = readFileSync(join(ROOT, 'src/lib/arrival-sweep.ts'), 'utf8');
    expect(sweep).toContain('idempotencyKey: `arrival-morning:${job.id}:${today}`');
  });
});
