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
import { submitBookingAction } from './actions';
import BookingChrome from './BookingChrome';
import BookingSteps from './BookingSteps';
import InstantBookFlow from './InstantBookFlow';
import QuickStopFlow from './QuickStopFlow';
import { quickStopDayOptions, quickStopSettingsFromAccount, QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';
import SaveButton from '@/components/save-button';

export const dynamic = 'force-dynamic';

const UNIT_SUFFIX: Record<string, string> = { hour: ' / hr', sqft: ' / sq ft', visit: ' / visit' };

// The tab used to read "Let's Get Quoted — Contractor websites that get you
// paid" on a page whose whole job is to look like the contractor's. Their name,
// their favicon. `noindex` because the canonical place to find this business is
// their own site — an identical booking page on OUR domain would compete with
// them for their own name in search.
export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
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
  params,
  searchParams,
}: {
  params: { subdomain: string };
  searchParams: { booked?: string; requested?: string; error?: string };
}) {
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
                  <span className="book-done-when-label">You asked for</span>
                  <strong>{requestedWindow}</strong>
                </p>
              ) : null}
              <p className="workspace-lead">
                {businessName} has your request. Nothing is locked in until they confirm it — you&apos;ll get a
                text or an email the moment they do.
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
                <span>They check the window against the rest of their day.</span>
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
    .select(`instant_book_enabled, timezone, ${QUICK_STOP_SETTINGS_COLUMNS}`)
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
  const quickStopEnabled = quickStopSettings.available && quickStopDays.length > 0;
  const quickStop = quickStopEnabled ? (
    <QuickStopFlow
      subdomain={params.subdomain}
      siteId={site.id}
      businessName={businessName}
      serviceArea={site.service_area}
      days={quickStopDays}
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

  const hasServices = services.length > 0;
  // Step numbers shift when there's no price book to choose from.
  const steps = hasServices
    ? [
        { n: 1, label: 'What you need' },
        { n: 2, label: 'Pick a window' },
        { n: 3, label: 'Your details' },
      ]
    : [
        { n: 1, label: 'Pick a window' },
        { n: 2, label: 'Your details' },
      ];
  const stepNo = { service: 1, window: hasServices ? 2 : 1, details: hasServices ? 3 : 2 };

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
          </section>
        ) : (
          <form action={submitBookingAction.bind(null, params.subdomain)} className="panel workspace-section-card booking-form">
            <BookingSteps steps={steps} />
            {searchParams.error === 'incomplete' ? (
              <p className="payment-banner muted book-alert" role="status">
                Please request a time and fill in your name, address, and a phone or email.
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

            {hasServices ? (
              <>
                <div className="section-heading workspace-section-heading book-step-head">
                  <p className="eyebrow">Step {stepNo.service}</p>
                  <h2>What do you need?</h2>
                </div>
                <div className="booking-slots">
                  {services.map((service) => (
                    <label className="booking-slot" key={service.id}>
                      <input type="radio" name="service" value={service.id} />
                      <span className="booking-slot-day">{service.name}</span>
                      <span className="booking-slot-time">
                        {service.unit_price > 0
                          ? `from ${formatMoney(service.unit_price)}${UNIT_SUFFIX[service.unit] ?? ''}`
                          : service.description || 'Tap to select'}
                      </span>
                    </label>
                  ))}
                  <label className="booking-slot">
                    <input type="radio" name="service" value="" defaultChecked />
                    <span className="booking-slot-day">Not sure yet</span>
                    <span className="booking-slot-time">We&apos;ll figure it out together</span>
                  </label>
                </div>
              </>
            ) : null}

            <div className="section-heading workspace-section-heading book-step-head">
              <p className="eyebrow">Step {stepNo.window}</p>
              <h2>Choose a window</h2>
            </div>
            <div className="booking-days">
              {days.map((day) => (
                <div className="booking-day-group" key={day.dateKey}>
                  <p className="booking-day-heading">{day.dayLabel}</p>
                  <div className="booking-slots">
                    {day.slots.map((slot) => (
                      <label className="booking-slot" key={`${day.dateKey}|${slot.time}`}>
                        <input type="radio" name="slot" value={`${day.dateKey}|${slot.time}`} required />
                        <span className="booking-slot-time">{slot.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="section-heading workspace-section-heading book-step-head">
              <p className="eyebrow">Step {stepNo.details}</p>
              <h2>Your details</h2>
            </div>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Full name <span className="book-req">Required</span></label>
                <input id="name" name="name" required placeholder="Jane Homeowner" autoComplete="name" />
              </div>
              {/* ABOVE the pair, not below it. A rule that only one of two
                  fields is needed is useless once you have already filled in
                  both, or skipped both and pressed the button — and this one
                  sat under the boxes it governs, which is where somebody reads
                  it for the first time while looking at a validation error. */}
              <p className="field-hint booking-contact-hint booking-contact-rule">
                Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to confirm.
              </p>
              <div className="field">
                <label htmlFor="phone">Mobile</label>
                <input id="phone" name="phone" type="tel" placeholder={PHONE_EXAMPLE} autoComplete="tel" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" placeholder="jane@email.com" autoComplete="email" />
              </div>
              <div className="field full">
                <label htmlFor="address">Address <span className="book-req">Required</span></label>
                <input id="address" name="address" required placeholder={addressExample(site.service_area)} autoComplete="street-address" />
              </div>
              {/* This field was labelled "Anything else we should know?" while
                  its answer became the job's SCOPE. The question and the
                  destination disagreed, so people wrote access notes into the
                  scope of work. Two fields now, each asking for what it stores. */}
              {/* Marked optional out loud. It is the biggest box on the page and
                  sits between two required fields, which made it read as
                  required — so somebody with nothing to add stalls on it. */}
              <div className="field full">
                <label htmlFor="description">What&apos;s the job? <span className="book-opt">Optional</span></label>
                <textarea id="description" name="description" rows={3} placeholder={jobExample(services.map((service) => service.name))} />
              </div>
              <div className="field full">
                <label htmlFor="note">Anything we should know? <span className="book-opt">Optional</span></label>
                <textarea id="note" name="note" rows={2} maxLength={500} placeholder="Gate code, where to park, a dog in the yard, which door to use…" />
                <small className="field-hint">This goes to whoever turns up, not just the office.</small>
              </div>
              <div className="field full">
                <SaveButton className="btn primary book-submit" pendingLabel="Sending…" savedLabel="Sent ✓">Request this time</SaveButton>
                <p className="book-reassure">
                  This is a request, not a charge. {businessName} confirms before anything is booked.
                </p>
              </div>
            </div>
          </form>
        )}
        {quickStop}
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
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(booked)) return null;
  const { data } = await admin
    .from('leads')
    .select('triage')
    .eq('id', booked)
    .eq('account_id', accountId)
    .eq('source_page', '/book')
    .maybeSingle();
  const timeline = (data?.triage as { timeline?: unknown } | null)?.timeline;
  return typeof timeline === 'string' && timeline.trim() ? timeline.trim() : null;
}
