import Script from 'next/script';
import { headers } from 'next/headers';
import { cspNonce } from '@/lib/csp-nonce';
import { getGoogleTagId } from '@/lib/google-tag';

export const SENSITIVE_PREFIXES = [
  '/account-suspended',
  '/admin',
  '/auth',
  '/book',
  '/card-saved',
  '/client',
  '/dashboard',
  '/field',
  '/invoice',
  '/login',
  '/office-access',
  '/office-invite',
  '/pay',
  '/portal',
  '/quick-stop',
  '/quickbooks',
  '/review',
  '/schedule',
  '/site-preview-frame',
  '/sub',
  '/track',
  '/unsubscribe',
] as const;

/**
 * Checks if a pathname represents a sensitive, token-bearing, or authenticated route.
 * Fails closed (returns true) if pathname is absent or invalid.
 */
export function isSensitivePath(pathname: string | null | undefined): boolean {
  if (!pathname || typeof pathname !== 'string') return true; // Fail closed
  const normalized = pathname.trim().toLowerCase();
  if (!normalized.startsWith('/')) return true; // Fail closed
  return SENSITIVE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.startsWith(`${prefix}?`)
  );
}

/**
 * Global Google Tag (gtag.js) for Let's Get Quoted.
 *
 * Loads after hydration on public marketing pages only.
 * Suppressed on all token-bearing, sensitive, or authenticated routes.
 * Fails closed when pathname headers are unavailable or when NEXT_PUBLIC_GOOGLE_TAG_ID is unset.
 */
export default async function GoogleTag() {
  const pathname = (await headers()).get('x-pathname');
  if (isSensitivePath(pathname)) {
    return null;
  }

  const tagId = getGoogleTagId();
  const nonce = await cspNonce();

  if (!tagId) return null;

  const initScript = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied'
});
gtag('js', new Date());
gtag('config', '${tagId}');`;

  return (
    <>
      <Script
        id="lgq-google-tag"
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`}
        nonce={nonce}
        strategy="afterInteractive"
      />
      <Script
        id="lgq-google-tag-init"
        nonce={nonce}
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
    </>
  );
}
