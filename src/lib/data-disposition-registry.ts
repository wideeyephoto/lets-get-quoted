/**
 * Multidimensional Data Disposition Registry
 *
 * Defines the comprehensive data lifecycle, privacy categorization, and
 * retention/anonymization rules strictly aligned with PostgreSQL schema.sql definitions.
 */

export interface RetentionPolicy {
  jurisdiction: 'US_FEDERAL' | 'US_STATE' | 'GENERAL';
  legalBasis: 'statutory_tax_7yr' | 'contractual_fulfillment' | 'dispute_limitation' | 'transient_operational' | 'voice_quality_review';
  durationDays: number;
  startEvent: 'job_completed' | 'invoice_paid' | 'call_ended' | 'account_closed' | 'immediate';
}

export interface TableDisposition {
  tableName: string;
  relationship: 'direct_account_id' | 'account_primary_key' | 'fk_chain' | 'storage_path';
  primaryKeyColumn?: string;
  fkPath?: string[];
  localAction: 'delete' | 'anonymize_columns' | 'retain_immutable';
  targetColumns?: string[]; // Verified columns present in schema.sql
  portability: 'full' | 'redacted' | 'exempt' | 'internal_system';
  exportRedactions?: string[];
  retention: RetentionPolicy;
  legalHoldBehavior: 'block_disposal_preserve_snapshot';
  vendorDependency?: 'stripe' | 'quickbooks' | 'storage' | 'signalwire' | 'resend';
}

export const DATA_DISPOSITION_REGISTRY: Record<string, TableDisposition> = {
  // --- Account Root & Tenancy ---
  accounts: {
    tableName: 'accounts',
    relationship: 'account_primary_key',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['business_name', 'mailing_address', 'sms_number', 'alert_phone', 'service_center_lat', 'service_center_lng'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },

  // --- CRM & Core Customer Records ---
  clients: {
    tableName: 'clients',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'address', 'notes'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  leads: {
    tableName: 'leads',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'address', 'message'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  jobs: {
    tableName: 'jobs',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_name', 'client_phone', 'client_email', 'address', 'scope', 'quote_signer_name', 'quote_signature_path'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  job_feed: {
    tableName: 'job_feed',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['author', 'title', 'body', 'action_url'],
    portability: 'full',
    exportRedactions: ['meta.receipt_id', 'meta.internal_flags'],
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  job_tasks: {
    tableName: 'job_tasks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  client_job_access: {
    tableName: 'client_job_access',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['client_email', 'client_phone', 'token_hash'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  estimate_offers: {
    tableName: 'estimate_offers',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone', 'body', 'reply_body'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  extra_stop_requests: {
    tableName: 'extra_stop_requests',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
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
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['signer_name'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },
  invoice_items: {
    tableName: 'invoice_items',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ['invoice_id', 'invoices.account_id'],
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  payments: {
    tableName: 'payments',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['homeowner_phone', 'failure_message', 'label'],
    portability: 'full',
    exportRedactions: ['stripe_payment_intent', 'stripe_checkout_session'],
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },
  costs: {
    tableName: 'costs',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Voice, Messaging & A2P Registration ---
  voice_calls: {
    tableName: 'voice_calls',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['caller_number', 'summary', 'transcript'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'voice_quality_review', durationDays: 90, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },
  sms_messages: {
    tableName: 'sms_messages',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number', 'body', 'media_urls'],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },
  sms_consent: {
    tableName: 'sms_consent',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  sms_consent_scopes: {
    tableName: 'sms_consent_scopes',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'phone_number',
    localAction: 'anonymize_columns',
    targetColumns: ['phone_number'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  messaging_registrations: {
    tableName: 'messaging_registrations',
    relationship: 'account_primary_key',
    primaryKeyColumn: 'account_id',
    localAction: 'anonymize_columns',
    targetColumns: ['status_detail', 'assigned_number', 'provider_reference'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  messaging_registration_applications: {
    tableName: 'messaging_registration_applications',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: [
      'legal_business_name', 'dba_name', 'business_email', 'business_phone',
      'authorized_contact_name', 'authorized_contact_title', 'authorized_contact_email', 'authorized_contact_phone',
      'messaging_support_email', 'messaging_support_phone', 'address_line1', 'address_line2',
      'city', 'region', 'postal_code', 'privacy_policy_url', 'terms_url'
    ],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Workforce, Roster & Time Tracking ---
  crew: {
    tableName: 'crew',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['name', 'phone', 'email', 'start_address'],
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
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ['note'],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  saved_places: {
    tableName: 'saved_places',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
  route_stops: {
    tableName: 'route_stops',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // --- Internal System Audit & Telemetry ---
  account_events: {
    tableName: 'account_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },
};

export function getExportableTables(): string[] {
  return Object.values(DATA_DISPOSITION_REGISTRY)
    .filter((d) => d.portability === 'full' || d.portability === 'redacted')
    .map((d) => d.tableName);
}
