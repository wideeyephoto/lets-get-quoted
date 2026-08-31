export const MAX_PROXY_REDIRECTS = 3;
export const MAX_PROXY_IMAGE_BYTES = 35 * 1024 * 1024; // 35 MB matching lead photo upload limit

/**
 * Returns the set of explicitly allowed hostnames derived from the project's configured Supabase URL.
 */
export function getConfiguredAllowedHosts(): Set<string> {
  const allowed = new Set<string>();
  const envUrls = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ].filter(Boolean);

  for (const urlStr of envUrls) {
    try {
      const parsed = new URL(urlStr!);
      if (parsed.hostname) {
        allowed.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // ignore invalid URL in env
    }
  }

  return allowed;
}

/**
 * Validates that a target URL is strictly safe for proxying:
 * - Must be http/https
 * - Must not contain embedded userinfo/credentials
 * - Must not target cloud metadata, loopback, or private IP ranges
 * - Must strictly match the configured Supabase project domain
 * - Remote production targets must use HTTPS
 */
export function isAllowedProxyUrl(targetUrl: URL): boolean {
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
    return false;
  }

  if (targetUrl.username || targetUrl.password) {
    return false;
  }

  const hostname = targetUrl.hostname.toLowerCase();

  // Reject loopback, link-local, private IP ranges, and cloud metadata services
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^127\./.test(hostname) ||
    /^0\./.test(hostname) ||
    /^fc00:/i.test(hostname) ||
    /^fe80:/i.test(hostname) ||
    /^::ffff:/i.test(hostname)
  ) {
    // Only allow localhost/127.0.0.1 if explicitly configured in NEXT_PUBLIC_SUPABASE_URL for local development
    const allowedHosts = getConfiguredAllowedHosts();
    if (
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      allowedHosts.has(hostname)
    ) {
      return true;
    }
    return false;
  }

  // Remote hostnames MUST strictly match this project's configured Supabase domain.
  // Wildcard *.supabase.co is prohibited to prevent other Supabase tenants from acting as SSRF relays.
  const allowedHosts = getConfiguredAllowedHosts();
  if (!allowedHosts.has(hostname)) {
    return false;
  }

  // Remote connections must use HTTPS
  if (targetUrl.protocol !== 'https:') {
    return false;
  }

  return true;
}

/**
 * Fetches an image with manual redirect resolution and strict re-validation of each hop.
 */
export async function fetchProxyImage(initialUrl: URL): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  contentType?: string;
  buffer?: ArrayBuffer;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop++) {
    if (!isAllowedProxyUrl(currentUrl)) {
      return {
        ok: false,
        status: 403,
        error: 'Host or redirect target is not allowed for proxying',
      };
    }

    let res: Response;
    try {
      res = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual', // Prevent automatic following of unvalidated redirects
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8',
        },
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      return { ok: false, status: 502, error: `Failed to reach target host: ${msg}` };
    }

    // Handle 3xx redirects manually with re-validation
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        return { ok: false, status: 502, error: 'Redirect missing Location header' };
      }
      if (hop === MAX_PROXY_REDIRECTS) {
        return { ok: false, status: 508, error: 'Too many redirects' };
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, status: 502, error: 'Invalid redirect target URL' };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: 'Failed to fetch source image' };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
      return { ok: false, status: 415, error: 'Target URL is not a valid image' };
    }

    const contentLengthStr = res.headers.get('content-length');
    if (contentLengthStr) {
      const len = Number.parseInt(contentLengthStr, 10);
      if (Number.isFinite(len) && len > MAX_PROXY_IMAGE_BYTES) {
        return { ok: false, status: 413, error: 'Image exceeds maximum allowed size' };
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PROXY_IMAGE_BYTES) {
      return { ok: false, status: 413, error: 'Image exceeds maximum allowed size' };
    }

    return {
      ok: true,
      status: 200,
      contentType: contentType || 'image/jpeg',
      buffer: arrayBuffer,
    };
  }

  return { ok: false, status: 508, error: 'Too many redirects' };
}
