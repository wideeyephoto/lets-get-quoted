import SaveButton from '@/components/save-button';
import type { HomeownerFinancingEnrollmentRow } from '@/lib/bnpl-financing';
import { saveHomeownerFinancingAction } from './financing-actions';

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  saved: { tone: 'ok', text: 'Financing settings saved.' },
  error: { tone: 'warn', text: 'Could not save financing settings. Please try again.' },
};

export default function HomeownerFinancingSection({
  enrollment,
  notice,
}: {
  enrollment: HomeownerFinancingEnrollmentRow | null;
  notice?: string;
}) {
  const message = notice ? NOTICES[notice] : undefined;
  const enabledQuotes = enrollment?.enabled_on_quotes ?? false;
  const enabledInvoices = enrollment?.enabled_on_invoices ?? false;
  const providerCode = enrollment?.provider_code ?? '';

  return (
    <section className="panel workspace-section-card" id="financing">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Customer Financing</p>
        <h2>Acorn Finance</h2>
      </div>

      {message ? (
        <p className={message.tone === 'ok' ? 'form-success' : 'form-error'}>{message.text}</p>
      ) : null}

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Offer your clients flexible monthly payment options through Acorn Finance&rsquo;s lending
        marketplace. There are <strong>no merchant fees</strong> and no cost to your business.
        Approved homeowners receive funds directly into their own bank account and pay you normally
        through your standard credit card or ACH payment methods.
      </p>

      <form action={saveHomeownerFinancingAction} className="form-grid compact-form">
        <div className="field full">
          <label className="checkbox-label" htmlFor="enabled_on_quotes">
            <input
              type="checkbox"
              id="enabled_on_quotes"
              name="enabled_on_quotes"
              defaultChecked={enabledQuotes}
            />
            <span>
              <strong>Offer on quotes</strong> &mdash; Display a &ldquo;See financing options&rdquo;
              button on your digital quote deck to help clients approve larger scopes.
            </span>
          </label>
        </div>

        <div className="field full">
          <label className="checkbox-label" htmlFor="enabled_on_invoices">
            <input
              type="checkbox"
              id="enabled_on_invoices"
              name="enabled_on_invoices"
              defaultChecked={enabledInvoices}
            />
            <span>
              <strong>Offer on invoices</strong> &mdash; Display monthly payment options on unpaid
              public invoice pages and payment requests.
            </span>
          </label>
        </div>

        <div className="field full" style={{ marginTop: '0.5rem' }}>
          <label htmlFor="provider_code">
            Acorn Dealer / Partner Code <span className="field-optional">(optional)</span>
          </label>
          <input
            id="provider_code"
            name="provider_code"
            defaultValue={providerCode}
            placeholder="e.g. 2D6DU"
            maxLength={32}
          />
          <small className="field-hint">
            If Acorn provided you with a unique contractor partner code, enter it here to link your
            account attribution. Otherwise, the platform default partner code is used.
          </small>
        </div>

        <div className="form-actions" style={{ marginTop: '0.5rem' }}>
          <SaveButton onlyWhenChanged>Save financing settings</SaveButton>
        </div>
      </form>
    </section>
  );
}
