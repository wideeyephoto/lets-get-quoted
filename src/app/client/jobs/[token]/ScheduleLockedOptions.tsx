/**
 * The dates the contractor has offered, shown but not yet pickable.
 *
 * WHY SHOW THEM AT ALL. There are two states where a homeowner may not choose a
 * date yet — a deposit the contractor requires before scheduling, and a payment
 * plan still waiting on its first payment — and one of them used to render
 * NOTHING. A customer who had been texted "here are three dates" opened the page
 * and found no dates and no explanation. Hiding the offer does not stop them
 * wanting it; it just stops them knowing it exists.
 *
 * So the dates appear, in the same cards, and the card above them says which
 * one thing stands between the customer and picking one. Seeing "Aug 18" behind
 * a lock is what makes "set up payment" worth doing.
 *
 * NOT A DISABLED FORM. There is no <input> here at all — no radio to tab onto,
 * no fieldset, nothing a screen reader announces as a control that then refuses
 * to work. It is a list, marked up as a list, with the reason stated in text
 * above it rather than implied by a lock glyph. `aria-hidden` on the glyph for
 * the same reason: "🔒" read aloud between a date and a time is noise.
 */
export default function ScheduleLockedOptions({ options }: { options: Array<{ label: string; index: number }> }) {
  if (options.length === 0) return null;

  return (
    <ul className="date-choice-grid date-choice-locked">
      {options.map((option) => (
        <li className="date-card is-locked" key={option.index}>
          <span className="date-card-body">
            <span className="date-card-label">Option {option.index + 1}</span>
            <strong className="date-card-when">{option.label}</strong>
          </span>
          <span className="date-card-tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
              <path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7" />
            </svg>
          </span>
        </li>
      ))}
    </ul>
  );
}
