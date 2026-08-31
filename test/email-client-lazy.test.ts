import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * A BUILD IS NOT A SEND.
 *
 * lib/email once held `const resend = new Resend(process.env.RESEND_API_KEY)`
 * at module scope. That constructor throws "Missing API key" on undefined, and
 * the module sits in the import graph of /client/jobs/[token], so Next's
 * "Collecting page data" step ran it on every build. Production has the key and
 * built fine; Preview does not, so every preview deployment failed for about a
 * day — reporting an email error on branches that had never touched email.
 *
 * The failure was invisible for 31 days because nothing produced a preview
 * until branch pushes started, and it was invisible to the test suite because
 * vitest.config.ts sets RESEND_API_KEY for every run. Both of those are why
 * this test deletes the variable rather than trusting the ambient one.
 *
 * What is asserted is only that IMPORTING the module is free. Sending without a
 * key must still fail — that is a real misconfiguration, and each send function
 * has its own early return for it.
 */
describe('lib/email is importable without a Resend key', () => {
  const KEY = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = KEY;
    vi.resetModules();
  });

  it('does not construct the client at import time', async () => {
    // The import itself is the assertion: it threw before this was made lazy.
    await expect(import('@/lib/email')).resolves.toBeDefined();
  }, 15_000);

  it('exports its send functions even with no key present', async () => {
    const mod = await import('@/lib/email');
    // A representative few — if the module half-loaded, these would be missing.
    expect(typeof mod.sendInvoiceEmail).toBe('function');
    expect(process.env.RESEND_API_KEY).toBeUndefined();
  }, 15_000);
});
