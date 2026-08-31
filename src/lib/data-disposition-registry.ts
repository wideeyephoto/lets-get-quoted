/**
 * Multidimensional Data Disposition Registry (111+ Schema Tables)
 *
 * Defines the comprehensive data lifecycle, privacy categorization, and
 * retention/anonymization rules strictly aligned with PostgreSQL schema.sql definitions.
 * Covers 100% of all 115 PostgreSQL tables defined in the canonical database schema.
 */

export interface RetentionPolicy {
  jurisdiction: 'US_FEDERAL' | 'US_STATE' | 'GENERAL';
  legalBasis: 'statutory_tax_7yr' | 'contractual_fulfillment' | 'dispute_limitation' | 'transient_operational' | 'voice_quality_review';
  durationDays: number;
  startEvent: 'job_completed' | 'invoice_paid' | 'call_ended' | 'account_closed' | 'immediate';
}

export interface TableDisposition {
  tableName: string;
  relationship: 'direct_account_id' | 'account_primary_key' | 'fk_chain' | 'storage_path' | 'system_global';
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
  // Primary account tenant root
  accounts: {
    tableName: 'accounts',
    relationship: 'account_primary_key',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["business_name"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },

  // Account user memberships and RBAC mappings
  memberships: {
    tableName: 'memberships',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Hosted contractor website and branding
  sites: {
    tableName: 'sites',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["company_name","phone","headline","tagline","service_area"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Internal operator notes on workspace
  account_notes: {
    tableName: 'account_notes',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Workspace segmentation tags
  account_tags: {
    tableName: 'account_tags',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Uploaded files and attachments metadata
  account_attachments: {
    tableName: 'account_attachments',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'storage',
  },

  // Ledger of credits granted to workspace
  account_credits: {
    tableName: 'account_credits',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // User authentication and access log
  login_events: {
    tableName: 'login_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Contractor calendar blackout blocks
  availability_blocks: {
    tableName: 'availability_blocks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Route optimization day-plan preferences
  day_plan_prefs: {
    tableName: 'day_plan_prefs',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Global distributed rate limit buckets
  rate_limits: {
    tableName: 'rate_limits',
    relationship: 'system_global',
    primaryKeyColumn: 'key',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 7, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Homeowner client directory
  clients: {
    tableName: 'clients',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["name","phone","email","address","notes"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Inbound project leads and intake
  leads: {
    tableName: 'leads',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["name","phone","email","address","message"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Work orders, contracts, and job records
  jobs: {
    tableName: 'jobs',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["client_name","client_phone","client_email","address","scope"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Timeline activity updates for jobs
  job_feed: {
    tableName: 'job_feed',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["author","title","body","action_url"],
    portability: 'full',
    exportRedactions: ["meta.receipt_id","meta.internal_flags"],
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Punch-list and subtasks within jobs
  job_tasks: {
    tableName: 'job_tasks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Customer portal bearer tokens and auth
  client_job_access: {
    tableName: 'client_job_access',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["client_email","client_phone","token_hash"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Outbound quote proposals and interactive options
  estimate_offers: {
    tableName: 'estimate_offers',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["phone","body","reply_body"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Quick-stop detour service inquiries
  extra_stop_requests: {
    tableName: 'extra_stop_requests',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["client_name","client_phone","client_email","address","ai_summary","contractor_note"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Detour request audit and dispute trail
  extra_stop_events: {
    tableName: 'extra_stop_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // AI qualification and screening results
  extra_stop_screenings: {
    tableName: 'extra_stop_screenings',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Project phase milestones and progress gates
  job_milestones: {
    tableName: 'job_milestones',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Photo evidence associated with milestones
  milestone_photos: {
    tableName: 'milestone_photos',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'storage',
  },

  // Realtime GPS technician breadcrumbs
  job_tracking: {
    tableName: 'job_tracking',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Customer proposed appointment slots
  job_schedule_requests: {
    tableName: 'job_schedule_requests',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Automated appointment reschedule offers
  reschedule_offers: {
    tableName: 'reschedule_offers',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Spam and suppressed lead numbers
  lead_blocklist: {
    tableName: 'lead_blocklist',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Field technician form responses
  field_submissions: {
    tableName: 'field_submissions',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Temporary reservation locks for scheduling
  booking_holds: {
    tableName: 'booking_holds',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 7, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Contractor service catalog and price list
  services: {
    tableName: 'services',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Billing invoices issued to homeowners
  invoices: {
    tableName: 'invoices',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["signer_name"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },

  // Line items on homeowner invoices
  invoice_items: {
    tableName: 'invoice_items',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ["invoice_id","invoices.account_id"],
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Direct customer payment transactions
  payments: {
    tableName: 'payments',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["homeowner_phone","label"],
    portability: 'full',
    exportRedactions: ["stripe_payment_intent","stripe_checkout_session"],
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'invoice_paid' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },

  // Material, labor, and subcontractor costs
  costs: {
    tableName: 'costs',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Homeowner consumer financing agreements
  finance_plans: {
    tableName: 'finance_plans',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Structured installment payment plans
  payment_plans: {
    tableName: 'payment_plans',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Future autopay scheduled charges
  scheduled_payments: {
    tableName: 'scheduled_payments',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Daily ledger cash balance history
  cash_snapshots: {
    tableName: 'cash_snapshots',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Maintenance and subscription service agreements
  recurring_plans: {
    tableName: 'recurring_plans',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Contractor LGQ platform subscription states
  billing_subscriptions: {
    tableName: 'billing_subscriptions',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'stripe',
  },

  // Feature tier allowances and seat caps
  workspace_entitlements: {
    tableName: 'workspace_entitlements',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Stripe webhook and billing state transitions
  billing_events: {
    tableName: 'billing_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Idempotent billing charge operations
  billing_payment_operations: {
    tableName: 'billing_payment_operations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Prepaid top-up credit grant records
  usage_credit_lots: {
    tableName: 'usage_credit_lots',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // In-flight usage credit reservation locks
  usage_reservations: {
    tableName: 'usage_reservations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Specific credit lot burn mappings
  usage_reservation_allocations: {
    tableName: 'usage_reservation_allocations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Monthly quota reset execution records
  billing_allowance_reset_operations: {
    tableName: 'billing_allowance_reset_operations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Connected account settlement processing tasks
  billing_direct_payment_settlement_tasks: {
    tableName: 'billing_direct_payment_settlement_tasks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Execution attempts on settlement tasks
  billing_direct_payment_settlement_attempts: {
    tableName: 'billing_direct_payment_settlement_attempts',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ["task_id","billing_direct_payment_settlement_tasks.account_id"],
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // One-time top-up checkout operations
  billing_top_up_purchase_operations: {
    tableName: 'billing_top_up_purchase_operations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Purchased extra crew seats
  workspace_purchased_capacity: {
    tableName: 'workspace_purchased_capacity',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Metered overage opt-in authorizations
  workspace_overage_authorizations: {
    tableName: 'workspace_overage_authorizations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Overage warning thresholds and limits
  workspace_overage_settings: {
    tableName: 'workspace_overage_settings',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Accrued unpaid metered units
  workspace_overage_accruals: {
    tableName: 'workspace_overage_accruals',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Periodic overage invoice settlements
  workspace_overage_settlements: {
    tableName: 'workspace_overage_settlements',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Raw metered usage event logs
  workspace_overage_accrual_events: {
    tableName: 'workspace_overage_accrual_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Settlement links to metered events
  workspace_overage_event_settlements: {
    tableName: 'workspace_overage_event_settlements',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Inbound AI voice reception call logs
  voice_calls: {
    tableName: 'voice_calls',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["caller_number","summary","transcript"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'voice_quality_review', durationDays: 90, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },

  // Concurrency admissions for voice trunking
  voice_call_admissions: {
    tableName: 'voice_call_admissions',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // SignalWire webhook and SIP event journal
  voice_events: {
    tableName: 'voice_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Voice assistant tone, script, and hours
  voice_settings: {
    tableName: 'voice_settings',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Interactive voice response execution state
  voice_call_workflows: {
    tableName: 'voice_call_workflows',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Operator notes on recorded call sessions
  voice_call_notes: {
    tableName: 'voice_call_notes',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'call_ended' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // SMS message content and delivery state
  sms_messages: {
    tableName: 'sms_messages',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["phone_number","body"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'signalwire',
  },

  // Telephony carrier delivery receipts
  sms_events: {
    tableName: 'sms_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // TCPA opt-in/opt-out consent tracking
  sms_consent: {
    tableName: 'sms_consent',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["phone_number"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Granular topic-based SMS consent scopes
  sms_consent_scopes: {
    tableName: 'sms_consent_scopes',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'phone_number',
    localAction: 'anonymize_columns',
    targetColumns: ["phone_number"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Contractor customized auto-SMS copy
  message_templates: {
    tableName: 'message_templates',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Marketing SMS/email broadcast campaigns
  campaigns: {
    tableName: 'campaigns',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Google review invitation tokens and feedback
  review_invites: {
    tableName: 'review_invites',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["client_name","google_url","feedback"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Email unsubscribe suppressions
  email_suppression: {
    tableName: 'email_suppression',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Resend transactional email delivery log
  email_events: {
    tableName: 'email_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
    vendorDependency: 'resend',
  },

  // Browser web push notification endpoints
  push_subscriptions: {
    tableName: 'push_subscriptions',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // 10DLC brand & campaign registration
  messaging_registrations: {
    tableName: 'messaging_registrations',
    relationship: 'account_primary_key',
    primaryKeyColumn: 'account_id',
    localAction: 'anonymize_columns',
    targetColumns: ["status_detail","assigned_number","provider_reference"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Carrier TCR vetting submission details
  messaging_registration_applications: {
    tableName: 'messaging_registration_applications',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["legal_business_name","dba_name","business_email","business_phone","authorized_contact_name","authorized_contact_title","authorized_contact_email","authorized_contact_phone","messaging_support_email","messaging_support_phone","address_line1","address_line2","city","region","postal_code","privacy_policy_url","terms_url"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // TCR compliance document check results
  messaging_compliance_verifications: {
    tableName: 'messaging_compliance_verifications',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // A2P TCR registration state transitions
  messaging_registration_events: {
    tableName: 'messaging_registration_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Dedicated virtual number orders
  messaging_number_provisioning_operations: {
    tableName: 'messaging_number_provisioning_operations',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Carrier API provisioning attempt history
  messaging_number_provisioning_attempts: {
    tableName: 'messaging_number_provisioning_attempts',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ["operation_id","messaging_number_provisioning_operations.account_id"],
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Assigned 10DLC sender phone numbers
  sms_sender_numbers: {
    tableName: 'sms_sender_numbers',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Global compliance keyword actions (STOP, HELP)
  sms_sender_keyword_preferences: {
    tableName: 'sms_sender_keyword_preferences',
    relationship: 'system_global',
    primaryKeyColumn: 'keyword',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Queued SMS delivery workers
  sms_delivery_tasks: {
    tableName: 'sms_delivery_tasks',
    relationship: 'fk_chain',
    primaryKeyColumn: 'sms_event_id',
    fkPath: ["sms_event_id","sms_events.account_id"],
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Carrier dispatch attempts on tasks
  sms_delivery_attempts: {
    tableName: 'sms_delivery_attempts',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ["task_id","sms_delivery_tasks.sms_event_id"],
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Raw inbound telephony webhooks
  sms_webhook_receipts: {
    tableName: 'sms_webhook_receipts',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Human-in-the-loop triage queue
  sms_operator_review_items: {
    tableName: 'sms_operator_review_items',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Inbound message webhook processor jobs
  sms_inbound_action_tasks: {
    tableName: 'sms_inbound_action_tasks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Platform monthly carrier spend quotas
  messaging_number_spend_policies: {
    tableName: 'messaging_number_spend_policies',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Payment link auto-SMS tasks
  payment_sms_producer_tasks: {
    tableName: 'payment_sms_producer_tasks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 30, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Missed call speed-to-lead auto-replies
  sms_missed_call_receipts: {
    tableName: 'sms_missed_call_receipts',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Mandatory compliance response dedup log
  sms_compliance_reply_results: {
    tableName: 'sms_compliance_reply_results',
    relationship: 'system_global',
    primaryKeyColumn: 'phone_number',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // TCR approval/rejection webhook receipts
  messaging_registry_callbacks: {
    tableName: 'messaging_registry_callbacks',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Standardized system carrier notice templates
  sms_shared_notice_replies: {
    tableName: 'sms_shared_notice_replies',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Field crew roster and contact info
  crew: {
    tableName: 'crew',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["name","phone","photo_path"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Crew job schedule dispatch assignments
  crew_assignments: {
    tableName: 'crew_assignments',
    relationship: 'direct_account_id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Labor clock-in/out and payroll hours
  time_entries: {
    tableName: 'time_entries',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["note"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Contractor frequent suppliers/depots
  saved_places: {
    tableName: 'saved_places',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Daily multi-stop route sequencing
  route_stops: {
    tableName: 'route_stops',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 0, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Weekly/bi-weekly contractor payroll periods
  crew_pay_periods: {
    tableName: 'crew_pay_periods',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Pay statements for crew members
  crew_pay_entries: {
    tableName: 'crew_pay_entries',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Line items on crew pay statements
  crew_pay_entry_lines: {
    tableName: 'crew_pay_entry_lines',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Payroll finalization and export audit trail
  crew_pay_events: {
    tableName: 'crew_pay_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Outsourced bid requests to trade subs
  subcontractor_requests: {
    tableName: 'subcontractor_requests',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Trade subcontractor bid proposals
  subcontractor_offers: {
    tableName: 'subcontractor_offers',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Internal ratings on subcontractor work
  subcontractor_reviews: {
    tableName: 'subcontractor_reviews',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'contractual_fulfillment', durationDays: 365, startEvent: 'job_completed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Staff admin action immutable audit log
  admin_actions: {
    tableName: 'admin_actions',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Internal staff platform user directory
  staff: {
    tableName: 'staff',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'exempt',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Staff role elevation audit trail
  staff_role_changes: {
    tableName: 'staff_role_changes',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'exempt',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Failed third-party webhook dead-letter queue
  webhook_failures: {
    tableName: 'webhook_failures',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Platform reliability emergency incident log
  platform_incidents: {
    tableName: 'platform_incidents',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Customer support tickets and inquiries
  support_cases: {
    tableName: 'support_cases',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["subject"],
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Staff internal comments on support tickets
  support_case_notes: {
    tableName: 'support_case_notes',
    relationship: 'fk_chain',
    primaryKeyColumn: 'id',
    fkPath: ["case_id","support_cases.account_id"],
    localAction: 'delete',
    portability: 'full',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // DSAR data export and erasure requests
  privacy_requests: {
    tableName: 'privacy_requests',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'anonymize_columns',
    targetColumns: ["details"],
    portability: 'full',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'dispute_limitation', durationDays: 1460, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Workspace lifecycle and audit events
  account_events: {
    tableName: 'account_events',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'US_FEDERAL', legalBasis: 'statutory_tax_7yr', durationDays: 2555, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // Scheduled background cron job run records
  cron_runs: {
    tableName: 'cron_runs',
    relationship: 'system_global',
    primaryKeyColumn: 'id',
    localAction: 'retain_immutable',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'transient_operational', durationDays: 90, startEvent: 'immediate' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

  // High-risk payment & chargeback evaluations
  risk_reviews: {
    tableName: 'risk_reviews',
    relationship: 'direct_account_id',
    primaryKeyColumn: 'id',
    localAction: 'delete',
    portability: 'internal_system',
    retention: { jurisdiction: 'GENERAL', legalBasis: 'dispute_limitation', durationDays: 365, startEvent: 'account_closed' },
    legalHoldBehavior: 'block_disposal_preserve_snapshot',
  },

};

export function getExportableTables(): string[] {
  return Object.values(DATA_DISPOSITION_REGISTRY)
    .filter((d) => d.portability === 'full' || d.portability === 'redacted')
    .map((d) => d.tableName);
}
