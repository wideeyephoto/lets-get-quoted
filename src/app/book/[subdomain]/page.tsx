import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getAvailableBookingDays } from '@/lib/booking';
import { listServices } from '@/lib/services';
import { formatMoney } from '@/lib/jobs';
import { submitBookingAction } from './actions';
import SaveButton from '@/components/save-button';

export const dynamic = 'force-dynamic';

const UNIT_SUFFIX: Record<string, string> = { hour: ' / hr', sqft: ' / sq ft', visit: ' / visit' };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: { subdomain: string };
  searchParams: { booked?: string; error?: string };
}) {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, params.subdomain);

  if (!site) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Booking</p>
            <h1 className="workspace-title">Booking isn&apos;t available</h1>
            <p className="workspace-lead">This booking link is invalid or the site isn&apos;t published yet.</p>
          </div>
        </section>
      </main>
    );
  }

  const businessName = site.company_name || 'Your contractor';

  if (searchParams.booked === '1') {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">{businessName}</p>
            <h1 className="workspace-title">You&apos;re on the list 🎉</h1>
            <p className="workspace-lead">
              Thanks for booking with {businessName}. They&apos;ll reach out shortly to confirm your
              requested time — check your email for a confirmation.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const { data: account } = await admin.from('accounts').select('schedule_day_hours').eq('id', site.account_id).maybeSingle();
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const [days, services] = await Promise.all([
    getAvailableBookingDays(admin, site.account_id, scheduleDayHours),
    listServices(admin, site.account_id, { activeOnly: true }),
  ]);

  const hasServices = services.length > 0;
  // Step numbers shift when there's no price book to choose from.
  const steps = hasServices ? { service: 1, window: 2, details: 3 } : { window: 1, details: 2 };

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{businessName}</p>
          <h1 className="workspace-title">Book a time</h1>
          <p className="workspace-lead">Pick an available window and share a few details — no phone tag required.</p>
        </div>
      </section>

      {days.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No open windows online right now. Reach out to {businessName} directly and they&apos;ll find a time.
          </p>
        </section>
      ) : (
        <form action={submitBookingAction.bind(null, params.subdomain)} className="panel workspace-section-card booking-form">
          {searchParams.error === 'incomplete' ? (
            <p className="payment-banner muted" style={{ marginBottom: '1rem' }}>
              Please pick a time and give us your name plus a phone or email.
            </p>
          ) : null}
          {searchParams.error === 'slot_taken' ? (
            <p className="payment-banner warning" style={{ marginBottom: '1rem' }}>
              That window was just taken — please pick another below.
            </p>
          ) : null}

          {hasServices ? (
            <>
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Step {steps.service}</p>
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

          <div className="section-heading workspace-section-heading" style={hasServices ? { marginTop: '1.5rem' } : undefined}>
            <p className="eyebrow">Step {steps.window}</p>
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

          <div className="section-heading workspace-section-heading" style={{ marginTop: '1.5rem' }}>
            <p className="eyebrow">Step {steps.details}</p>
            <h2>Your details</h2>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="name">Full name</label>
              <input id="name" name="name" required placeholder="Jane Homeowner" />
            </div>
            <div className="field">
              <label htmlFor="phone">Mobile</label>
              <input id="phone" name="phone" type="tel" placeholder="(248) 555-0199" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="jane@email.com" />
            </div>
            <div className="field full">
              <label htmlFor="address">Address</label>
              <input id="address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
            </div>
            <div className="field full">
              <label htmlFor="description">Anything else we should know?</label>
              <textarea id="description" name="description" rows={3} placeholder="Roof looks worn after the last storm — would like an estimate." />
            </div>
            <p className="job-meta" style={{ margin: 0 }}>Add a mobile or email so {businessName} can confirm.</p>
            <div className="field full">
              <SaveButton className="btn primary" pendingLabel="Booking…" savedLabel="Booked ✓">Request this time</SaveButton>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
