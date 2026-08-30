'use client';

import type { SiteAnalyticsContent } from '@/lib/site-content';
import { analyticsIdProblem, consentWording, hasAnalytics } from '@/lib/analytics';
import styles from './SiteEditor.module.css';

// Setup → "Visitor tracking".
//
// The honesty here is the point. An owner pasting a pixel ID has just made
// themselves responsible for other people's data, and most will not know that.
// So the card says what will appear on their site, shows them the exact banner
// text their visitors will read, and does not pretend a cookie banner is a
// legal opinion.
//
// Note the fields keep whatever was typed rather than the normalized value: an
// ID that doesn't validate has to stay on screen next to the message saying
// why, or the owner watches their paste vanish and has nothing to correct.

export default function AnalyticsField({
  analytics,
  onChange,
}: {
  analytics: SiteAnalyticsContent;
  onChange: (next: SiteAnalyticsContent) => void;
}) {
  const ga4Problem = analyticsIdProblem('ga4', analytics.ga4);
  const googleAdsProblem = analyticsIdProblem('googleAds', analytics.googleAdsId ?? '');
  const pixelProblem = analyticsIdProblem('metaPixel', analytics.metaPixel);
  const tiktokProblem = analyticsIdProblem('tiktokPixel', analytics.tiktokPixel ?? '');
  const live = hasAnalytics(analytics);
  const wording = consentWording(analytics);

  return (
    <>
      <p className={styles.fieldHint}>
        All optional, and all are <strong>your</strong> accounts — we only put the tags on your
        site, we never see the numbers. Leave them empty and your site loads no tracking at all.
      </p>

      <label className={styles.formField}>
        <span>Google Analytics measurement ID</span>
        <input
          value={analytics.ga4}
          maxLength={24}
          spellCheck={false}
          autoComplete="off"
          placeholder="G-ABCD1234"
          aria-invalid={Boolean(ga4Problem)}
          onChange={(event) => onChange({ ...analytics, ga4: event.target.value })}
        />
        {ga4Problem
          ? <small className={styles.socialFieldError}>{ga4Problem}</small>
          : <small className={styles.fieldHint}>Tells you how many people visit and which pages they read.</small>}
      </label>

      <label className={styles.formField}>
        <span>Google Ads conversion ID</span>
        <input
          value={analytics.googleAdsId ?? ''}
          maxLength={30}
          spellCheck={false}
          autoComplete="off"
          placeholder="AW-123456789"
          aria-invalid={Boolean(googleAdsProblem)}
          onChange={(event) => onChange({ ...analytics, googleAdsId: event.target.value })}
        />
        {googleAdsProblem
          ? <small className={styles.socialFieldError}>{googleAdsProblem}</small>
          : <small className={styles.fieldHint}>
              Fires conversion events when someone sends an estimate request from Google Search ads.
            </small>}
      </label>

      <label className={styles.formField}>
        <span>Meta (Facebook &amp; Instagram) pixel ID</span>
        <input
          value={analytics.metaPixel}
          maxLength={40}
          spellCheck={false}
          autoComplete="off"
          placeholder="123456789012345"
          aria-invalid={Boolean(pixelProblem)}
          onChange={(event) => onChange({ ...analytics, metaPixel: event.target.value })}
        />
        {pixelProblem
          ? <small className={styles.socialFieldError}>{pixelProblem}</small>
          : <small className={styles.fieldHint}>
              Tells you which Facebook and Instagram ads turned into real quote requests.
            </small>}
      </label>

      <label className={styles.formField}>
        <span>TikTok pixel ID</span>
        <input
          value={analytics.tiktokPixel ?? ''}
          maxLength={40}
          spellCheck={false}
          autoComplete="off"
          placeholder="C1234567890ABCDEF"
          aria-invalid={Boolean(tiktokProblem)}
          onChange={(event) => onChange({ ...analytics, tiktokPixel: event.target.value })}
        />
        {tiktokProblem
          ? <small className={styles.socialFieldError}>{tiktokProblem}</small>
          : <small className={styles.fieldHint}>
              Measures quote requests and lead submissions from your TikTok campaigns.
            </small>}
      </label>

      {live && (
        <div className={styles.consentPreview}>
          <div className={styles.cardGroupLabel}>What your visitors will see</div>
          <p className={styles.consentPreviewBody}>{wording.body}</p>
          <div className={styles.consentPreviewButtons}>
            <span>No thanks</span>
            <strong>That&apos;s fine</strong>
          </div>
          <p className={styles.fieldHint}>
            Nothing loads until someone taps <strong>That&apos;s fine</strong> — no tracking, no
            cookies, no request to Google, Meta, or TikTok. That&apos;s the law in a lot of places and it&apos;s
            the right way round anyway, but it does mean your visitor numbers will be lower than a
            site that tracks everyone without asking.
          </p>
          {wording.kind === 'ads' && (
            <p className={styles.fieldHint}>
              With an ad pixel configured, the banner says you&apos;re measuring ads — because you
              are. If you don&apos;t run ads, clear those fields and the wording goes back to plain
              visitor numbers.
            </p>
          )}
        </div>
      )}
    </>
  );
}
