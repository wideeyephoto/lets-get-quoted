import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type SsrfValidationResult =
  | { safe: true; resolvedIp: string; parsedUrl: URL }
  | { safe: false; reason: string };

/**
 * Checks if an IPv4 address string falls into a private, loopback, link-local, or cloud-metadata range.
 */
export function isPrivateOrRestrictedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IP is considered unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 !== undefined && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Metadata: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (b0 === 100 && b1 !== undefined && b1 >= 64 && b1 <= 127) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && b1 !== undefined && (b1 === 18 || b1 === 19)) return true;

  // 224.0.0.0/4 (Multicast)
  if (b0 !== undefined && b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address string falls into a private, loopback, or link-local range.
 */
export function isPrivateOrRestrictedIpv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim();

  // Loopback & unspecified
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1' || clean === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6, in BOTH spellings — and the hex one is the spelling that
  // actually shows up.
  //
  // `::ffff:192.168.1.1` is the readable form, and it was the only one handled
  // here. Nothing emits it: `new URL('https://[::ffff:127.0.0.1]/').hostname`
  // normalizes to `[::ffff:7f00:1]`, and `dns.lookup` returns the hex form too
  // (measured: an AAAA record for a mapped address comes back as
  // `::ffff:a9fe:a9fe`, family 6). So the dotted branch below was the only one
  // that ever ran, and every real mapped address fell past it to the fc/fd/fe8
  // checks, matched none of them, and was reported SAFE.
  //
  // That meant `::ffff:a9fe:a9fe` — 169.254.169.254, the cloud metadata
  // address this file exists to block — validated as a public host, as did
  // `::ffff:7f00:1` (127.0.0.1) and `::ffff:c0a8:0101` (192.168.1.1). A
  // hostname with such an AAAA record is all it took; the kernel routes a
  // mapped address to the IPv4 host.
  if (clean.startsWith('::ffff:')) {
    const v4Candidate = clean.slice(7);

    // Dotted form: ::ffff:192.168.1.1
    if (isIP(v4Candidate) === 4) {
      return isPrivateOrRestrictedIpv4(v4Candidate);
    }

    // Hex form: ::ffff:c0a8:0101 -> 192.168.1.1
    const hextets = v4Candidate.split(':');
    if (hextets.length === 2 && hextets.every((h) => /^[0-9a-f]{1,4}$/.test(h))) {
      const high = Number.parseInt(hextets[0]!, 16);
      const low = Number.parseInt(hextets[1]!, 16);
      const dotted = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
      return isPrivateOrRestrictedIpv4(dotted);
    }

    // A `::ffff:` prefix we cannot decode is not a prefix we can clear.
    return true;
  }

  // NAT64 (64:ff9b::/96) embeds an IPv4 address the same way and reaches it
  // through a translator, so it gets the same treatment rather than a pass.
  if (clean.startsWith('64:ff9b::')) {
    return true;
  }

  // Unique Local (fc00::/7 -> fc.. or fd..)
  if (clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }

  // Link-Local (fe80::/10 -> fe8, fe9, fea, feb)
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
    return true;
  }

  // Multicast (ff00::/8)
  if (clean.startsWith('ff')) {
    return true;
  }

  // Uncompressed IPv4-mapped: 0:0:0:0:0:ffff:XXXX:XXXX — canonicalize to
  // ::ffff: and re-check so the hex-form decoder above handles it.
  const uncompressedMapped = clean.match(
    /^0{1,4}(?::0{1,4}){4}:ffff:([0-9a-f]{1,4}:[0-9a-f]{1,4})$/,
  );
  if (uncompressedMapped) {
    return isPrivateOrRestrictedIpv6(`::ffff:${uncompressedMapped[1]}`);
  }

  // IPv4-compatible (deprecated, ::XXXX:XXXX without ffff) — e.g. ::7f00:1 is
  // 127.0.0.1. These are routed to the embedded IPv4 host by the kernel.
  const compatMatch = clean.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (compatMatch) {
    const high = Number.parseInt(compatMatch[1]!, 16);
    const low = Number.parseInt(compatMatch[2]!, 16);
    const dotted = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    return isPrivateOrRestrictedIpv4(dotted);
  }

  return false;
}

/**
 * Convenience helper to test if any IPv4 or IPv6 address is private/restricted.
 */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateOrRestrictedIpv4(ip);
  if (version === 6) return isPrivateOrRestrictedIpv6(ip);
  return true;
}

/**
 * Validates a target webhook URL against comprehensive SSRF rules.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<SsrfValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, reason: 'Invalid URL format.' };
  }

  // 1. Enforce HTTPS only
  if (parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Only HTTPS URLs are permitted for webhook subscriptions.' };
  }

  // 2. Reject embedded credentials (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'Webhook URLs must not contain embedded username or password credentials.' };
  }

  // 3. Port restrictions: default HTTPS port 443 only
  const port = parsed.port;
  if (port && port !== '443') {
    return { safe: false, reason: `Port "${port}" is forbidden. Only port 443 is permitted.` };
  }

  // `URL.hostname` keeps the brackets on an IPv6 literal — `https://[::1]/`
  // reads back as `[::1]`, which `isIP` rejects. Without stripping them the
  // IPv6 branch below never runs and the address falls through to a DNS lookup
  // of the literal string, which only happens to fail closed. Strip them so the
  // check that is meant to catch these is the one that does.
  const hostname = parsed.hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');

  // 4. Deny localhost and cloud metadata domains explicitly
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    return { safe: false, reason: 'Target host is a reserved or internal domain.' };
  }

  // 5. If hostname is a direct IP
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateOrRestrictedIpv4(hostname)) {
      return { safe: false, reason: 'Target IP is within a private, loopback, or cloud-metadata network range.' };
    }
    return { safe: true, resolvedIp: hostname, parsedUrl: parsed };
  }
  if (ipVersion === 6) {
    if (isPrivateOrRestrictedIpv6(hostname)) {
      return { safe: false, reason: 'Target IPv6 is within a private, loopback, or link-local range.' };
    }
    return { safe: true, resolvedIp: hostname, parsedUrl: parsed };
  }

  // 6. DNS Resolution validation
  try {
    const dnsRecords = await lookup(hostname, { all: true });
    if (!dnsRecords || dnsRecords.length === 0) {
      return { safe: false, reason: 'Host could not be resolved via DNS.' };
    }

    for (const record of dnsRecords) {
      if (record.family === 4 && isPrivateOrRestrictedIpv4(record.address)) {
        return { safe: false, reason: `Host resolves to restricted private/internal IP address (${record.address}).` };
      }
      if (record.family === 6 && isPrivateOrRestrictedIpv6(record.address)) {
        return { safe: false, reason: `Host resolves to restricted private/internal IPv6 address (${record.address}).` };
      }
    }

    return { safe: true, resolvedIp: dnsRecords[0]!.address, parsedUrl: parsed };
  } catch (dnsError) {
    return {
      safe: false,
      reason: `DNS lookup failed for host ${hostname}: ${dnsError instanceof Error ? dnsError.message : 'Unknown DNS error'}`,
    };
  }
}
