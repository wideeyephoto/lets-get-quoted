import React from 'react';
import { cspNonce } from '@/lib/csp-nonce';
import { getGoogleTagId } from '@/lib/google-tag';

/**
 * Global Google Tag (gtag.js) for Let's Get Quoted.
 *
 * Renders the async gtag script and initialization snippet using the request's
 * CSP nonce to comply with strict-dynamic and nonce-based Content Security Policy.
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
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`}
        nonce={nonce}
      />
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
    </>
  );
}
