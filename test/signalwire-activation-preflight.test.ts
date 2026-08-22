import { afterEach, describe, expect, it } from 'vitest';

import {
  CALLBACK_TOKEN_SHAPE,
  expectedWebhooks,
  parseEnvEntries,
  resolveProvider,
  signalwireConfigResolves,
  supabaseRefOf,
  unreadableMessagingNames,
} from '../scripts/verify-signalwire-activation.mjs';

/**
 * The preflight restates two conditions that live in TypeScript, because it has
 * to run with no build step. Restating is a drift risk, so the first block
 * below holds the restatement against the real thing rather than trusting it.
 */

const SW_KEYS = [
  'SIGNALWIRE_SPACE_URL',
  'SIGNALWIRE_PROJECT_ID',
  'SIGNALWIRE_API_TOKEN',
  'SIGNALWIRE_FROM_NUMBER',
  'SIGNALWIRE_NUMBER_GROUP_ID',
  'LGQ_SMS_PROVIDER',
] as const;

const saved = new Map<string, string | undefined>();
function setEnv(values: Record<string, string | undefined>) {
  for (const key of SW_KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

const COMPLETE = {
  SIGNALWIRE_SPACE_URL: 'example.signalwire.com',
  SIGNALWIRE_PROJECT_ID: '2687f308-939e-4e73-97bd-4edfc0d7fd5a',
  SIGNALWIRE_API_TOKEN: 'PTexample',
  SIGNALWIRE_FROM_NUMBER: '+15555550100',
};

describe('the restated condition agrees with the real one', () => {
  // Every combination that decides whether signalwireConfig() resolves. If
  // somebody adds a required credential to sms-provider.ts and not to the
  // preflight, this is what says so -- otherwise the preflight would cheerfully
  // report a green chain that cannot send.
  const CASES: Array<[string, Record<string, string | undefined>]> = [
    ['complete, with a from number', COMPLETE],
    ['complete, with a number group instead', { ...COMPLETE, SIGNALWIRE_FROM_NUMBER: undefined, SIGNALWIRE_NUMBER_GROUP_ID: 'ng_1' }],
    ['no space url', { ...COMPLETE, SIGNALWIRE_SPACE_URL: undefined }],
    ['no project id', { ...COMPLETE, SIGNALWIRE_PROJECT_ID: undefined }],
    ['no api token', { ...COMPLETE, SIGNALWIRE_API_TOKEN: undefined }],
    ['neither a from number nor a group', { ...COMPLETE, SIGNALWIRE_FROM_NUMBER: undefined }],
    ['nothing at all', {}],
  ];

  it.each(CASES)('%s', async (_label, values) => {
    setEnv(values);
    const { smsProviderConfigFor } = await import('@/lib/sms-provider');
    const real = smsProviderConfigFor('signalwire') !== null;
    expect(signalwireConfigResolves(process.env).ok).toBe(real);
  });
});

describe('an env name the app cannot read', () => {
  it('keeps keys a normal loader would silently drop', () => {
    // The whole reason this parser exists. A dotenv loader discards these,
    // and discarding them is exactly what made the credential invisible.
    const entries = parseEnvEntries('SIGNALWIRE-DEV-2=PTsecret\nSIGNALWIRE_SPACE_URL=x.signalwire.com\n');
    expect(entries.map((e) => e.key)).toEqual(['SIGNALWIRE-DEV-2', 'SIGNALWIRE_SPACE_URL']);
    expect(entries[0].readable).toBe(false);
    expect(entries[1].readable).toBe(true);
  });

  it('reports the hyphenated credential and never its value', () => {
    const found = unreadableMessagingNames(parseEnvEntries('SIGNALWIRE-DEV-2=PTsecret\n'));
    expect(found).toEqual(['SIGNALWIRE-DEV-2']);
    expect(found.join(' ')).not.toContain('PTsecret');
  });

  it('ignores comments, blanks and unrelated names', () => {
    const entries = parseEnvEntries('# SIGNALWIRE-COMMENTED=x\n\nOTHER-THING=1\nSIGNALWIRE-EMPTY=\n');
    expect(unreadableMessagingNames(entries)).toEqual([]);
  });

  it('does not flag a legal name', () => {
    expect(unreadableMessagingNames(parseEnvEntries('SIGNALWIRE_API_TOKEN=PTsecret\n'))).toEqual([]);
  });
});

describe('provider resolution refuses rather than falling back', () => {
  it('an explicit choice whose credentials are missing sends nothing', () => {
    // The dangerous alternative is quietly using the incumbent, which would put
    // customer texts on the wrong number under the wrong A2P registration.
    const out = resolveProvider({ LGQ_SMS_PROVIDER: 'signalwire' }, false, true);
    expect(out.provider).toBeNull();
    expect(out.reason).toContain('refuses rather than falling back');
  });

  it('a typo is an explicit choice, not an unset value', () => {
    expect(resolveProvider({ LGQ_SMS_PROVIDER: 'signalwir' }, true, true).provider).toBeNull();
  });

  it('an empty selector infers the incumbent first', () => {
    expect(resolveProvider({}, true, true).provider).toBe('twilio');
    expect(resolveProvider({}, true, false).provider).toBe('signalwire');
  });

  it('an explicit choice that IS configured wins over the incumbent', () => {
    expect(resolveProvider({ LGQ_SMS_PROVIDER: 'signalwire' }, true, true).provider).toBe('signalwire');
  });
});

describe('the callback URLs the provisioning code will accept', () => {
  it('builds both routes from a bare origin', () => {
    expect(expectedWebhooks('https://app.letsgetquoted.com')).toMatchObject({
      inbound: 'https://app.letsgetquoted.com/api/sms/inbound',
      status: 'https://app.letsgetquoted.com/api/sms/status',
    });
  });

  it('rejects everything secureHttpsCallback rejects', () => {
    // Mirrors src/lib/messaging-number-provisioning.ts: no http, no credentials,
    // no query string, no fragment. The query-string rule is why the 10DLC
    // callback token is a path segment rather than ?token=.
    expect(expectedWebhooks('http://app.letsgetquoted.com')).toBeNull();
    expect(expectedWebhooks('https://user:pw@app.letsgetquoted.com')).toBeNull();
    expect(expectedWebhooks('https://app.letsgetquoted.com/?token=x')).toBeNull();
    expect(expectedWebhooks('https://app.letsgetquoted.com/#f')).toBeNull();
    expect(expectedWebhooks('localhost:3010')).toBeNull();
    expect(expectedWebhooks('')).toBeNull();
  });
});

describe('supabase project refs', () => {
  it('extracts the ref so a foreign project can be named', () => {
    expect(supabaseRefOf('https://uydlabvgauzujdwuqzxq.supabase.co/functions/v1/signalwire-webhook'))
      .toBe('uydlabvgauzujdwuqzxq');
  });

  it('is null for anything else, so a non-supabase URL is not misreported', () => {
    expect(supabaseRefOf('https://app.letsgetquoted.com/api/sms/inbound')).toBeNull();
    expect(supabaseRefOf('')).toBeNull();
  });
});

describe('the 10DLC callback token shape', () => {
  it('matches the shape the provisioning code demands', () => {
    expect(CALLBACK_TOKEN_SHAPE.test('a'.repeat(32))).toBe(true);
    expect(CALLBACK_TOKEN_SHAPE.test('a'.repeat(128))).toBe(true);
    expect(CALLBACK_TOKEN_SHAPE.test('a'.repeat(31))).toBe(false);
    expect(CALLBACK_TOKEN_SHAPE.test('a'.repeat(129))).toBe(false);
    expect(CALLBACK_TOKEN_SHAPE.test(`${'a'.repeat(31)}/`)).toBe(false);
  });
});
