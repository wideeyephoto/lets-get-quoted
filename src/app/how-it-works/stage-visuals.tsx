/**
 * One product visual per stage.
 *
 * These replaced four stacked text cards per stage. The page's argument is that
 * one job record survives five handoffs, and twenty definition cards could
 * state that but never show it — every stage looked equally dense and equally
 * abstract, which is the opposite of a journey.
 *
 * WHAT THESE ARE. Drawings of the product's own screens, in the site's palette:
 * off-white for anything the homeowner touches, ink for anything the contractor
 * works in, green only for a completed or automatic step, yellow only for
 * something waiting on a person. Every figure on them is invented — the page
 * labels them as an example where they appear — but every STATE is one the
 * product really has, and the wording is the product's own ("Hot", "phone
 * verified", "price book", "Customer texted").
 *
 * They carry aria-hidden: the meaning lives in each stage's heading and its
 * three annotations, which is also where a crawler should find it. Nothing here
 * is the only copy of anything.
 */

/** 01 — the site being generated: chips settling into a browser frame. */
export function BuildVisual() {
  return (
    <div className="hiw-vis hiw-vis-build" aria-hidden="true">
      <div className="hiw-browser">
        <div className="hiw-browser-bar">
          <i /><i /><i />
          <span className="hiw-url">brightline-electric.com</span>
          <em className="hiw-live">LIVE</em>
        </div>
        <div className="hiw-browser-body">
          <div className="hiw-site-hero">
            <b>Brightline Electric</b>
            <small>Royal Oak, MI · Licensed &amp; insured</small>
            <span className="hiw-site-cta">Get a free estimate</span>
          </div>
          <div className="hiw-site-grid">
            <span>Panel upgrades</span><span>EV chargers</span>
            <span>Rewiring</span><span>Lighting</span>
          </div>
        </div>
      </div>
      <ul className="hiw-chips">
        <li className="hiw-chip" style={{ ['--i' as string]: 0 }}>Trade <b>Electrician</b></li>
        <li className="hiw-chip" style={{ ['--i' as string]: 1 }}>Area <b>Royal Oak +6</b></li>
        <li className="hiw-chip" style={{ ['--i' as string]: 2 }}>Domain <b>Connected</b></li>
      </ul>
    </div>
  );
}

/** 02 — the homeowner's intake beside the lead it produces. */
export function QualifyVisual() {
  return (
    <div className="hiw-vis hiw-vis-qualify" aria-hidden="true">
      <div className="hiw-phone">
        <div className="hiw-phone-head">Tell us about the job</div>
        <div className="hiw-field"><small>What needs doing?</small><b>Kitchen ceiling — water stain</b></div>
        <div className="hiw-field"><small>How soon?</small><b>Within a month</b></div>
        <div className="hiw-photos">
          <span /><span /><span />
          <small>3 photos added</small>
        </div>
        <div className="hiw-verify"><i>✓</i> Phone verified by text</div>
      </div>
      <div className="hiw-leadcard">
        <div className="hiw-lead-top">
          <span className="hiw-score hiw-hot">HOT</span>
          <small>NEW LEAD · 2 MIN AGO</small>
        </div>
        <b className="hiw-lead-name">D. Whitfield · Royal Oak</b>
        <ul className="hiw-flags">
          <li className="ok"><i>✓</i> In your service area</li>
          <li className="ok"><i>✓</i> Above your minimum</li>
          <li className="ok"><i>✓</i> Phone verified</li>
          <li className="warn"><i>!</i> Waiting on your reply</li>
        </ul>
      </div>
    </div>
  );
}

/** 03 — the quote as the homeowner opens it, signed and paid. */
export function WinVisual() {
  return (
    <div className="hiw-vis hiw-vis-win" aria-hidden="true">
      <div className="hiw-quote">
        <div className="hiw-quote-head"><b>Quote #1048</b><small>Brightline Electric</small></div>
        <ul className="hiw-lines">
          <li><span>Ceiling repair &amp; seal</span><em>price book</em><b>$1,240</b></li>
          <li><span>Recessed lighting ×6</span><em>price book</em><b>$1,860</b></li>
          <li><span>Paint &amp; patch</span><em>price book</em><b>$640</b></li>
          <li className="est"><span>Access hatch</span><em>estimate — check</em><b>$510</b></li>
        </ul>
        <div className="hiw-quote-total"><span>Total</span><b>$4,250</b></div>
        <div className="hiw-sign">
          <small>SIGNED</small>
          <b className="hiw-signature">D. Whitfield</b>
          <span>Tue 9:41am</span>
        </div>
        <div className="hiw-paid"><i>✓</i> Deposit paid · $1,062.50</div>
      </div>
    </div>
  );
}

/** 04 — the week, the crew, the text and what the homeowner sees. */
export function RunVisual() {
  return (
    <div className="hiw-vis hiw-vis-run" aria-hidden="true">
      <div className="hiw-week">
        {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day) => (
          <div key={day} className={`hiw-day${day === 'TUE' ? ' is-on' : ''}`}>
            <small>{day}</small>
            {day === 'TUE' ? (
              <span className="hiw-job"><b>9–11am</b>Whitfield · Crew A</span>
            ) : (
              <span className="hiw-empty" />
            )}
          </div>
        ))}
      </div>
      <div className="hiw-run-side">
        <div className="hiw-text">
          <small>TO HOMEOWNER</small>
          <p>On my way — arriving 9:15–9:45am.</p>
          <em>Customer texted</em>
        </div>
        <div className="hiw-portal">
          <small>THEIR PORTAL</small>
          <ul>
            <li className="done"><i>✓</i> Quote approved</li>
            <li className="done"><i>✓</i> Date confirmed</li>
            <li className="now"><i>●</i> Crew on the way</li>
            <li><i>○</i> Final payment</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** 05 — payment, then the two things that follow it on their own. */
export function GrowVisual() {
  return (
    <div className="hiw-vis hiw-vis-grow" aria-hidden="true">
      <div className="hiw-receipt">
        <small>BALANCE PAID</small>
        <b>$3,187.50</b>
        <span>Bank transfer · Job #1048</span>
      </div>
      <div className="hiw-flowline"><i /></div>
      <div className="hiw-follow">
        <div className="hiw-follow-card">
          <small>REVIEW REQUEST</small>
          <p>How did we do?</p>
          <div className="hiw-two"><span>Leave a public review</span><span>Tell us privately</span></div>
          <em>Both offered, whatever the rating</em>
        </div>
        <div className="hiw-follow-card">
          <small>DUE TO REBOOK</small>
          <p>D. Whitfield · in 90 days</p>
          <em>Won&rsquo;t re-invite within 14 days</em>
        </div>
      </div>
    </div>
  );
}

export const STAGE_VISUALS = [BuildVisual, QualifyVisual, WinVisual, RunVisual, GrowVisual];
