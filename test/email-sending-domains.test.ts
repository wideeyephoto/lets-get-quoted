import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractorFrom, sanitizeAddress } from '@/emails/brand';
import {
  validateFromLocalPart,
  normalizeStatus,
  toStoredStatus,
  failureReasonFor,
  filterSafeSendingDnsRecords,
  type SendingDomainRecord,
} from '@/lib/resend-domains';

describe('Customer-Owned Email Sending Domains Contract', () => {
  describe('contractorFrom and sanitizeAddress Header Alignment', () => {
    it('returns the platform address when fromAddress is null or undefined', () => {
      expect(contractorFrom({ businessName: 'Elite Electricians', fromAddress: null })).toBe(
        'Elite Electricians <hello@letsgetquoted.com>',
      );
      expect(contractorFrom({ businessName: 'Elite Electricians' })).toBe(
        'Elite Electricians <hello@letsgetquoted.com>',
      );
    });

    it('returns the tenant address when a valid fromAddress is present', () => {
      expect(
        contractorFrom({
          businessName: 'Elite Electricians',
          fromAddress: 'quotes@eliteelectricians.com',
        }),
      ).toBe('Elite Electricians <quotes@eliteelectricians.com>');
    });

    it('falls back to company brand when businessName is empty or whitespace', () => {
      expect(contractorFrom({ businessName: '', fromAddress: 'quotes@eliteelectricians.com' })).toBe(
        "Let's Get Quoted <quotes@eliteelectricians.com>",
      );
      expect(contractorFrom({ businessName: '   ', fromAddress: null })).toBe(
        "Let's Get Quoted <hello@letsgetquoted.com>",
      );
    });

    it('strips dangerous characters from businessName to prevent header injection', () => {
      expect(
        contractorFrom({
          businessName: 'Bad<script>Name\r\nBcc: evil@phish.com',
          fromAddress: 'quotes@safe.com',
        }),
      ).toBe('BadscriptNameBcc: evil@phish.com <quotes@safe.com>');
    });

    it('refuses dangerous fromAddress payloads and falls back to platform address', () => {
      // CRLF header injection
      expect(sanitizeAddress('evil@x.com>\r\nBcc: victim@y.com')).toBeNull();
      expect(
        contractorFrom({
          businessName: 'Elite Electricians',
          fromAddress: 'evil@x.com>\r\nBcc: victim@y.com',
        }),
      ).toBe('Elite Electricians <hello@letsgetquoted.com>');

      // Angle brackets
      expect(sanitizeAddress('<injected@evil.com>')).toBeNull();

      // Double quotes
      expect(sanitizeAddress('"quotes"@domain.com')).toBeNull();

      // Backslashes
      expect(sanitizeAddress('quotes\\domain@domain.com')).toBeNull();

      // Multiple @ symbols
      expect(sanitizeAddress('a@b@c.com')).toBeNull();

      // Embedded spaces
      expect(sanitizeAddress('quotes @domain.com')).toBeNull();
    });
  });

  describe('Local-part Validation (validateFromLocalPart)', () => {
    it('accepts standard operational prefixes', () => {
      expect(validateFromLocalPart('quotes').valid).toBe(true);
      expect(validateFromLocalPart('hello').valid).toBe(true);
      expect(validateFromLocalPart('billing').valid).toBe(true);
      expect(validateFromLocalPart('service-team').valid).toBe(true);
      expect(validateFromLocalPart('office.dispatch').valid).toBe(true);
    });

    it('refuses RFC 2142 reserved administrative addresses', () => {
      for (const reserved of ['abuse', 'postmaster', 'admin', 'root', 'security', 'webmaster']) {
        const res = validateFromLocalPart(reserved);
        expect(res.valid).toBe(false);
        expect(res.error).toContain('reserved');
      }
    });

    it('refuses malformed or excessively long prefixes', () => {
      expect(validateFromLocalPart('').valid).toBe(false);
      expect(validateFromLocalPart('   ').valid).toBe(false);
      expect(validateFromLocalPart('a'.repeat(33)).valid).toBe(false);
      expect(validateFromLocalPart('-leading').valid).toBe(false);
      expect(validateFromLocalPart('trailing-').valid).toBe(false);
      expect(validateFromLocalPart('has spaces').valid).toBe(false);
      expect(validateFromLocalPart('with@symbol').valid).toBe(false);
    });
  });

  describe('Provider Status Mapping (normalizeStatus)', () => {
    it('preserves recognized status strings', () => {
      expect(normalizeStatus('verified')).toBe('verified');
      expect(normalizeStatus('pending')).toBe('pending');
      expect(normalizeStatus('not_started')).toBe('not_started');
      expect(normalizeStatus('temporary_failure')).toBe('temporary_failure');
    });

    it('maps any unrecognized or novel status to failed, never verified', () => {
      expect(normalizeStatus('unknown_status')).toBe('failed');
      expect(normalizeStatus('partial')).toBe('failed');
      expect(normalizeStatus('')).toBe('failed');
      expect(normalizeStatus(undefined)).toBe('failed');
    });
  });

  describe('Stored Status Mapping (toStoredStatus)', () => {
    // email_sending_domains.status is constrained to pending|verified|failed|
    // disabled. normalizeStatus answers in the PROVIDER's vocabulary, which has
    // two more values, and Resend returns one of them — not_started — for every
    // domain it has just created. Writing the provider status straight to the
    // column raised 23514 on the first write of every connection attempt.
    const PROVIDER_STATUSES = [
      'not_started',
      'pending',
      'verified',
      'failed',
      'temporary_failure',
    ] as const;

    it('never emits a value the status check constraint would reject', () => {
      const allowedByTheColumn = ['pending', 'verified', 'failed', 'disabled'];
      for (const status of PROVIDER_STATUSES) {
        expect(allowedByTheColumn).toContain(toStoredStatus(status));
      }
    });

    it('treats not_started and temporary_failure as pending, not as failure', () => {
      // Both mean "the DNS is not in place yet, keep waiting". Calling either a
      // failure would show a contractor a red banner seconds after they
      // connected, before they have had any chance to add a record.
      expect(toStoredStatus('not_started')).toBe('pending');
      expect(toStoredStatus('temporary_failure')).toBe('pending');
      expect(toStoredStatus('pending')).toBe('pending');
    });

    it('only ever reports verified for a provider-verified domain', () => {
      expect(toStoredStatus('verified')).toBe('verified');
      for (const status of PROVIDER_STATUSES.filter((s) => s !== 'verified')) {
        expect(toStoredStatus(status)).not.toBe('verified');
      }
    });

    it('keeps the transient/absent distinction that the status mapping drops', () => {
      // toStoredStatus collapses temporary_failure into pending, so the reason
      // line is the only place that difference survives for the owner to read.
      expect(failureReasonFor('temporary_failure')).toMatch(/retry/i);
      expect(failureReasonFor('failed')).toMatch(/DKIM/);
      expect(failureReasonFor('verified')).toBeNull();
      expect(failureReasonFor('pending')).toBeNull();
      expect(failureReasonFor('not_started')).toBeNull();
    });
  });

  describe('DNS Record Guard (filterSafeSendingDnsRecords)', () => {
    it('preserves safe subdomain records from Resend', () => {
      const records: SendingDomainRecord[] = [
        {
          type: 'TXT',
          name: 'resend._domainkey.eliteelectricians.com',
          value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...',
          status: 'pending',
        },
        {
          type: 'TXT',
          name: 'send.eliteelectricians.com',
          value: 'v=spf1 include:amazonses.com ~all',
          status: 'pending',
        },
        {
          type: 'MX',
          name: 'send.eliteelectricians.com',
          value: 'feedback-smtp.us-east-1.amazonses.com',
          priority: 10,
          status: 'pending',
        },
      ];

      const { safeRecords, droppedRecords, warnings } = filterSafeSendingDnsRecords(
        records,
        'eliteelectricians.com',
      );

      expect(safeRecords.length).toBe(3);
      expect(droppedRecords.length).toBe(0);
      expect(warnings.length).toBe(0);
    });

    it('refuses and drops hostile apex MX records to prevent destroying existing mail', () => {
      const hostileRecords: SendingDomainRecord[] = [
        {
          type: 'MX',
          name: '@',
          value: 'hostile-mx.badprovider.com',
          priority: 10,
        },
        {
          type: 'MX',
          name: 'eliteelectricians.com',
          value: 'hostile-mx2.badprovider.com',
          priority: 10,
        },
        {
          type: 'TXT',
          name: '@',
          value: 'v=spf1 include:amazonses.com -all',
        },
        {
          type: 'TXT',
          name: 'send.eliteelectricians.com',
          value: 'v=spf1 include:amazonses.com ~all',
        },
      ];

      const { safeRecords, droppedRecords, warnings } = filterSafeSendingDnsRecords(
        hostileRecords,
        'eliteelectricians.com',
      );

      // Only the send. subdomain SPF record should survive
      expect(safeRecords.length).toBe(1);
      expect(safeRecords[0].name).toBe('send.eliteelectricians.com');

      // The apex MX (both '@' and full domain) and apex SPF must be dropped
      expect(droppedRecords.length).toBe(3);
      expect(warnings.length).toBe(3);
      expect(warnings.some((w) => w.includes('apex MX'))).toBe(true);
      expect(warnings.some((w) => w.includes('apex SPF'))).toBe(true);
    });
  });

  describe('Authentication Lockout Invariant: magic-link and crew-auth', () => {
    it('asserts magic-link.ts never imports or calls contractorFrom', () => {
      const magicLinkCode = readFileSync(
        resolve(process.cwd(), 'src/lib/magic-link.ts'),
        'utf8',
      );
      expect(magicLinkCode).not.toContain('contractorFrom');
      expect(magicLinkCode).toContain('@letsgetquoted.com');
    });

    it('asserts crew-auth.ts never imports or calls contractorFrom', () => {
      const crewAuthCode = readFileSync(
        resolve(process.cwd(), 'src/lib/crew-auth.ts'),
        'utf8',
      );
      expect(crewAuthCode).not.toContain('contractorFrom');
      expect(crewAuthCode).toContain('@letsgetquoted.com');
    });
  });

  describe('Write Path Invariant: the conflict target must be inferable', () => {
    const actionsSource = () =>
      readFileSync(
        resolve(process.cwd(), 'src/app/dashboard/settings/email-domain-actions.ts'),
        'utf8',
      );

    /**
     * Comments stripped before matching, deliberately.
     *
     * The first version of the check below asserted the raw file did not
     * contain "onConflict" — and failed, because the comment explaining why the
     * upsert was removed says the word. An absence check that reads prose is
     * not checking the code: it would equally have passed on a file that dropped
     * the comment and kept the call.
     */
    const executableSource = () =>
      actionsSource()
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .join('\n');

    it('never upserts on a conflict target Postgres cannot infer', () => {
      // The only unique index is on lower(domain). `onConflict: 'domain'` emits
      // ON CONFLICT (domain), which cannot be inferred from an expression index,
      // so every connect attempt raised 42P10 — proven against PG17 in
      // scripts/verify-email-sending-domains.mjs.
      const source = executableSource();
      expect(source).not.toMatch(/onConflict/);
      expect(source).not.toMatch(/\.upsert\(/);
    });

    it('strips comments without stripping the code it is asked to check', () => {
      // Guards the helper above: if it ever over-matched and returned an empty
      // or gutted string, every absence assertion in this block would pass
      // vacuously.
      const source = executableSource();
      expect(source).toMatch(/createEmailSendingDomainAction/);
      expect(source).toMatch(/requireOfficeContext\('settings\.write'\)/);
      expect(source.length).toBeGreaterThan(2000);
    });

    it('stores the mapped status rather than the raw provider status', () => {
      const source = actionsSource();
      // The two writes that touch `status` must both route through the mapper;
      // assert the call is present and that the raw provider field is not being
      // assigned to the column.
      expect(source).toMatch(/toStoredStatus\(providerRes\.status\)/);
      expect(source).not.toMatch(/status:\s*providerRes\.status/);
    });
  });
});
