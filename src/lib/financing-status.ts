import { ACORN_PROVIDER_ID, ACORN_PROVIDER_NAME } from '@/lib/acorn-financing';

/** Static display data shared with browser components; no server client imports. */
export const HOMEOWNER_FINANCING = Object.freeze({
  provider: ACORN_PROVIDER_ID,
  providerName: ACORN_PROVIDER_NAME,
  status: 'pending_partner_approval',
  available: false,
  statusLabel: 'Pending partner setup',
  message: 'Homeowner financing through Acorn Finance is in setup. Prequalification referral will be available after partner configuration.',
  nextStep: 'Eligible customers will be able to review competitive financing options through Acorn Finance.',
  operatorNextStep: 'Configure Acorn Finance partner onboarding before offering homeowner financing.',
} as const);
