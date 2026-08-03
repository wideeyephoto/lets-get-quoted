// How far through this you are, and how much is left.
//
// Both booking flows are a sequence of questions, and neither ever said how
// many. The classic form does say "Step 2" — but only once you have scrolled
// far enough to be standing on it, which is the wrong moment to find out there
// is a step 3. The estimate-first flow was worse: it replaces the whole card
// each turn, so "Quick question" could be the second screen or the fifth and
// nothing on the page could tell you which.
//
// `current` is optional. Without it (the classic form, where every step is on
// one page) this reads as a contents list rather than a progress bar — no step
// is "active" when they are all in front of you.
export default function BookingSteps({
  steps,
  current,
}: {
  steps: { n: number; label: string }[];
  current?: number;
}) {
  return (
    <ol className="book-steps" aria-label={current ? `Step ${current} of ${steps.length}` : 'What this takes'}>
      {steps.map((step) => {
        const state = current == null ? 'idle' : step.n < current ? 'done' : step.n === current ? 'now' : 'todo';
        return (
          <li key={step.n} className="book-step" data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="book-step-n" aria-hidden="true">{state === 'done' ? '✓' : step.n}</span>
            <span className="book-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
