import styles from './QuickStopHeaderExplainer.module.css';

// The "what is this" panel at the top of the Quick Stops demo, for somebody who
// has never heard of the feature. Shown to logged-OUT visitors only: a signed-in
// contractor browsing the demo already has the full explainer on their own page,
// and does not need the pitch twice.
//
// EVERY NUMBER HERE IS DERIVED FROM THE DEMO DATASET, none are written in. That
// rule is inherited from QuickStopExplainer, which says it plainly: a page that
// quotes made up numbers at a contractor is worse than one that says nothing.
// The first draft of this panel carried "$250 – $450 potential extra revenue"
// and "2 nearby openings this afternoon" — both invented, and the second dressed
// as live data. What is left is arithmetic on the same fee, radius, cutoff and
// daily cap the rest of the page already shows.
//
// The schedule and the route are LABELLED as an example, because they are one.

export type QuickStopHeaderExplainerProps = {
  feeCents: number;
  radiusMiles: number;
  cutoffTime: string;
  maxPerDay: number;
  todayTaken: number;
};

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function clockLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

// An illustrative day for a landscaping crew, matching the trade the demo
// requests describe. Marked as an example in the panel heading.
const DAY = [
  // Landscaping work, because the comment above says so and the demo account is
  // Evergreen Lawn & Landscape. These read "Roof inspection" and "Gutter
  // cleaning" — a roofer's morning on a landscaper's calendar.
  { kind: 'job', time: '8:00 AM', label: 'Spring cleanup' },
  { kind: 'gap', time: '8:45 – 10:15', label: 'Open window' },
  { kind: 'job', time: '10:30 AM', label: 'Hedge trimming' },
  { kind: 'gap', time: '11:10 – 12:45', label: 'Open window' },
  { kind: 'job', time: '1:00 PM', label: 'Landscaping' },
  { kind: 'gap', time: '2:00 – 3:00', label: 'Open window' },
  { kind: 'job', time: '3:15 PM', label: 'Sod install' },
  { kind: 'gap', time: '4:00 – 4:45', label: 'Open window' },
  { kind: 'job', time: '5:00 PM', label: 'Sprinkler repair' },
] as const;

// Stops along the illustrative route, in the abstract. Deliberately NOT drawn
// over a street grid: a fake map implies a real place, and the thing being shown
// is the RELATIONSHIP between the route and the zones, not a location.
const ROUTE = [
  { x: 118, y: 52 },
  { x: 196, y: 108 },
  { x: 268, y: 152 },
  { x: 96, y: 196 },
  { x: 248, y: 236 },
];

export default function QuickStopHeaderExplainer({
  feeCents, radiusMiles, cutoffTime, maxPerDay, todayTaken,
}: QuickStopHeaderExplainerProps) {
  const slotsLeft = Math.max(0, maxPerDay - todayTaken);
  const path = ROUTE.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <section className={styles.wrap} aria-labelledby="qs-explain-title">
      <header className={styles.head}>
        <div>
          <h2 id="qs-explain-title" className={styles.title}>
            Where Quick Stops can fit today
            {/* "Example", not "Live". The panel below is an illustration, and a
                Live pill on an illustration is a claim about data that isn't
                there — the page's own status strip further down is the live one. */}
            <span className={styles.badge}>Example</span>
          </h2>
          <p className={styles.lede}>
            A Quick Stop is only ever offered when you&apos;re already working nearby and the day has room for it.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>An example day</p>
          <ol className={styles.timeline}>
            {DAY.map((row) => (
              <li key={`${row.time}-${row.label}`} className={row.kind === 'gap' ? styles.gap : styles.job}>
                <span className={styles.rowTime}>{row.time}</span>
                <span className={styles.rowLabel}>{row.label}</span>
              </li>
            ))}
          </ol>
          <p className={styles.panelNote}>
            The open windows are where a stop can go — never on top of booked work.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>Within {radiusMiles} miles of the route</p>
          <svg className={styles.map} viewBox="0 0 340 280" role="img" aria-label={`An illustration of a day's route with ${radiusMiles}-mile zones around it`}>
            <circle className={styles.zone} cx="120" cy="90" r="76" />
            <circle className={styles.zone} cx="238" cy="180" r="84" />
            <path className={styles.route} d={path} />
            {ROUTE.map((point, index) => (
              <g key={`${point.x}-${point.y}`}>
                <circle className={styles.stop} cx={point.x} cy={point.y} r="13" />
                <text className={styles.stopNum} x={point.x} y={point.y + 4} textAnchor="middle">{index + 1}</text>
              </g>
            ))}
          </svg>
          <ul className={styles.legend}>
            <li><span className={styles.keyStop} aria-hidden="true" />Work already booked</li>
            <li><span className={styles.keyZone} aria-hidden="true" />Where a stop can come from</li>
          </ul>
          <p className={styles.panelNote}>
            {/* The real ranking is added minutes, not distance — see the request
                rows further down the page, which show "+N min added to your
                route". The radius is the outer limit, not the sort order. */}
            {radiusMiles} miles is the outer limit. What actually decides it is the minutes a detour adds.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>What has to be true</p>
          <ul className={styles.rules}>
            <li>They&apos;re within {radiusMiles} miles of somewhere you&apos;re already working</li>
            <li>There&apos;s an open window left in the day</li>
            <li>They asked before your {clockLabel(cutoffTime)} cutoff</li>
            <li>You haven&apos;t already hit {maxPerDay} stops</li>
          </ul>
          {/* The single most important correction to the original panel, which
              listed three conditions and implied a stop appears automatically
              once they are met. It never does. */}
          <p className={styles.approve}>
            <strong>Then you decide.</strong> You set the arrival window and the fee, and nothing is
            charged or booked until you accept.
          </p>
          <dl className={styles.figures}>
            <div>
              <dt>Your fee</dt>
              <dd>{money(feeCents)}</dd>
            </div>
            <div>
              <dt>Room left today</dt>
              <dd>{slotsLeft === 0 ? 'Day is full' : `${slotsLeft} stop${slotsLeft === 1 ? '' : 's'}`}</dd>
            </div>
            <div>
              <dt>Worth, if taken</dt>
              <dd>{money(feeCents * slotsLeft)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
