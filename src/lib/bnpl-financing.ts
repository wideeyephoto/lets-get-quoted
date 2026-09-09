import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  ACORN_MIN_LOAN_AMOUNT,
  ACORN_PROVIDER_ID,
  ACORN_PROVIDER_NAME,
  ACORN_STANDARD_DISCLOSURE,
  buildAcornApplyUrl,
  isHomeownerFinancingCustomerSurfacesEnabled,
} from '@/lib/acorn-financing';

export { HOMEOWNER_FINANCING } from '@/lib/financing-status';

export type FinancingSurface = 'quote' | 'invoice' | 'payment_request';

export type FinancingAvailability =
  | {
      available: false;
      reason:
        | 'not_configured'
        | 'not_enrolled'
        | 'account_disabled'
        | 'surface_disabled'
        | 'amount_ineligible'
        | 'kind_ineligible'
        | 'invoice_settled'
        | 'checkout_blocked';
      statusLabel: string;
      message: string;
      operatorNextStep: string;
    }
  | {
      available: true;
      provider: typeof ACORN_PROVIDER_ID;
      providerName: typeof ACORN_PROVIDER_NAME;
      applyUrl: string;
      disclosure: string;
    };

export type ResolveFinancingOptions = {
  adminClient?: SupabaseClient;
  paymentKind?: string;
  isSettled?: boolean;
  isBlocked?: boolean;
  docRef?: string;
};

export type HomeownerFinancingEnrollmentRow = {
  id: string;
  account_id: string;
  provider: string;
  provider_code: string | null;
  status: 'pending' | 'active' | 'suspended' | 'declined';
  enabled_on_quotes: boolean;
  enabled_on_invoices: boolean;
  enrolled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Resolves homeowner financing availability for a specific tenant and customer-facing surface.
 *
 * Enforces:
 * - Environment rollout flags (LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED)
 * - Settled, void, and zero-balance invoice exclusion
 * - Contractor checkout block exclusion (CHECKOUT_BLOCK_NOTE)
 * - In-house payment plan installment exclusion (no nested installment lending)
 * - Minimum loan amount threshold ($500)
 * - Multi-tenant account isolation and per-surface opt-in toggles
 * - Reg Z compliance: available: true carries an external referral URL and disclosure only,
 *   with NO numbers, terms, rates, or monthly payment amounts.
 */
export async function resolveHomeownerFinancing(
  accountId: string,
  surface: FinancingSurface,
  amount?: number,
  options?: ResolveFinancingOptions,
): Promise<FinancingAvailability> {
  if (!accountId) {
    return {
      available: false,
      reason: 'not_configured',
      statusLabel: 'Unavailable',
      message: 'Financing is not configured for this account.',
      operatorNextStep: 'Verify account identifier before resolving financing.',
    };
  }

  // Flag 2 must be explicitly enabled for customer-facing surfaces to render anything.
  if (!isHomeownerFinancingCustomerSurfacesEnabled()) {
    return {
      available: false,
      reason: 'not_configured',
      statusLabel: 'Not enabled',
      message: 'Homeowner financing is currently disabled on this deployment.',
      operatorNextStep: 'Enable LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED after partner verification.',
    };
  }

  // Never offer financing on an invoice that is already settled or paid in full.
  if (options?.isSettled) {
    return {
      available: false,
      reason: 'invoice_settled',
      statusLabel: 'Settled',
      message: 'This invoice is already settled.',
      operatorNextStep: 'No action required for settled invoices.',
    };
  }

  // Never offer financing if contractor checkout is blocked.
  if (options?.isBlocked) {
    return {
      available: false,
      reason: 'checkout_blocked',
      statusLabel: 'Checkout blocked',
      message: 'Payments are currently unavailable for this contractor.',
      operatorNextStep: 'Resolve contractor onboarding or payouts restrictions.',
    };
  }

  // In-house payment plan installments are already an installment schedule.
  if (options?.paymentKind === 'plan_installment') {
    return {
      available: false,
      reason: 'kind_ineligible',
      statusLabel: 'Ineligible payment',
      message: 'Financing cannot be applied to individual installment payments.',
      operatorNextStep: 'Financing applies to full quotes or whole invoices only.',
    };
  }

  // Loan minimum amount check ($500).
  if (typeof amount === 'number' && Number.isFinite(amount) && amount < ACORN_MIN_LOAN_AMOUNT) {
    return {
      available: false,
      reason: 'amount_ineligible',
      statusLabel: 'Below minimum',
      message: `Financing is only available for amounts of $${ACORN_MIN_LOAN_AMOUNT} or greater.`,
      operatorNextStep: `Acorn financing requires a minimum project amount of $${ACORN_MIN_LOAN_AMOUNT}.`,
    };
  }

  const admin = options?.adminClient || createAdminClient();
  const { data, error } = await admin
    .from('homeowner_financing_enrollments')
    .select('*')
    .eq('account_id', accountId)
    .eq('provider', ACORN_PROVIDER_ID)
    .maybeSingle();

  if (error || !data) {
    return {
      available: false,
      reason: 'not_enrolled',
      statusLabel: 'Not enrolled',
      message: 'Contractor is not enrolled in homeowner financing.',
      operatorNextStep: 'Enable homeowner financing in Settings under Connected apps.',
    };
  }

  const enrollment = data as HomeownerFinancingEnrollmentRow;

  if (enrollment.status !== 'active') {
    return {
      available: false,
      reason: 'account_disabled',
      statusLabel: enrollment.status === 'suspended' ? 'Suspended' : 'Pending',
      message: enrollment.disabled_reason || 'Financing is currently inactive for this account.',
      operatorNextStep: 'Review account financing status in Settings.',
    };
  }

  // Verify surface-specific toggle
  const isSurfaceEnabled =
    surface === 'quote'
      ? enrollment.enabled_on_quotes
      : enrollment.enabled_on_invoices; // 'invoice' and 'payment_request' share the invoice toggle

  if (!isSurfaceEnabled) {
    return {
      available: false,
      reason: 'surface_disabled',
      statusLabel: 'Disabled on this surface',
      message: `Financing is disabled for ${surface}s by the contractor.`,
      operatorNextStep: `Enable financing for ${surface}s in Settings under Connected apps.`,
    };
  }

  const applyUrl = buildAcornApplyUrl({
    dealerCode: enrollment.provider_code,
    amount,
    docRef: options?.docRef,
  });

  return {
    available: true,
    provider: ACORN_PROVIDER_ID,
    providerName: ACORN_PROVIDER_NAME,
    applyUrl,
    disclosure: ACORN_STANDARD_DISCLOSURE,
  };
}
