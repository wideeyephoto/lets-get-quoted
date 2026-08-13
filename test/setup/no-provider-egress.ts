/**
 * Nothing in the test suite may reach an SMS provider.
 *
 * There is already a gate for this in lib/sms — isLiveMessagingEnvironment() —
 * and it guards exactly ONE of the ~30 send functions. The other twenty-nine
 * check only whether a provider is configured. Today that is safe by accident:
 * the vitest env sets an account sid and a token but no sender, so the config
 * predicate fails and nothing can send. It is one well-meaning
 * `TWILIO_FROM_NUMBER=` in vitest.config.ts away from not being safe, and the
 * person who adds it will be fixing an unrelated test.
 *
 * So this guards the wire instead of the callers. A test that manages to reach
 * a provider host fails on the socket, not on somebody's phone — which is the
 * only version of that guarantee that does not depend on remembering to add a
 * gate to sender number thirty-one.
 *
 * Scoped to the provider hosts rather than blanket-blocking fetch, because
 * fetch has legitimate uses in tests and a guard that breaks them gets deleted.
 */
import { beforeAll } from 'vitest';

const PROVIDER_HOST = /(^|\/\/|\.)(api\.twilio\.com|[^/]*\.signalwire\.com)(\/|:|$)/i;

beforeAll(() => {
  const passthrough = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (PROVIDER_HOST.test(url)) {
      // REJECTS, rather than throwing synchronously. Real fetch reports a
      // network failure through the promise, and the ~30 senders are wrapped in
      // try/catch around an await — a synchronous throw from the call itself
      // would escape several of them and fail tests in a shape that looks
      // nothing like the failure being simulated.
      return Promise.reject(
        new Error(
          `Blocked: a test tried to call an SMS provider (${url}). Assert on buildSendRequest() instead — it returns the URL, headers and body without touching the network.`,
        ),
      );
    }
    return passthrough(input, init);
  }) as typeof fetch;
});
