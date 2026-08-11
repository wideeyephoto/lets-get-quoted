import type { CSSProperties, ReactNode } from 'react';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import { getPublishedRatingBadge, getSiteContent, glyphForContent } from '@/lib/site-content';
import { templateFontVars } from '@/lib/templates/fonts';
import { readableOnAccent } from '@/lib/templates/theme-color';
import { DEFAULT_BRAND_ACCENT } from '@/lib/brand-mark';
import { siteCanonicalUrl } from '@/lib/seo/site-seo';
import { phoneLink } from '@/lib/phone';
import type { Site } from '@/lib/sites';

// The frame around the public booking page.
//
// This page is the ONLY thing a homeowner sees of us, and it used to render
// inside the platform's marketing rail: eighteen padlocked rows of a CRM they
// will never own, and a "Create free account" button larger than the one that
// books the job. A plumber's customer was being sold plumbing software.
//
// So the page brings its own chrome — the CONTRACTOR's, not ours. Their mark,
// their name, their accent on every control, their phone number one tap away.
// The only mention of us is one line in the footer, which is where a payment
// processor's name goes.

// Honest facts only. Each of these is either something the owner typed or
// something we measured — nothing here is a claim we invented for them.
type Fact = { key: string; label: string; value: string; stars?: number };

function factsFor(site: Site): Fact[] {
  const facts: Fact[] = [];
  const rating = getPublishedRatingBadge(site.content);
  if (rating) {
    facts.push({
      key: 'rating',
      label: `${rating.rating.toFixed(1)} out of 5`,
      value: `${rating.reviewCount} review${rating.reviewCount === 1 ? '' : 's'}`,
      // Rounded, like every other place we draw these — five filled stars for a
      // 4.2 would be us inflating a number the owner has to stand behind.
      stars: Math.max(1, Math.min(5, Math.round(rating.rating))),
    });
  }
  // Only ever set when there are ≥3 real replies averaging under 4 hours — see
  // withResponseStat. Absent means we have nothing honest to say, not "slow".
  if (typeof site.avg_response_ms === 'number' && site.avg_response_ms > 0) {
    facts.push({ key: 'reply', label: 'Typically replies in', value: formatReplyTime(site.avg_response_ms) });
  }
  if (site.license?.trim()) facts.push({ key: 'license', label: 'Licensed', value: site.license.trim() });
  if (site.service_area?.trim()) facts.push({ key: 'area', label: 'Serving', value: site.service_area.trim() });
  if (site.hours?.trim()) facts.push({ key: 'hours', label: 'Hours', value: site.hours.trim() });
  return facts;
}

function formatReplyTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000 / 5) * 5;
  if (minutes < 60) return `${Math.max(5, minutes)} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export default function BookingChrome({ site, children }: { site: Site; children: ReactNode }) {
  const content = getSiteContent(site.content);
  const accent = site.accent_override || DEFAULT_BRAND_ACCENT;
  const businessName = site.company_name || 'Your contractor';
  const homeUrl = siteCanonicalUrl(site);
  const facts = factsFor(site);
  const call = site.phone ? phoneLink(site.phone) : null;

  // Every control on the page reads these. `--accent` is the app's own token,
  // so re-declaring it here re-colors the buttons, focus rings and selected
  // slots that were already written against it — no per-component overrides.
  const scope = {
    '--book-accent': accent,
    '--book-on-accent': readableOnAccent(accent),
    '--accent': accent,
    ...(site.header_font ? { '--book-display': site.header_font } : {}),
  } as CSSProperties;

  return (
    // templateFontVars because --book-display above is the contractor's own
    // header_font, and a saved value is a var(--font-oswald)-style reference to
    // one of these faces. Without them here the booking page renders somebody's
    // brand in a system font while their website next door gets it right.
    <div className={`book-scope ${templateFontVars}`} style={scope}>
      {/* Two slow bands of light crossing the page behind everything on it.
          Fixed to the viewport rather than to a section, so a form that runs to
          two thousand pixels keeps the same light all the way down. Decorative
          and unreachable: see .book-glare. */}
      <i className="book-glare" aria-hidden="true" />

      <header className="book-topbar">
        <a className="book-brand" href={homeUrl ?? '#'} aria-label={homeUrl ? `${businessName} home` : businessName}>
          {site.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary owner-uploaded host; next/image would need every one allow-listed
            <img className="book-brand-logo" src={site.logo_url} alt="" data-logo-style={content.logoStyle} />
          ) : (
            <span className="book-brand-mark" aria-hidden="true">
              <ServiceIcon name={glyphForContent(content)} className="book-brand-glyph" />
            </span>
          )}
          <span className="book-brand-name">{businessName}</span>
        </a>

        {/* Nulled unless the owner made the number public (withPublicContact),
            so this is their decision, not ours. When it is here it is the
            escape hatch for anyone the flow can't help — an online booking
            form with no way to reach a human is a dead end. */}
        {call ? (
          <a className="book-call" href={call.href}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="book-call-ic">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z" />
            </svg>
            <span className="book-call-text">
              <span className="book-call-label">Call</span>
              <span className="book-call-number">{call.text}</span>
            </span>
          </a>
        ) : null}
      </header>

      {facts.length > 0 ? (
        <div className="book-facts">
          <ul>
            {facts.map((fact) => (
              <li key={fact.key} className={`book-fact book-fact-${fact.key}`}>
                {fact.stars ? <span className="book-fact-stars" aria-hidden="true">{'★'.repeat(fact.stars)}</span> : null}
                <span className="book-fact-label">{fact.label}</span>
                <span className="book-fact-value">{fact.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}

      <footer className="book-foot">
        <p className="book-foot-biz">
          {homeUrl ? (
            <a href={homeUrl}>{businessName}</a>
          ) : (
            businessName
          )}
          {call ? <> · <a href={call.href}>{call.text}</a></> : null}
        </p>
        {/* Our one line on the page, and it is a reassurance rather than an ad:
            it tells a homeowner who is handling their details. No sign-up link
            — a contractor's customer is not a lead of ours to poach. */}
        <p className="book-foot-plat">Booking handled securely by Let&apos;s Get Quoted</p>
      </footer>
    </div>
  );
}
