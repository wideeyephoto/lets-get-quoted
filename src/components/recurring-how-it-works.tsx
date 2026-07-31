// With no plans yet, the hero's right column was empty and the page's only other
// content was the sentence "No recurring plans yet." An owner arriving here has to
// decide whether this feature is worth setting up, so show them the loop it runs.
const STEPS = [
  { mark: '1', title: 'Set the cadence', detail: 'Weekly, every 2 weeks, or monthly — with a price per visit.' },
  { mark: '2', title: 'Visits create themselves', detail: 'Each one lands on your schedule as a real job, on its date.' },
  { mark: '3', title: 'The card gets charged', detail: 'Add a saved card and every visit bills itself. Nothing to chase.' },
];

export default function RecurringHowItWorks() {
  return (
    <div className="recurring-how">
      <p className="workspace-metric-label">How a plan runs</p>
      <ol className="recurring-how-steps">
        {STEPS.map((step) => (
          <li key={step.mark} className="recurring-how-step">
            <span className="recurring-how-mark" aria-hidden="true">{step.mark}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
