import Link from 'next/link';

// The pitch for Extra Stop, shown while it's switched off — the page would
// otherwise be an empty queue and a single link, which explains nothing about
// why a contractor would want this.
//
// Everything numeric here is derived from the account's OWN settings, not
// invented: the earnings line uses their configured fee, the checklist reads
// real state, and the example is labelled as an example. A page that quotes made
// up numbers at a contractor is worse than one that says nothing.

export type ExplainerProps = {
  weekdayCount: number;
  maxPerDay: number;
  maxFeeDollars: number;
  minFeeDollars: number;
  stripeConnected: boolean;
  bookingUrl: string | null;
  businessName: string;
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="es-step">
      <span className="es-step-num">{n}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </li>
  );
}

function Benefit({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <li className="es-benefit">
      <span className="es-benefit-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </li>
  );
}

export default function ExtraStopExplainer({
  weekdayCount,
  maxPerDay,
  maxFeeDollars,
  minFeeDollars,
  stripeConnected,
  bookingUrl,
  businessName,
}: ExplainerProps) {
  // The MIDDLE of their fee range, not the top. Using the highest fee they've
  // configured would produce the most flattering number available, which is the
  // wrong instinct for a figure someone might plan around. Stated as an
  // assumption either way, so the arithmetic can be checked in their head.
  const hasRange = minFeeDollars > 0 && maxFeeDollars > 0;
  const typicalFee = hasRange ? Math.round((minFeeDollars + maxFeeDollars) / 2) : maxFeeDollars || 100;
  const yearly = typicalFee * 52;

  const checklist = [
    {
      label: 'Choose the days you can take extra stops',
      done: weekdayCount > 0,
      detail: weekdayCount > 0 ? `${weekdayCount} day${weekdayCount === 1 ? '' : 's'} a week` : 'None picked yet',
      href: '/dashboard/settings#extra-stop',
      cta: 'Choose',
    },
    {
      label: 'Set how many you’ll take in a day',
      done: maxPerDay > 0,
      detail: maxPerDay > 0 ? `Up to ${maxPerDay} a day` : 'No limit set',
      href: '/dashboard/settings#extra-stop',
      cta: 'Set',
    },
    {
      label: 'Connect Stripe to collect the fee',
      done: stripeConnected,
      detail: stripeConnected ? 'Connected' : 'Required — the fee is paid before the visit is booked',
      href: '/dashboard/settings#payments',
      cta: 'Connect',
    },
    {
      label: 'See what the customer sees',
      done: false,
      detail: bookingUrl ? 'Opens your public booking page' : 'Publish your website first',
      href: bookingUrl ?? '/dashboard/sites',
      cta: 'Preview',
      external: Boolean(bookingUrl),
    },
  ];

  return (
    <div className="es-explainer">
      <section className="es-hero">
        <div className="es-hero-copy">
          <p className="eyebrow">How Extra Stop works</p>
          <h2>
            Earn more from customers willing to <span className="es-accent">pay for speed</span>
          </h2>
          <p className="es-lead">
            Extra Stop lets nearby customers ask to be squeezed onto the end of today&apos;s route. You review the
            request, choose the arrival window, set the fee, and accept only when it suits you.
          </p>
          <ul className="es-promises">
            <li><span aria-hidden="true">✓</span> You approve every request</li>
            <li><span aria-hidden="true">✓</span> You set the time</li>
            <li><span aria-hidden="true">✓</span> You set the fee</li>
            <li><span aria-hidden="true">✓</span> Nothing is booked until payment clears</li>
          </ul>
        </div>

        <aside className="es-earnings" aria-label="Potential earnings">
          <p className="es-earnings-label">What one a week adds up to</p>
          <p className="es-earnings-line">
            1 extra stop a week at <strong>${typicalFee}</strong>
          </p>
          <p className="es-earnings-total">${yearly.toLocaleString('en-US')}<span>/year</span></p>
          <p className="es-earnings-note">
            {hasRange
              ? `The middle of the $${minFeeDollars}–$${maxFeeDollars} range you've set.`
              : 'A round number to show the shape of it.'}{' '}
            An illustration, not a forecast — you set the fee on every request.
          </p>
        </aside>
      </section>

      <section className="es-block">
        <h3 className="es-block-title">The flow, start to finish</h3>
        <ol className="es-steps">
          <Step n={1} title="We find the right jobs">
            Only customers already near your route that day are offered it, so an extra stop doesn&apos;t send you
            across town.
          </Step>
          <Step n={2} title="You get the request">
            The job, the address, the customer&apos;s details and how far off your route they are — texted and emailed
            to you the moment it lands.
          </Step>
          <Step n={3} title="You make an offer">
            Pick the arrival window and the fee that makes it worth doing. Or decline, and it stays an ordinary lead.
          </Step>
          <Step n={4} title="The customer chooses">
            They pay the fee and it&apos;s confirmed, or they skip it and carry on as a normal enquiry. Either way you
            keep the lead.
          </Step>
        </ol>
      </section>

      <div className="es-split">
        <section className="es-block">
          <h3 className="es-block-title">What the customer sees</h3>
          <div className="es-phone" role="img" aria-label="Preview of the message a customer receives">
            <p className="es-phone-from">{businessName}</p>
            <p className="es-phone-bubble">
              We&apos;re in your area today. Want us to squeeze you into the schedule?
            </p>
            <p className="es-phone-sub">Choose faster service for an Extra Stop fee, or carry on as a normal enquiry.</p>
            <p className="es-phone-choice primary">Pay for faster service →<span>booked once payment clears</span></p>
            <p className="es-phone-choice">Carry on as normal →<span>treated as an ordinary lead</span></p>
            <p className="es-phone-foot">Always optional. Never booked automatically.</p>
          </div>
        </section>

        <section className="es-block">
          <h3 className="es-block-title">An example</h3>
          <div className="es-example">
            <p className="es-example-job">Kitchen faucet repair</p>
            <ul className="es-example-facts">
              <li><span aria-hidden="true">📍</span> 12 minutes from your last job</li>
              <li><span aria-hidden="true">🕒</span> Customer free after 5:30 PM</li>
            </ul>
            <p className="es-example-label">Your offer</p>
            <p className="es-example-offer">6:30 – 7:15 PM</p>
            <p className="es-example-fee">${typicalFee} Extra Stop fee</p>
            <p className="es-example-note">If they pass, the lead stays yours as a normal enquiry.</p>
          </div>
        </section>
      </div>

      <section className="es-block">
        <h3 className="es-block-title">Why contractors turn it on</h3>
        <ul className="es-benefits">
          <Benefit icon="💵" title="More from the same day">
            Paid extra by customers who value speed, on work already near your route.
          </Benefit>
          <Benefit icon="🕒" title="Only when it suits you">
            You pick the window. Nothing lands on your calendar without you saying yes.
          </Benefit>
          <Benefit icon="📍" title="Route-friendly only">
            Nearby jobs only, so the detour is short and the day still works.
          </Benefit>
          <Benefit icon="🛡️" title="No risk">
            Nothing is booked until the payment clears.
          </Benefit>
          <Benefit icon="👥" title="You keep the lead either way">
            Decline, or the customer passes — it simply stays a normal enquiry.
          </Benefit>
        </ul>
      </section>

      <section className="es-block es-getstarted">
        <h3 className="es-block-title">Get set up</h3>
        <ul className="es-checklist">
          {checklist.map((item) => (
            <li key={item.label} className={item.done ? 'done' : undefined}>
              <span className="es-check" aria-hidden="true">{item.done ? '✓' : ''}</span>
              <span className="es-check-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              {item.done ? (
                <span className="es-check-state">Done</span>
              ) : item.external ? (
                <a className="btn secondary" href={item.href} target="_blank" rel="noopener noreferrer">{item.cta}</a>
              ) : (
                <Link className="btn secondary" href={item.href}>{item.cta}</Link>
              )}
            </li>
          ))}
        </ul>
        <div className="es-cta">
          <Link href="/dashboard/settings#extra-stop" className="btn primary">Set up Extra Stop &rarr;</Link>
          <p>Pause or change any of it whenever you like.</p>
        </div>
      </section>
    </div>
  );
}
