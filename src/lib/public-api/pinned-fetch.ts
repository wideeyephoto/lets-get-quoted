import 'server-only';

import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

/**
 * A POST that goes to the address we already validated, not to whatever DNS
 * says the second time.
 *
 * validateWebhookUrl resolves the hostname and checks every address it gets
 * back. `fetch` then resolves the SAME hostname again, independently, and
 * connects to whatever that second lookup returns. Between the two there is a
 * window, and the window is the whole attack: a record with a short TTL answers
 * the check with a public address and the connection with a private one. The
 * check passes, the request goes inside the network, and nothing in the
 * validation was wrong at the moment it ran.
 *
 * Node's own https.request takes a `lookup`, so the fix is to stop asking. The
 * hostname is still what TLS verifies against and still what goes in the Host
 * header — only the address the socket connects to is fixed, to the one that
 * was actually inspected.
 *
 * Returns the small part of the Response surface the delivery worker reads,
 * rather than a whole Response, so there is no pretending this is `fetch`.
 */
export type PinnedResponse = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type PinnedRequestInit = {
  method: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  /** The address validateWebhookUrl actually inspected. */
  pinnedIp: string;
  /** Cap on the bytes read back, so a hostile endpoint cannot stream forever. */
  maxResponseBytes?: number;
};

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

export async function postToPinnedAddress(
  url: URL,
  init: PinnedRequestInit,
): Promise<PinnedResponse> {
  const family = isIP(init.pinnedIp);
  if (family !== 4 && family !== 6) {
    throw new Error(`Refusing to connect: "${init.pinnedIp}" is not a literal IP address.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error('Pinned delivery is HTTPS only.');
  }

  const maxBytes = init.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return new Promise<PinnedResponse>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        // `host` drives both the Host header and, by default, the TLS
        // servername — so the certificate is still checked against the name the
        // subscription named, not against the address we pinned.
        host: url.hostname,
        servername: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: init.method,
        headers: { ...init.headers, 'Content-Length': Buffer.byteLength(init.body).toString() },
        // The whole point: resolve to the address already inspected. Node calls
        // this instead of the resolver, so there is no second lookup to race.
        lookup: (_hostname, options, callback) => {
          // net.connect asks for either one address or a list, depending on the
          // `all` flag it passes, and answering in the wrong shape surfaces as
          // "Invalid IP address: undefined" rather than as a bad callback.
          if ((options as { all?: boolean })?.all) {
            (callback as unknown as (err: null, addresses: { address: string; family: number }[]) => void)(
              null,
              [{ address: init.pinnedIp, family }],
            );
            return;
          }
          (callback as (err: null, address: string, family: number) => void)(null, init.pinnedIp, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;

        res.on('data', (chunk: Buffer) => {
          if (truncated) return;
          total += chunk.length;
          if (total > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (total - maxBytes)));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });

        const settle = () => {
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: {
              get: (name: string) => {
                const value = res.headers[name.toLowerCase()];
                return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
              },
            },
            text: async () => Buffer.concat(chunks).toString('utf8'),
          });
        };

        res.on('end', settle);
        // destroy() after the cap fires 'close' rather than 'end'; the response
        // we already have is the one the caller wanted.
        res.on('close', () => { if (truncated) settle(); });
        res.on('error', reject);
      },
    );

    req.setTimeout(init.timeoutMs, () => {
      // Named to match what AbortSignal.timeout produces, because the delivery
      // worker classifies a timeout by `error.name` and a retryable timeout
      // must not be recorded as a generic network failure.
      const timeoutError = new Error(`Webhook delivery timed out after ${init.timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      req.destroy(timeoutError);
    });
    req.on('error', reject);
    req.write(init.body);
    req.end();
  });
}
