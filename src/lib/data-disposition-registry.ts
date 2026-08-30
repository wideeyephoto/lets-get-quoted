/**
 * Multidimensional Data Disposition Registry
 *
 * Defines the comprehensive data lifecycle, privacy categorization, and
 * retention/anonymization rules for all data assets in the platform.
 */

export interface RetentionPolicy {
  jurisdiction: 'US_FEDERAL' | 'US_STATE' | 'GENERAL';
  legalBasis: 'statutory_tax_7yr' | 'contractual_fulfillment' | 'dispute_limitation' | 'transient_operational' | 'voice_quality_review';
  durationDays: number;
  startEvent: 'job_completed' | 'invoice_paid' | 'call_ended' | 'account_closed' | 'immediate';
}

export interface TableDisposition {
  tableName: string;
  relationship: 'direct_account_id' | 'fk_chain' | 'storage_path';
  fkPath?: string[];
  localAction: 'delete' | 'anonymize_columns' | 'retain_immutable';
  targetColumns?: string[]; // Columns to mask/nullify during anonymization
  portability: 'full' | 'redacted' | 'exempt' | 'internal_system';
  exportRedactions?: string[];
  retention: RetentionPolicy;
  legalHoldBehavior: 'block_disposal_preserve_snapshot';
  vendorDependency?: 'stripe' | 'quickbooks' | 'storage' | 'signalwire' | 'resend';
}

export const DATA_DISPOSITION_REGISTRY: Record<string, TableDisposition> = {
  // --- CRM & Core Customer Records ---
  clients: {
    tableName: 'clients',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'address', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  leads: {
    tableName: 'leads',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'address', 'message'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  jobs: {
    tableName: 'jobs',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_name', 'client_phone', 'client_email', 'address', 'scope', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  job_feed: {
    tableName: 'job_feed',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['author', 'title', 'body', 'meta'],
    portability: 'full',
    exportRedactions: ['meta.receipt_id', 'meta.internal_flags'],
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  job_tasks: {
    tableName: 'job_tasks',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  job_milestones: {
    tableName: 'job_milestones',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['title', 'summary', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  milestone_photos: {
    tableName: 'milestone_photos',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'storage',
  },
  change_orders: {
    tableName: 'change_orders',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['description', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  warranties: {
    tableName: 'warranties',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['terms', 'client_name', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  extra_stop_requests: {
    tableName: 'extra_stop_requests',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['address', 'notes', 'requester_phone'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Financial & Invoicing ---
  invoices: {
    tableName: 'invoices',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_name', 'client_email', 'client_phone', 'client_address'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },
  invoice_items: {
    tableName: 'invoice_items',
    relationship: 'fk_chain',
    fkPath: ['invoice_id', 'invoices.account_id'],
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  payments: {
    tableName: 'payments',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['customer_name', 'customer_email', 'receipt_url'],
    portability: 'full',
    exportRedactions: ['payment_intent_secret'],
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },
  scheduled_payments: {
    tableName: 'scheduled_payments',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  payment_plans: {
    tableName: 'payment_plans',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_name', 'client_email'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  costs: {
    tableName: 'costs',
    relationship: 'direct_account_id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  account_credits: {
    tableName: 'account_credits',
    relationship: 'direct_account_id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Voice, Messaging & Consent ---
  voice_calls: {
    tableName: 'voice_calls',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['caller_number', 'transcript', 'summary', 'extracted_contact'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'voice_quality_review', durationDays: 90, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },
  sms_messages: {
    tableName: 'sms_messages',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number', 'body', 'media_urls', 'raw_payload'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },
  sms_consent: {
    tableName: 'sms_consent',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  sms_consent_scopes: {
    tableName: 'sms_consent_scopes',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  email_suppression: {
    tableName: 'email_suppression',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['email'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  messaging_registrations: {
    tableName: 'messaging_registrations',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['ein', 'legal_business_name', 'authorized_representative_email', 'authorized_representative_phone'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  messaging_registration_applications: {
    tableName: 'messaging_registration_applications',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['ein', 'legal_business_name', 'contact_first_name', 'contact_last_name', 'contact_email', 'contact_phone', 'address_lines'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Workforce, Roster & Time Tracking ---
  crew: {
    tableName: 'crew',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  crew_assignments: {
    tableName: 'crew_assignments',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  time_entries: {
    tableName: 'time_entries',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['notes'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  office_invitations: {
    tableName: 'office_invitations',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'exempt',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  review_invites: {
    tableName: 'review_invites',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_phone', 'client_email'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- System Audit & Internal Telemetry ---
  account_events: {
    tableName: 'account_events',
    relationship: 'direct_account_id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  webhook_failures: {
    tableName: 'webhook_failures',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  privacy_requests: {
    tableName: 'privacy_requests',
    relationship: 'direct_account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['details', 'requester_email'],
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
};

export function getExportableTables(): string[] {
  return Object.values(DATA_DISPOSITION_REGISTRY)
    .filter((d) => d.portability === 'full' || d.portability === 'redacted')
    .map((d) => d.tableName);
}
