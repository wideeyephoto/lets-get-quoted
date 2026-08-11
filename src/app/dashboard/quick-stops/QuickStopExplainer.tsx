import Link from 'next/link';
import { QuickStopIcon } from '@/components/quick-stop-icons';

// The pitch for Quick Stop, shown while it's switched off — the page would
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

// The icons moved to components/quick-stop-icons so /features/quick-stops can
// draw the same four steps for a logged-out visitor without a second copy of
// the path data.
const Icon = QuickStopIcon;

function Step({ n, icon, title, children }: { n: number; icon: string; title: string; children: React.ReactNode }) {
  return (
    <li className="es-step">
      <span className="es-step-badge">
        <Icon name={icon} className="es-step-icon" />
        <span className="es-step-num">{n}</span>
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </li>
  );
}

function Benefit({ icon, tone, title, children }: { icon: string; tone: string; title: string; children: React.ReactNode }) {
  return (
    <li className="es-benefit" data-tone={tone}>
      <span className="es-benefit-icon"><Icon name={icon} /></span>
      <strong>{title}</strong>
      <p>{children}</p>
    </li>
  );
}

export default function QuickStopExplainer({
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
      label: 'Choose the days you can take quick stops',
      done: weekdayCount > 0,
      detail: weekdayCount > 0 ? `${weekdayCount} day${weekdayCount === 1 ? '' : 's'} a week` : 'None picked yet',
      href: '/dashboard/quick-stops#quick-stop-setup',
      cta: 'Choose',
    },
    {
      label: 'Set how many you’ll take in a day',
      done: maxPerDay > 0,
      detail: maxPerDay > 0 ? `Up to ${maxPerDay} a day` : 'No limit set',
      href: '/dashboard/quick-stops#quick-stop-setup',
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
  // "Preview" isn't a setup step you complete, so it doesn't count as outstanding.
  const remaining = checklist.filter((item) => !item.done && item.cta !== 'Preview').length;

  return (
    <div className="es-explainer">
      {/* The id the header's "How it works" button scrolls to. */}
      <section className="es-hero" id="quick-stop-earn-more">
        <div className="es-hero-copy">
          <p className="es-kicker"><Icon name="spark" /> Matched to the route you&apos;re already driving</p>
          <h2>
            Earn more from customers willing to <span className="es-accent">pay for speed</span>
          </h2>
          <p className="es-lead">
            Quick Stops lets nearby customers pay to be fitted in sooner than your normal
            schedule. You review the request, choose the arrival window, set the fee, and accept
            only when it suits you.
          </p>

          <ul className="es-promises">
            <li><Icon name="check" /> You approve every request</li>
            <li><Icon name="check" /> You set the time</li>
            <li><Icon name="check" /> You set the fee</li>
            <li><Icon name="check" /> Nothing books until payment clears</li>
          </ul>

          <div className="es-hero-cta">
            <Link href="/dashboard/quick-stops#quick-stop-setup" className="btn primary es-cta-btn">
              Set up Quick Stop <span aria-hidden="true">→</span>
            </Link>
            {/* The evidence, next to the ask. The pitch above is an argument;
                this is the same argument made out of the owner's own last 90
                days, which is the more persuasive one — so it sits in the row
                where they're deciding, and the panel itself lives at the foot
                of the page rather than interrupting the queue. */}
            <a href="#quick-stop-demand" className="btn secondary es-cta-btn">
              See your own past jobs that fit
            </a>
            <p>
              {remaining > 0
                ? `${remaining} thing${remaining === 1 ? '' : 's'} left to set up · pause or change it whenever you like`
                : 'Pause or change it whenever you like'}
            </p>
          </div>
        </div>

        {/* DEMOTED, because the disclosure was doing all the work and the
            typography was undoing it. "$12,376/year" was set as the largest
            number on the page, in a glowing card, with "an illustration, not a
            forecast" underneath in small grey text. Everything about the way it
            was drawn said forecast. It is arithmetic — one visit a week times a
            fee — so it is now stated as arithmetic, at the size of a caption,
            with the conditional in the sentence rather than in a footnote. */}
        <aside className="es-earnings is-illustration" aria-label="What a Quick Stop is worth">
          <p className="es-earnings-label">The arithmetic</p>
          <p className="es-earnings-line">
            <strong>${typicalFee}</strong> a visit. One a week for a year would be{' '}
            <strong>${yearly.toLocaleString('en-US')}</strong>.
          </p>
          <p className="es-earnings-note">
            That is a multiplication, not a projection — nothing here says anyone will ask.{' '}
            {hasRange
              ? `$${typicalFee} is the middle of the $${minFeeDollars}–$${maxFeeDollars} band you set, and you name the fee on every single request.`
              : 'You name the fee on every single request.'}
          </p>
        </aside>
      </section>

      <section className="es-block">
        <h3 className="es-block-title">The flow, start to finish</h3>
        <ol className="es-steps">
          {/* "Only customers already near your route" contradicted a feature on
              the same page: priority areas exist precisely to let somebody
              further out qualify, and an owner who set one up would have found
              this sentence saying it could not happen. */}
          <Step n={1} icon="route" title="We find the right jobs">
            Customers near your route that day are offered it — plus anyone inside a priority area you&apos;ve
            drawn, which is how you say &ldquo;this neighbourhood is worth the extra drive&rdquo;.
          </Step>
          <Step n={2} icon="bell" title="You get the request">
            The job, the address, the customer&apos;s details and how far off your route they are — texted and emailed
            to you the moment it lands.
          </Step>
          <Step n={3} icon="tag" title="You make an offer">
            Pick the arrival window and the fee that makes it worth doing. Or decline, and it stays an ordinary lead.
          </Step>
          <Step n={4} icon="check" title="The customer chooses">
            They pay the fee and it&apos;s confirmed, or they skip it and carry on as a normal enquiry. Either way you
            keep the lead.
          </Step>
        </ol>
      </section>

      <div className="es-split">
        <section className="es-block">
          <h3 className="es-block-title">What the customer sees</h3>
          <div className="es-phone" role="img" aria-label="Preview of the message a customer receives">
            <p className="es-phone-from">
              <span className="es-phone-avatar" aria-hidden="true">{businessName.slice(0, 1)}</span>
              {businessName}
            </p>
            <p className="es-phone-bubble">We&apos;re in your area today. Want us out sooner?</p>
            <p className="es-phone-sub">Choose faster service for a Quick Stop fee, or carry on as a normal enquiry.</p>
            <p className="es-phone-choice primary">
              Pay for faster service <span aria-hidden="true">→</span>
              <small>booked once payment clears</small>
            </p>
            <p className="es-phone-choice">
              Carry on as normal <span aria-hidden="true">→</span>
              <small>treated as an ordinary lead</small>
            </p>
            <p className="es-phone-foot"><Icon name="shield" /> Always optional. Never booked automatically.</p>
          </div>
        </section>

        <section className="es-block">
          <h3 className="es-block-title">An example</h3>
          <div className="es-example">
            <p className="es-example-job">Kitchen faucet repair</p>
            <ul className="es-example-facts">
              <li><Icon name="pin" /> 12 minutes from your last job</li>
              <li><Icon name="clock" /> Customer free after 5:30 PM</li>
            </ul>
            <div className="es-example-offer-box">
              <p className="es-example-label">Your offer</p>
              <p className="es-example-offer">6:30 – 7:15 PM</p>
              <p className="es-example-fee">${typicalFee}<span>Quick Stop fee</span></p>
            </div>
            <p className="es-example-note">If they pass, the lead stays yours as a normal enquiry.</p>
          </div>
        </section>
      </div>

      <section className="es-block">
        <h3 className="es-block-title">Why contractors turn it on</h3>
        <ul className="es-benefits">
          <Benefit icon="cash" tone="money" title="More from the day you’re already working">
            Paid extra by customers who value speed, on work already near your route.
          </Benefit>
          <Benefit icon="clock" tone="time" title="Only when it suits you">
            You pick the window. Nothing lands on your calendar without you saying yes.
          </Benefit>
          <Benefit icon="pin" tone="route" title="Route-friendly only">
            Nearby jobs only, so the detour is short and the day still works.
          </Benefit>
          <Benefit icon="shield" tone="safe" title="No risk">
            Nothing is booked until the payment clears.
          </Benefit>
          <Benefit icon="users" tone="lead" title="You keep the lead either way">
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
      </section>
    </div>
  );
}
