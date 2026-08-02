import Link from 'next/link';

// A compact contextual entry point to an automation's settings, shown on the page
// where that automation's effect is felt (Quick Stop on the Quick Stops page,
// reminders on the Schedule, …). It surfaces the live on/off state and deep-links
// into the matching Automations card, which auto-opens on arrival — so settings
// stay in one place while becoming discoverable in context.
export default function AutomationLink({
  id,
  label,
  on,
  onLabel = 'On',
  offLabel = 'Off',
}: {
  id: string; // the Automations card id, e.g. 'extra-stop' | 'reminders'
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <Link href={`/dashboard/settings#${id}`} className="automation-link">
      <span className={`automation-link-pill ${on ? 'on' : 'off'}`}>{on ? onLabel : offLabel}</span>
      <span className="automation-link-label">{label}</span>
      <span className="automation-link-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
