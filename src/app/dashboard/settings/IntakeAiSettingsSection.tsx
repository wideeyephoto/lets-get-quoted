import { updateIntakeSettingsAction } from './actions';
import { ESTIMATE_POSTURES } from '@/lib/estimate-posture';
import SaveButton from '@/components/save-button';

// The Automations "Intake AI" tuning form (account-level: estimate posture,
// lead-priority threshold, alerts). Shared so it can also render inside the
// Website Builder's AI-intake section — both write the same account columns via
// updateIntakeSettingsAction, so they always mirror.
export default function IntakeAiSettingsSection({
  estimatePosture,
  highValueLeadAmount,
  muteLowQualityLeads,
  highValueSmsEnabled,
  alertPhone,
}: {
  estimatePosture: string;
  highValueLeadAmount: number | null;
  muteLowQualityLeads: boolean;
  highValueSmsEnabled: boolean;
  alertPhone: string;
}) {
  return (
    <section className="panel workspace-section-card" id="intake-ai">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Intake AI</p>
        <h2>Tune your instant estimates &amp; lead priority</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Your website&apos;s AI intake opens the relationship for you: it asks a homeowner{' '}
        <strong>2&ndash;8 short questions</strong>, gives them a instant ballpark, and captures the
        details &mdash; building trust in the first 30 seconds, then handing that warm, qualified lead
        straight to you. The estimate is a smart pre-visit range (you set the exact quote on-site), so it
        lands most jobs in the right neighborhood and gets the conversation started before a competitor
        even picks up.
      </p>
      <form action={updateIntakeSettingsAction} className="form-grid compact-form">
        <div className="field full">
          <label htmlFor="estimatePosture">Estimate pricing posture</label>
          <select id="estimatePosture" name="estimatePosture" defaultValue={estimatePosture}>
            {ESTIMATE_POSTURES.map((option) => (
              <option key={option.id} value={option.id}>{option.label} — {option.blurb}</option>
            ))}
          </select>
          <small className="field-hint">Shades every AI estimate lower (win on price) or higher (position on quality). It never changes your real quote — just the pre-visit ballpark the homeowner sees.</small>
        </div>

        <div className="field full">
          <label htmlFor="highValueLeadAmount">High-value lead threshold ($)</label>
          <input id="highValueLeadAmount" name="highValueLeadAmount" type="number" min="0" step="100" inputMode="numeric" placeholder="e.g. 5000" defaultValue={highValueLeadAmount ?? ''} />
          <small className="field-hint">When a lead&apos;s AI estimate could reach this amount, it&apos;s flagged <strong>high-value</strong> and jumps the line &mdash; louder alerts and top priority, so you respond to the big jobs first. Leave blank to turn priority off.</small>
        </div>

        <label className="checkbox-row" htmlFor="muteLowQualityLeads">
          <input id="muteLowQualityLeads" name="muteLowQualityLeads" type="checkbox" defaultChecked={muteLowQualityLeads} />
          <span>Don&apos;t interrupt me for low-quality leads &mdash; out-of-area, work you don&apos;t do, below-minimum, and &ldquo;just researching&rdquo; still land in your board, just without an alert or dashboard nag (keeps spam, marketing, and AI callers from stealing your attention)</span>
        </label>

        <label className="checkbox-row" htmlFor="highValueSmsEnabled">
          <input id="highValueSmsEnabled" name="highValueSmsEnabled" type="checkbox" defaultChecked={highValueSmsEnabled} />
          <span>Text my phone the moment a high-value lead comes in</span>
        </label>
        <div className="field full">
          <label htmlFor="alertPhone">My mobile for high-value texts</label>
          <input id="alertPhone" name="alertPhone" type="tel" inputMode="tel" placeholder="(248) 555-0100" defaultValue={alertPhone} />
          <small className="field-hint">Your own number &mdash; entering it opts you in to your own lead alerts. Standard rates apply.</small>
        </div>

        <div className="form-actions">
          <SaveButton>Save intake settings</SaveButton>
        </div>
      </form>
    </section>
  );
}
