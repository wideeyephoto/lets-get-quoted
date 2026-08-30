import Script from 'next/script';
import { cspNonce } from '@/lib/csp-nonce';
import { getGoogleTagId } from '@/lib/google-tag';

/**
 * Global Google Tag (gtag.js) for Let's Get Quoted.
 *
 * Loads after hydration so analytics never blocks the application. next/script
 * also creates these elements client-side, avoiding React's false hydration
 * warning when browsers hide a server-rendered script's nonce attribute.
 */
export default function GoogleTag() {
  const tagId = getGoogleTagId();
  const nonce = cspNonce();

  if (!tagId) return null;

  const initScript = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
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
