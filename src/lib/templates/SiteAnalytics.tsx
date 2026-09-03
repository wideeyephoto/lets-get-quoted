'use client';

import { useEffect, useState } from 'react';
import {
  CONSENT_STORAGE_KEY, consentWording, hasAnalytics, normalizeGa4Id, normalizeGoogleAdsId,
  normalizeMetaPixelId, normalizeTiktokPixelId, parseGoogleAdsTarget, readConsent, shouldMeasure,
  type AnalyticsConfig, type ConsentDecision,
} from '@/lib/analytics';
import { getOrCaptureAttribution } from '@/lib/attribution';
import styles from './themes.module.css';

// The contractor's own measurement tags, and the banner that gates them.
//
// NOTHING IS LOADED UNTIL SOMEONE SAYS YES — see lib/analytics for why this
// doesn't use Google Consent Mode. No script, no network request, no cookie
// until the visitor has agreed. A decline is remembered so they aren't asked
// again, and the banner never blocks the page: it sits at the bottom, the site
// behind it stays usable, and there is no overlay.
//
// NO "ACCEPT" WITHOUT AN EQUALLY EASY "NO". Both are real buttons, side by
// side, same size. Dismissing by scrolling past is not consent, so there is no
// close affordance that quietly counts as yes.
//
// This is a client component because every decision it makes — stored consent,
// whether it's in the builder's iframe, what hostname it's on — exists only in
// the browser. Rendering nothing on the server also means the tags can never
// appear in the HTML a crawler sees.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
    ttq?: { load: (id: string) => void; page: () => void; track: (event: string, params?: Record<string, unknown>) => void };
    TiktokAnalyticsObject?: string;
  }
}

let tagsLoaded = false;

function loadTags(config: AnalyticsConfig) {
  // Guarded because a client-side route change re-runs the effect, and loading
  // gtag twice double-counts every pageview after the first.
  if (tagsLoaded) return;
  tagsLoaded = true;

  const ga4 = normalizeGa4Id(config.ga4);
  const googleAdsTarget = parseGoogleAdsTarget(config.googleAdsId ?? '', config.googleAdsConversionLabel);
  const googleAdsTagId = googleAdsTarget?.tagId ?? '';
  const pixel = normalizeMetaPixelId(config.metaPixel);
  const tiktok = normalizeTiktokPixelId(config.tiktokPixel ?? '');

  if (ga4 || googleAdsTagId) {
    window.dataLayer = window.dataLayer || [];
    // `arguments`, not rest parameters, and the lint rule is suppressed rather
    // than satisfied. gtag.js inspects what it finds on dataLayer and expects
    // the array-like `arguments` object; pushing a real Array changes the shape
    // it reads, and the failure is silent — events go in and never arrive.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());

    if (ga4) window.gtag('config', ga4);
    if (googleAdsTagId) {
      window.gtag('config', googleAdsTagId);
      if (googleAdsTarget?.hasConversionLabel && googleAdsTarget.sendTo) {
        (window as unknown as { __lgq_google_ads_send_to?: string }).__lgq_google_ads_send_to = googleAdsTarget.sendTo;
      }
    }

    // Injected by this script, which the CSP nonce already trusts, so
    // 'strict-dynamic' extends that trust here — no host allowlist needed for
    // script-src. The endpoints it then talks to DO need connect-src (lib/csp).
    const primaryId = ga4 || googleAdsTagId;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`;
    document.head.appendChild(s);
  }

  if (pixel) {
    /* eslint-disable */
    (function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      const t = b.createElement(e) as HTMLScriptElement;
      t.async = true; t.src = v;
      b.head.appendChild(t);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq!('init', pixel);
    window.fbq!('track', 'PageView');
  }

  if (tiktok) {
    /* eslint-disable */
    (function (w: any, d: Document, t: string) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = [
        'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias',
        'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent',
      ];
      ttq.setAndDefer = function (t: any, e: any) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t: any) {
        for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e;
      };
      ttq.load = function (e: any, n: any) {
        var r = 'https://analytics.tiktok.com/i18n/pixel/events.js', o = n && n.partner;
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = o || {};
        var a = d.createElement('script') as HTMLScriptElement;
        a.type = 'text/javascript';
        a.async = !0;
        a.src = r + '?sdkid=' + e + '&lib=' + t;
        var c = d.getElementsByTagName('script')[0];
        c?.parentNode?.insertBefore(a, c) || d.head.appendChild(a);
      };
    })(window, document, 'ttq');
    /* eslint-enable */
    window.ttq?.load(tiktok);
    window.ttq?.page();
  }
}

export default function SiteAnalytics({ config }: { config: AnalyticsConfig }) {
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // First-party attribution (UTMs, click IDs, referral source) is captured in
    // sessionStorage regardless of external ad tags, so internal inquiries retain
    // the source campaign even if third-party pixels are disabled.
    getOrCaptureAttribution();

    if (!hasAnalytics(config)) return;
    if (!shouldMeasure({ hostname: window.location.hostname, inFrame: window.self !== window.top })) return;

    let stored: ConsentDecision | null = null;
    try {
      stored = readConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    } catch {
      // Storage blocked (private mode, or the visitor's own settings). Treat it
      // as undecided rather than failing: they can still answer, it just won't
      // be remembered next time.
    }
    setDecision(stored);
    setReady(true);
    if (stored === 'granted') loadTags(config);
  }, [config]);

  function answer(value: ConsentDecision) {
    setDecision(value);
    try { window.localStorage.setItem(CONSENT_STORAGE_KEY, value); } catch { /* not remembered; still honoured now */ }
    if (value === 'granted') loadTags(config);
  }

  // Nothing to ask about, not measuring here, or already answered.
  if (!ready || decision !== null) return null;

  const wording = consentWording(config);

  return (
    <div className={styles.consentBanner} role="dialog" aria-label="Cookies" aria-live="polite">
      <p>{wording.body}</p>
      <div className={styles.consentActions}>
        {/* Decline first in the DOM so keyboard and screen-reader users reach it
            at least as easily as accept. */}
        <button type="button" className={styles.consentNo} onClick={() => answer('denied')}>No thanks</button>
        <button type="button" className={styles.consentYes} onClick={() => answer('granted')}>That&apos;s fine</button>
      </div>
    </div>
  );
}
