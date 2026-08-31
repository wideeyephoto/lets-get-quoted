import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getAvailableBookingDays } from '@/lib/booking';
import { listServices } from '@/lib/services';
import { formatMoney } from '@/lib/jobs';
import { siteIconsMetadata } from '@/lib/brand-mark';
import { siteCanonicalUrl } from '@/lib/seo/site-seo';
import { phoneLink } from '@/lib/phone';
import { PHONE_EXAMPLE, addressExample, jobExample } from '@/lib/booking-examples';
import BookingChrome from './BookingChrome';
import InstantBookFlow from './InstantBookFlow';
import QuickStopFlow from './QuickStopFlow';
import RequestVisitFlow from './RequestVisitFlow';
import { quickStopDayOptions, quickStopSettingsFromAccount, QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';

export const dynamic = 'force-dynamic';

const UNIT_SUFFIX: Record<string, string> = { hour: ' / hr', sqft: ' / sq ft', visit: ' / visit' };

// The tab used to read "Let's Get Quoted — Contractor websites that get you
// paid" on a page whose whole job is to look like the contractor's. Their name,
// their favicon. `noindex` because the canonical place to find this business is
// their own site — an identical booking page on OUR domain would compete with
// them for their own name in search.
export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) return { title: { absolute: 'Booking unavailable' }, robots: { index: false, follow: false } };
  const businessName = site.company_name || 'your contractor';
  return {
    // Absolute, or the root layout's "%s · Let's Get Quoted" template co-brands
    // a tab that is supposed to be the contractor's alone.
    title: { absolute: `Request a visit · ${businessName}` },
    description: `Request an appointment with ${businessName}${site.service_area ? ` in ${site.service_area}` : ''}. Choose a preferred window and they'll confirm it with you.`,
    icons: siteIconsMetadata(site),
    robots: { index: false, follow: true },
    openGraph: { title: `Request a visit with ${businessName}`, type: 'website', images: [] },
    twitter: { card: 'summary', title: `Request a visit with ${businessName}`, images: [] },
  };
}

export default async function BookingPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<{ booked?: string; requested?: string; error?: string; ref?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, params.subdomain);

  // The one state where OUR name is the right name on the page: there is no
  // contractor to brand it with, because we could not work out who the link was
  // for. Centred and self-contained — with the app shell gone this used to be a
  // lone card pinned to the top-left corner of an empty screen.
  if (!site) {
    return (
      <div className="book-scope book-scope-lost">
        <main className="wide-shell workspace-shell payment-shell">
          <section className="workspace-hero panel payment-hero workspace-hero-solo">
            <div className="workspace-hero-copy">
              <p className="eyebrow">Booking</p>
              <h1 className="workspace-title">This booking link doesn&apos;t work</h1>
              <p className="workspace-lead">
                It may have a typo in it, or the contractor hasn&apos;t published their site yet. Check the link
                they sent you, or contact them directly to get booked in.
              </p>
            </div>
          </section>
        </main>
        <footer className="book-foot">
          <p className="book-foot-plat">Booking handled securely by Let&apos;s Get Quoted</p>
        </footer>
      </div>
    );
  }

  const businessName = site.company_name || 'Your contractor';
  const homeUrl = siteCanonicalUrl(site);
  const call = site.phone ? phoneLink(site.phone) : null;
  const callLine = call ? (
    <>
      Need it sooner, or want to talk it through? Call{' '}
      <a href={call.href} className="book-inline-call">{call.text}</a>.
    </>
  ) : null;

  if (searchParams.booked) {
    // The window they asked for, read back from the record we just wrote rather
    // than echoed out of the query string — a booking confirmation is exactly
    // the page you do not want a stranger to be able to write the text of.
    // `booked=1` is the old shape and still lands somewhere sensible.
    const requestedWindow = await lookupRequestedWindow(admin, site.account_id, searchParams.booked);
    return (
      <BookingChrome site={site}>
        <main className="wide-shell workspace-shell payment-shell book-done">
          <section className="workspace-hero panel payment-hero workspace-hero-solo book-done-hero">
            <div className="workspace-hero-copy">
              <p className="eyebrow">Request sent</p>
              <h1 className="workspace-title">Thanks — you&apos;re in the book</h1>
              {requestedWindow ? (
                <p className="book-done-when">
                  <span className="book-done-when-label">
                    {requestedWindow.alt ? 'You asked for either' : 'You asked for'}
                  </span>
                  <strong>{requestedWindow.first}</strong>
                  {requestedWindow.alt ? (
                    <>
                      <span className="book-done-when-or">or</span>
                      <strong>{requestedWindow.alt}</strong>
                    </>
                  ) : null}
                </p>
              ) : null}
              <p className="workspace-lead">
                {businessName} has your request.{' '}
                {requestedWindow?.alt
                  ? 'They’ll confirm one of the two — nothing is locked in until they do, and you’ll get a text or an email naming the time the moment they pick.'
                  : 'Nothing is locked in until they confirm it — you’ll get a text or an email the moment they do.'}
              </p>
            </div>
          </section>

          {/* The step that used to be missing entirely. "You're on the list 🎉"
              answered none of the three things somebody actually wants to know
              after handing over their address. */}
          <section className="panel workspace-section-card book-next">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">What happens next</p>
              <h2>Three things, in order</h2>
            </div>
            <ol className="book-next-list">
              <li>
                <strong>{businessName} reviews it.</strong>
                <span>
                  {requestedWindow?.alt
                    ? 'They check both windows against the rest of their day and take whichever one fits.'
                    : 'They check the window against the rest of their day.'}
                </span>
              </li>
              <li>
                <strong>You get a confirmation.</strong>
                <span>By text or email, with the arrival window they can commit to.</span>
              </li>
              <li>
                <strong>They show up.</strong>
                <span>You&apos;ll get a link to follow along on the day.</span>
              </li>
            </ol>
            {callLine ? <p className="book-next-call">{callLine}</p> : null}
          </section>

          {homeUrl ? (
            <p className="book-done-back">
              <a href={homeUrl}>← Back to {businessName}</a>
            </p>
          ) : null}
        </main>
      </BookingChrome>
    );
  }

  if (searchParams.requested === '1') {
    return (
      <BookingChrome site={site}>
        <main className="wide-shell workspace-shell payment-shell book-done">
          <section className="workspace-hero panel payment-hero workspace-hero-solo book-done-hero">
            <div className="workspace-hero-copy">
              <p className="eyebrow">Request sent</p>
              <h1 className="workspace-title">Got it — they&apos;ll be in touch</h1>
              <p className="workspace-lead">
                {businessName} has your details and will reach out to get you scheduled.
              </p>
              {/* In the hero, not a card of its own. As its own card it was one
                  sentence under a divider with nothing above the divider. */}
              {callLine ? <p className="book-hero-call">{callLine}</p> : null}
            </div>
          </section>
          {homeUrl ? (
            <p className="book-done-back">
              <a href={homeUrl}>← Back to {businessName}</a>
            </p>
          ) : null}
        </main>
      </BookingChrome>
    );
  }

  // When the owner has turned on instant-booking gating, the public page becomes
  // the estimate-first flow: describe the job → instant AI estimate → qualified
  // jobs pick a slot, everyone else leaves a callback request. Read the flag
  // defensively so a pre-migration DB just serves the classic form.
  const { data: gate } = await admin
    .from('accounts')
    .select(`instant_book_enabled, timezone, connect_onboarded, stripe_connect_id, ${QUICK_STOP_SETTINGS_COLUMNS}`)
    .eq('id', site.account_id)
    .maybeSingle();
  // Quick Stop is only offered when enabled AND not locked (no-show escalation).
  const quickStopSettings = quickStopSettingsFromAccount(gate as Parameters<typeof quickStopSettingsFromAccount>[0]);
  // …and only when there is a day left to offer. A contractor who works Mon–Fri,
  // asked at 9pm on a Friday with same-day only, has nothing to sell — showing
  // the form there produces a request nobody can fill.
  const quickStopDays = quickStopDayOptions(quickStopSettings, {
    timeZone: (gate as { timezone?: string } | null)?.timezone || 'America/New_York',
  });
  // …and only when the contractor can actually be paid. A Quick Stop is confirmed
  // by the customer paying for it, so an account without payout setup cannot
  // answer one: the offer action refuses to send an offer and the request sits
  // until the sweeper expires it. Same rule the dashboard's offer action applies
  // (dashboard/quick-stops/actions.ts) — checked here so a homeowner never fills
  // the form in and hits the refusal at submit.
  const connect = gate as { connect_onboarded?: boolean; stripe_connect_id?: string | null } | null;
  const quickStopPayable = Boolean(connect?.connect_onboarded && connect?.stripe_connect_id);
  const quickStopEnabled = quickStopSettings.available && quickStopDays.length > 0 && quickStopPayable;
  // This rail never creates a lead — it writes extra_stop_requests — so the
  // referrer rides in that row's `intake` blob the way a lead's rides in
  // `triage`, and buildReferralQueue reads both. A referred visitor who takes
  // the priority-visit path is attributed like any other.
  const quickStop = quickStopEnabled ? (
    <QuickStopFlow
      subdomain={params.subdomain}
      siteId={site.id}
      businessName={businessName}
      serviceArea={site.service_area}
      days={quickStopDays}
      referralCode={searchParams.ref ?? null}
    />
  ) : null;

  if (gate?.instant_book_enabled) {
    return (
      <BookingChrome site={site}>
        <main className="wide-shell workspace-shell payment-shell">
          <section className="workspace-hero panel payment-hero workspace-hero-solo book-hero">
            <div className="workspace-hero-copy">
              <p className="eyebrow">{businessName}</p>
              <h1 className="workspace-title">Request a visit</h1>
              <p className="workspace-lead">
                Tell us about the job for an instant estimate, then choose your preferred arrival window.{' '}
                {businessName} will confirm it with you.
              </p>
            </div>
          </section>
          <InstantBookFlow
            subdomain={params.subdomain}
            siteId={site.id}
            businessName={businessName}
            serviceArea={site.service_area ?? ''}
            phone={site.phone}
            referralCode={searchParams.ref ?? null}
          />
          {quickStop}
        </main>
      </BookingChrome>
    );
  }

  const [days, services] = await Promise.all([
    getAvailableBookingDays(admin, site.account_id),
    listServices(admin, site.account_id, { activeOnly: true }),
  ]);

  return (
    <BookingChrome site={site}>
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero workspace-hero-solo book-hero">
          {/* "Book a time" promised something the page does not do. Every other
              line on it — the button, the reassurance under the button, the
              confirmation screen — already said this is a REQUEST the owner
              confirms; the headline was the one place still claiming the slot
              was yours the moment you pressed. Now the expectation is set
              before the first field rather than in fine print after it. */}
          <div className="workspace-hero-copy">
            <p className="eyebrow">{businessName}</p>
            <h1 className="workspace-title">Request a visit</h1>
            <p className="workspace-lead">
              Choose your preferred arrival window. {businessName} will confirm it with you.
            </p>
          </div>
        </section>

        {days.length === 0 ? (
          <section className="panel workspace-section-card book-empty">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Nothing open online</p>
              <h2>No windows on offer right now</h2>
            </div>
            <p className="workspace-details-copy">
              {businessName} isn&apos;t taking online bookings for the next few days.
              {call ? ' Give them a call and they’ll find you a time.' : ' Reach out to them directly and they’ll find a time.'}
            </p>
            {/* The old version of this screen was a single grey line of text with
                nowhere to go. If we can't sell them a slot we can at least hand
                them the phone. */}
            {call ? (
              <a href={call.href} className="btn primary book-empty-call">
                Call {call.text}
              </a>
            ) : null}
            {/* Still offered when there is nothing on the calendar to offer.
                No open windows is precisely the situation Quick Stop exists
                for, and it used to sit outside this branch — so the one page
                state where the alternative path matters most was the state
                that dropped it. */}
            {quickStop}
          </section>
        ) : (
          <>
            {searchParams.error === 'incomplete' ? (
              <p className="payment-banner muted book-alert" role="status">
                Please choose a window and fill in your name, address, and a phone or email.
              </p>
            ) : null}
            {searchParams.error === 'slot_taken' ? (
              <p className="payment-banner warning book-alert" role="status">
                That window was just taken — please pick another below.
              </p>
            ) : null}
            {searchParams.error === 'busy' ? (
              <p className="payment-banner warning book-alert" role="status">
                A lot of requests came in at once. Give it a minute and try again.
              </p>
            ) : null}
            <RequestVisitFlow
              subdomain={params.subdomain}
              businessName={businessName}
              referralCode={searchParams.ref ?? null}
              days={days.map((day) => ({
                dateKey: day.dateKey,
                dayLabel: day.dayLabel,
                slots: day.slots.map((slot) => ({ time: slot.time, label: slot.label })),
              }))}
              services={services.map((service) => ({
                id: service.id,
                name: service.name,
                detail:
                  service.unit_price > 0
                    ? `from ${formatMoney(service.unit_price)}${UNIT_SUFFIX[service.unit] ?? ''}`
                    : service.description || 'Select this',
              }))}
              addressExample={addressExample(site.service_area)}
              jobExample={jobExample(services.map((service) => service.name))}
              phoneExample={PHONE_EXAMPLE}
              quickStop={
                quickStopEnabled
                  ? { siteId: site.id, serviceArea: site.service_area, days: quickStopDays }
                  : null
              }
            />
          </>
        )}
      </main>
    </BookingChrome>
  );
}

// Read the requested window back off the lead the booking just created. Scoped
// to this site's account so an id borrowed from another contractor reads as
// nothing rather than leaking their customer's appointment.
//
// The source_page filter is load-bearing, not belt-and-braces. `triage.timeline`
// holds the chosen window ONLY on leads createBooking wrote; on a website-intake
// lead the same field holds 'asap' / 'month' / 'researching'. Without it, an id
// pointing at any other lead renders "You asked for: asap" — confident, and
// nonsense. Only leads stamped '/book' have a window to report.
async function lookupRequestedWindow(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  booked: string,
): Promise<{ first: string; alt: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(booked)) return null;
  const { data } = await admin
    .from('leads')
    .select('triage')
    .eq('id', booked)
    .eq('account_id', accountId)
    .eq('source_page', '/book')
    .maybeSingle();
  const triage = data?.triage as { timeline?: unknown; timelineAlt?: unknown } | null;
  const timeline = triage?.timeline;
  if (typeof timeline !== 'string' || !timeline.trim()) return null;
  const alt = triage?.timelineAlt;
  return {
    first: timeline.trim(),
    alt: typeof alt === 'string' && alt.trim() ? alt.trim() : null,
  };
}
