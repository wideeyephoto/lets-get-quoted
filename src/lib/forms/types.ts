/**
 * Data structures and types for the Conditional Field-Form Builder.
 * Covers Inspections, Commissioning, QA, Completion Certificates, and Customer Signatures.
 */

export type FormCategory =
  | 'inspection'
  | 'commissioning'
  | 'qa'
  | 'completion_certificate'
  | 'safety';

export type TradeSpecialization =
  | 'all'
  | 'hvac'
  | 'electrical'
  | 'plumbing'
  | 'roofing'
  | 'general'
  | 'painting'
  | 'solar'
  | 'carpentry';

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'pass_fail_na'
  | 'photo'
  | 'signature'
  | 'scale'
  | 'date'
  | 'time';

export type PassFailNaValue = 'pass' | 'fail' | 'na' | null;

export type RuleOperator =
  | 'equals'
  | 'not_equals'
  | 'is_pass'
  | 'is_fail'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

export type RuleAction =
  | 'show'
  | 'hide'
  | 'require'
  | 'flag_critical_issue';

export interface ConditionalRule {
  id: string;
  triggerFieldId: string;
  operator: RuleOperator;
  value?: string | number | boolean;
  action: RuleAction;
  targetFieldId?: string; // If affecting another field, otherwise applies to this field
  warningMessage?: string; // Displayed when rule triggers (e.g. Critical Safety Alert)
}

export interface FormField {
  id: string;
  label: string;
  helpText?: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: string[]; // For select, radio, checkbox
  unit?: string; // For numbers (e.g. 'PSI', 'Volts', 'Amps', '°F', 'CFM', 'in. w.c.', 'ft-lbs', 'Sq Ft')
  min?: number;
  max?: number;
  step?: number;
  allowPhotoCaption?: boolean;
  minPhotos?: number;
  maxPhotos?: number;
  conditionalRules?: ConditionalRule[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormTemplate {
  id: string;
  accountId: string;
  title: string;
  description: string;
  category: FormCategory;
  trade: TradeSpecialization;
  requireCustomerSignature: boolean;
  customerSignatureDisclaimer?: string;
  requireTechSignature: boolean;
  sections: FormSection[];
  isPreset?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormPhotoAttachment {
  id: string;
  fieldId: string;
  path: string;
  url?: string;
  caption?: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}

export interface DigitalSignature {
  path: string; // SVG / canvas stroke vector path
  name: string; // Printed legal name
  title?: string; // Role or relationship
  signedAt: string; // ISO timestamp
  ip?: string; // IP for legal evidence
}

export type FormSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'passed'
  | 'needs_remediation'
  | 'awaiting_customer_signature'
  | 'completed';

export interface FormComplianceSummary {
  totalItems: number;
  passedItems: number;
  failedItems: number;
  naItems: number;
  compliancePct: number; // 0 - 100
  criticalIssues: string[];
  isCompliant: boolean;
  unresolvedRequiredCount: number;
}

export interface JobFormSubmission {
  id: string;
  accountId: string;
  jobId: string;
  templateId: string;
  templateSnapshot: FormTemplate;
  status: FormSubmissionStatus;
  values: Record<string, any>;
  photos: FormPhotoAttachment[];
  techSignature: DigitalSignature | null;
  customerSignature: DigitalSignature | null;
  summary: FormComplianceSummary;
  submittedByCrewId?: string | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  customerSignedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}
