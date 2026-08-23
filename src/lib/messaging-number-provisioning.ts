import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import {
  normalizeSignalWireSpaceOrigin,
  outboundSmsLaneSuppression,
  smsProviderConfig,
} from '@/lib/sms-provider';
import {
  SignalWireNumberProvisioningClient,
  SignalWireProvisioningError,
  type SignalWireNumberCandidate,
  type SignalWireNumberAssignment,
} from '@/lib/signalwire-number-provisioning';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64 = /^[a-f0-9]{64}$/;
const BUSINESS_TYPES = [
  'sole_proprietor',
  'llc',
  'corporation',
  'partnership',
  'nonprofit',
  'other',
] as const;

export type MessagingBusinessType = (typeof BUSINESS_TYPES)[number];
export type MessagingRegistrationApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'action_required'
  | 'approved'
  | 'rejected'
  | 'provisioning'
  | 'active'
  | 'suspended';

export type MessagingRegistrationApplication = Readonly<{
  id: string;
  accountId: string;
  businessName: string | null;
  status: MessagingRegistrationApplicationStatus;
  revision: number;
  legalBusinessName: string;
  dbaName: string | null;
  businessType: MessagingBusinessType;
  websiteUrl: string;
  businessEmail: string;
  businessPhone: string;
  authorizedContactName: string;
  authorizedContactTitle: string;
  authorizedContactEmail: string;
  authorizedContactPhone: string;
  messagingSupportEmail: string;
  messagingSupportPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  desiredAreaCode: string;
  messagingUseCase: string;
  estimatedMonthlyMessages: number;
  optInDescription: string;
  optInEvidenceUrl: string;
  sampleMessages: readonly string[];
  privacyPolicyUrl: string;
  termsUrl: string;
  statusDetail: string | null;
  providerBrandId: string | null;
  providerCampaignId: string | null;
  providerBrandState: string | null;
  providerCampaignState: string | null;
  providerCampaignUseCase: string | null;
  providerVerifiedAt: string | null;
  candidateNumber: string | null;
  candidateRegion: string | null;
  candidateCity: string | null;
  candidateExpiresAt: string | null;
  providerNumberId: string | null;
  purchasedNumber: string | null;
  purchasedAt: string | null;
  inboundWebhookUrl: string | null;
  inboundRequestMethod: string | null;
  inboundConfiguredAt: string | null;
  assignmentOrderId: string | null;
  assignmentId: string | null;
  providerAssignmentState: string | null;
  assignmentCheckedAt: string | null;
  activatedAt: string | null;
  submittedAt: string;
  updatedAt: string;
}>;

export type MessagingApplicationInput = Readonly<{
  legalBusinessName: string;
  dbaName: string;
  businessType: string;
  websiteUrl: string;
  businessEmail: string;
  businessPhone: string;
  authorizedContactName: string;
  authorizedContactTitle: string;
  authorizedContactEmail: string;
  authorizedContactPhone: string;
  messagingSupportEmail: string;
  messagingSupportPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  desiredAreaCode: string;
  messagingUseCase: string;
  estimatedMonthlyMessages: number;
  optInDescription: string;
  optInEvidenceUrl: string;
  sampleMessages: readonly string[];
  privacyPolicyUrl: string;
  termsUrl: string;
  attested: boolean;
}>;

export type MessagingApplicationValidation =
  | { ok: true; value: Omit<MessagingApplicationInput, 'attested'> }
  | { ok: false; errors: readonly string[] };

function httpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function clean(raw: string, max: number): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function email(raw: string): string | null {
  const value = raw.trim().toLowerCase().slice(0, 320);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function e164Phone(raw: string): string | null {
  const us = normalizeUsPhone(raw);
  if (us) return us;
  const value = raw.trim().replace(/[\s().-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(value) ? value : null;
}

export function validateMessagingApplication(input: MessagingApplicationInput): MessagingApplicationValidation {
  const errors: string[] = [];
  const legalBusinessName = clean(input.legalBusinessName, 200);
  const dbaName = clean(input.dbaName, 200);
  const websiteUrl = httpsUrl(input.websiteUrl);
  const privacyPolicyUrl = httpsUrl(input.privacyPolicyUrl);
  const termsUrl = httpsUrl(input.termsUrl);
  const optInEvidenceUrl = httpsUrl(input.optInEvidenceUrl);
  const businessEmail = email(input.businessEmail);
  const businessPhone = e164Phone(input.businessPhone);
  const authorizedContactName = clean(input.authorizedContactName, 200);
  const authorizedContactTitle = clean(input.authorizedContactTitle, 200);
  const authorizedContactEmail = email(input.authorizedContactEmail);
  const authorizedContactPhone = e164Phone(input.authorizedContactPhone);
  const messagingSupportEmail = email(input.messagingSupportEmail);
  const messagingSupportPhone = e164Phone(input.messagingSupportPhone);
  const addressLine1 = clean(input.addressLine1, 200);
  const addressLine2 = clean(input.addressLine2, 200);
  const city = clean(input.city, 120);
  const region = input.region.trim().toUpperCase();
  const postalCode = input.postalCode.trim();
  const desiredAreaCode = input.desiredAreaCode.replace(/\D/g, '');
  const messagingUseCase = input.messagingUseCase.trim().slice(0, 4000);
  const optInDescription = input.optInDescription.trim().slice(0, 4000);
  const sampleMessages = input.sampleMessages.map((message) => message.trim().slice(0, 1000)).filter(Boolean).slice(0, 5);

  if (legalBusinessName.length < 2) errors.push('Enter the legal business name used on government records.');
  if (!(BUSINESS_TYPES as readonly string[]).includes(input.businessType)) errors.push('Choose a business type.');
  if (!websiteUrl) errors.push('Use a complete HTTPS business website URL.');
  if (!businessEmail) errors.push('Enter a valid business email.');
  if (!businessPhone) errors.push('Enter a valid US business phone.');
  if (authorizedContactName.length < 2 || authorizedContactTitle.length < 2) {
    errors.push('Enter the authorized messaging contact name and title.');
  }
  if (!authorizedContactEmail || !authorizedContactPhone) {
    errors.push('Enter a valid email and E.164 phone for the authorized messaging contact.');
  }
  if (!messagingSupportEmail || !messagingSupportPhone) {
    errors.push('Enter the email and E.164 phone customers can use for HELP and STOP support.');
  }
  if (addressLine1.length < 2 || city.length < 2) errors.push('Enter the business street address and city.');
  if (!/^[A-Z]{2}$/.test(region)) errors.push('Use a two-letter US state code.');
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(postalCode)) errors.push('Enter a five-digit US ZIP code.');
  if (!/^[2-9][0-9]{2}$/.test(desiredAreaCode)) errors.push('Enter a valid three-digit US area code.');
  if (messagingUseCase.length < 30) errors.push('Explain the customer conversations and notifications you will send.');
  if (!Number.isSafeInteger(input.estimatedMonthlyMessages) || input.estimatedMonthlyMessages < 1 || input.estimatedMonthlyMessages > 10_000_000) {
    errors.push('Estimate monthly message volume with a whole number.');
  }
  if (optInDescription.length < 30) errors.push('Explain exactly where customers provide their number and consent.');
  if (!optInEvidenceUrl) errors.push('Provide a complete HTTPS link to the opt-in page or consent screenshot.');
  if (sampleMessages.length < 2) errors.push('Provide at least two representative message examples.');
  if (sampleMessages.length >= 2 && !sampleMessages.some((message) => /\bSTOP\b/i.test(message))) {
    errors.push('At least one sample must include STOP opt-out wording.');
  }
  if (!privacyPolicyUrl || !termsUrl) errors.push('Use complete HTTPS privacy-policy and terms URLs.');
  if (!input.attested) errors.push('Confirm the information is accurate and customers have consented.');
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      legalBusinessName,
      dbaName,
      businessType: input.businessType,
      websiteUrl: websiteUrl!,
      businessEmail: businessEmail!,
      businessPhone: businessPhone!,
      authorizedContactName,
      authorizedContactTitle,
      authorizedContactEmail: authorizedContactEmail!,
      authorizedContactPhone: authorizedContactPhone!,
      messagingSupportEmail: messagingSupportEmail!,
      messagingSupportPhone: messagingSupportPhone!,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      desiredAreaCode,
      messagingUseCase,
      estimatedMonthlyMessages: input.estimatedMonthlyMessages,
      optInDescription,
      optInEvidenceUrl: optInEvidenceUrl!,
      sampleMessages,
      privacyPolicyUrl: privacyPolicyUrl!,
      termsUrl: termsUrl!,
    },
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function provisioningFingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

type RpcError = { message?: string; code?: string } | null;

function rpcFailure(label: string, error: RpcError): Error {
  return new Error(`${label}: ${error?.message?.trim() || error?.code?.trim() || 'unknown database error'}`);
}

function oneRow(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label} returned no row.`);
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function normalizeApplication(row: Record<string, unknown>, businessName: string | null = null): MessagingRegistrationApplication {
  const status = requiredString(row.status, 'Messaging application status') as MessagingRegistrationApplicationStatus;
  const businessType = requiredString(row.business_type, 'Messaging business type') as MessagingBusinessType;
  if (![
    'submitted', 'under_review', 'action_required', 'approved', 'rejected',
    'provisioning', 'active', 'suspended',
  ].includes(status)) throw new Error('Messaging application status is invalid.');
  if (!(BUSINESS_TYPES as readonly string[]).includes(businessType)) throw new Error('Messaging business type is invalid.');
  const revision = Number(row.revision);
  const estimatedMonthlyMessages = Number(row.estimated_monthly_messages);
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(estimatedMonthlyMessages)) {
    throw new Error('Messaging application numeric fields are invalid.');
  }
  return {
    id: requiredString(row.id, 'Messaging application ID'),
    accountId: requiredString(row.account_id, 'Messaging application account'),
    businessName,
    status,
    revision,
    legalBusinessName: requiredString(row.legal_business_name, 'Legal business name'),
    dbaName: optionalString(row.dba_name),
    businessType,
    websiteUrl: requiredString(row.website_url, 'Website URL'),
    businessEmail: requiredString(row.business_email, 'Business email'),
    businessPhone: requiredString(row.business_phone, 'Business phone'),
    authorizedContactName: requiredString(row.authorized_contact_name, 'Authorized contact name'),
    authorizedContactTitle: requiredString(row.authorized_contact_title, 'Authorized contact title'),
    authorizedContactEmail: requiredString(row.authorized_contact_email, 'Authorized contact email'),
    authorizedContactPhone: requiredString(row.authorized_contact_phone, 'Authorized contact phone'),
    messagingSupportEmail: requiredString(row.messaging_support_email, 'Messaging support email'),
    messagingSupportPhone: requiredString(row.messaging_support_phone, 'Messaging support phone'),
    addressLine1: requiredString(row.address_line1, 'Address'),
    addressLine2: optionalString(row.address_line2),
    city: requiredString(row.city, 'City'),
    region: requiredString(row.region, 'Region'),
    postalCode: requiredString(row.postal_code, 'Postal code'),
    desiredAreaCode: requiredString(row.desired_area_code, 'Desired area code'),
    messagingUseCase: requiredString(row.messaging_use_case, 'Messaging use case'),
    estimatedMonthlyMessages,
    optInDescription: requiredString(row.opt_in_description, 'Opt-in description'),
    optInEvidenceUrl: requiredString(row.opt_in_evidence_url, 'Opt-in evidence URL'),
    sampleMessages: Array.isArray(row.sample_messages)
      ? row.sample_messages.filter((item): item is string => typeof item === 'string')
      : [],
    privacyPolicyUrl: requiredString(row.privacy_policy_url, 'Privacy URL'),
    termsUrl: requiredString(row.terms_url, 'Terms URL'),
    statusDetail: optionalString(row.status_detail),
    providerBrandId: optionalString(row.provider_brand_id),
    providerCampaignId: optionalString(row.provider_campaign_id),
    providerBrandState: optionalString(row.provider_brand_state),
    providerCampaignState: optionalString(row.provider_campaign_state),
    providerCampaignUseCase: optionalString(row.provider_campaign_use_case),
    providerVerifiedAt: optionalString(row.provider_verified_at),
    candidateNumber: optionalString(row.candidate_number),
    candidateRegion: optionalString(row.candidate_region),
    candidateCity: optionalString(row.candidate_city),
    candidateExpiresAt: optionalString(row.candidate_expires_at),
    providerNumberId: optionalString(row.provider_number_id),
    purchasedNumber: optionalString(row.purchased_number),
    purchasedAt: optionalString(row.purchased_at),
    inboundWebhookUrl: optionalString(row.inbound_webhook_url),
    inboundRequestMethod: optionalString(row.inbound_request_method),
    inboundConfiguredAt: optionalString(row.inbound_configured_at),
    assignmentOrderId: optionalString(row.assignment_order_id),
    assignmentId: optionalString(row.assignment_id),
    providerAssignmentState: optionalString(row.provider_assignment_state),
    assignmentCheckedAt: optionalString(row.assignment_checked_at),
    activatedAt: optionalString(row.activated_at),
    submittedAt: requiredString(row.submitted_at, 'Submitted time'),
    updatedAt: requiredString(row.updated_at, 'Updated time'),
  };
}

const APPLICATION_COLUMNS = [
  'id', 'account_id', 'status', 'revision', 'legal_business_name', 'dba_name', 'business_type',
  'website_url', 'business_email', 'business_phone', 'address_line1', 'address_line2', 'city',
  'authorized_contact_name', 'authorized_contact_title', 'authorized_contact_email', 'authorized_contact_phone',
  'messaging_support_email', 'messaging_support_phone',
  'region', 'postal_code', 'desired_area_code', 'messaging_use_case', 'estimated_monthly_messages',
  'opt_in_description', 'opt_in_evidence_url', 'sample_messages', 'privacy_policy_url', 'terms_url', 'status_detail',
  'provider_brand_id', 'provider_campaign_id', 'provider_brand_state', 'provider_campaign_state',
  'provider_campaign_use_case', 'provider_verified_at', 'candidate_number', 'candidate_region', 'candidate_city',
  'candidate_expires_at', 'provider_number_id', 'purchased_number', 'purchased_at',
  'inbound_webhook_url', 'inbound_request_method', 'inbound_configured_at', 'assignment_order_id', 'assignment_id',
  'provider_assignment_state', 'assignment_checked_at', 'activated_at', 'submitted_at', 'updated_at',
].join(', ');

export async function loadMessagingRegistrationApplication(
  client: SupabaseClient,
  accountId: string,
): Promise<MessagingRegistrationApplication | null> {
  const { data, error } = await client
    .from('messaging_registration_applications')
    .select(APPLICATION_COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the messaging application', error);
  return data ? normalizeApplication(data as unknown as Record<string, unknown>) : null;
}

export async function listMessagingRegistrationApplications(
  admin = createAdminClient(),
): Promise<readonly MessagingRegistrationApplication[]> {
  const { data, error } = await admin
    .from('messaging_registration_applications')
    .select(APPLICATION_COLUMNS)
    .order('submitted_at', { ascending: true })
    .limit(250);
  if (error) throw rpcFailure('Unable to list messaging applications', error);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const accountIds = [...new Set(rows.map((row) => String(row.account_id)))];
  const nameByAccount = new Map<string, string>();
  if (accountIds.length) {
    const accounts = await admin.from('accounts').select('id, business_name').in('id', accountIds);
    if (accounts.error) throw rpcFailure('Unable to load messaging application account names', accounts.error);
    for (const account of accounts.data ?? []) {
      nameByAccount.set(String(account.id), String(account.business_name ?? ''));
    }
  }
  return rows.map((row) => normalizeApplication(row, nameByAccount.get(String(row.account_id)) || null));
}

export async function loadAdminMessagingRegistrationApplication(
  applicationId: string,
  admin = createAdminClient(),
): Promise<MessagingRegistrationApplication | null> {
  if (!UUID.test(applicationId)) throw new Error('Messaging application ID is invalid.');
  const { data, error } = await admin
    .from('messaging_registration_applications')
    .select(APPLICATION_COLUMNS)
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the messaging application', error);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const accountId = requiredString(row.account_id, 'Messaging application account');
  const account = await admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  if (account.error) throw rpcFailure('Unable to load the messaging application account name', account.error);
  return normalizeApplication(row, optionalString(account.data?.business_name));
}

export type MessagingComplianceVerification = Readonly<{
  applicationId: string;
  accountId: string;
  applicationRevision: number;
  einLastFour: string;
  verificationReference: string;
  verifiedAt: string;
  verifiedBy: string;
  updatedAt: string;
}>;

function normalizeComplianceVerification(row: Record<string, unknown>): MessagingComplianceVerification {
  const applicationRevision = Number(row.application_revision);
  if (!Number.isSafeInteger(applicationRevision) || applicationRevision < 1) {
    throw new Error('Messaging compliance verification revision is invalid.');
  }
  const einLastFour = requiredString(row.ein_last_four, 'EIN last four');
  if (!/^[0-9]{4}$/.test(einLastFour)) throw new Error('Messaging compliance EIN suffix is invalid.');
  return {
    applicationId: requiredString(row.application_id, 'Messaging compliance application'),
    accountId: requiredString(row.account_id, 'Messaging compliance account'),
    applicationRevision,
    einLastFour,
    verificationReference: requiredString(row.verification_reference, 'Messaging compliance reference'),
    verifiedAt: requiredString(row.verified_at, 'Messaging compliance verification time'),
    verifiedBy: requiredString(row.verified_by, 'Messaging compliance verifier'),
    updatedAt: requiredString(row.updated_at, 'Messaging compliance update time'),
  };
}

export async function loadMessagingComplianceVerification(
  applicationId: string,
  admin = createAdminClient(),
): Promise<MessagingComplianceVerification | null> {
  if (!UUID.test(applicationId)) throw new Error('Messaging application ID is invalid.');
  const { data, error } = await admin
    .from('messaging_compliance_verifications')
    .select('application_id, account_id, application_revision, ein_last_four, verification_reference, verified_at, verified_by, updated_at')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load messaging compliance verification', error);
  return data ? normalizeComplianceVerification(data as unknown as Record<string, unknown>) : null;
}

export async function recordMessagingComplianceVerification(input: Readonly<{
  applicationId: string;
  einLastFour: string;
  verificationReference: string;
  actorReference: string;
  admin?: ReturnType<typeof createAdminClient>;
}>): Promise<void> {
  if (!UUID.test(input.applicationId)) throw new Error('Messaging application ID is invalid.');
  const einLastFour = input.einLastFour.trim();
  const verificationReference = clean(input.verificationReference, 255);
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (!/^[0-9]{4}$/.test(einLastFour)) throw new Error('Enter exactly the last four EIN digits.');
  if (verificationReference.length < 4) throw new Error('Enter the nonsecret provider or case reference.');
  if (verificationReference.replace(/\D/g, '').length === 9
      || /(?:^|\D)[0-9]{2}-?[0-9]{7}(?:\D|$)/.test(verificationReference)) {
    throw new Error('The verification reference must not contain a full EIN.');
  }
  if (actorReference.length < 3) throw new Error('Messaging compliance verifier is invalid.');
  const admin = input.admin ?? createAdminClient();
  const { error } = await admin.rpc('record_messaging_compliance_verification', {
    p_application_id: input.applicationId,
    p_ein_last_four: einLastFour,
    p_verification_reference: verificationReference,
    p_actor_reference: actorReference,
  });
  if (error) throw rpcFailure('Unable to record messaging compliance verification', error);
}

export type MessagingNumberOperationSummary = Readonly<{
  id: string;
  applicationId: string;
  type: 'purchase_number' | 'configure_inbound' | 'assign_campaign';
  state: 'pending' | 'claimed' | 'request_started' | 'succeeded' | 'failed' | 'indeterminate' | 'cancelled';
  attemptCount: number;
  errorCode: string | null;
  errorDetail: string | null;
  providerObjectId: string | null;
  updatedAt: string;
}>;

type MessagingNumberOperationDetail = MessagingNumberOperationSummary & Readonly<{
  requestPayload: Record<string, unknown>;
  providerResult: Record<string, unknown> | null;
}>;

export async function listMessagingNumberOperations(
  admin = createAdminClient(),
  applicationId?: string,
): Promise<readonly MessagingNumberOperationSummary[]> {
  let query = admin
    .from('messaging_number_provisioning_operations')
    .select('id, application_id, operation_type, state, attempt_count, error_code, error_detail, provider_object_id, updated_at')
    .order('created_at', { ascending: false })
    .limit(250);
  if (applicationId) {
    if (!UUID.test(applicationId)) throw new Error('Messaging application ID is invalid.');
    query = query.eq('application_id', applicationId);
  }
  const { data, error } = await query;
  if (error) throw rpcFailure('Unable to load messaging number operations', error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: requiredString(row.id, 'Messaging number operation ID'),
    applicationId: requiredString(row.application_id, 'Messaging number application ID'),
    type: requiredString(row.operation_type, 'Messaging number operation type') as MessagingNumberOperationSummary['type'],
    state: requiredString(row.state, 'Messaging number operation state') as MessagingNumberOperationSummary['state'],
    attemptCount: Number(row.attempt_count),
    errorCode: optionalString(row.error_code),
    errorDetail: optionalString(row.error_detail),
    providerObjectId: optionalString(row.provider_object_id),
    updatedAt: requiredString(row.updated_at, 'Messaging number operation time'),
  }));
}

async function loadMessagingNumberOperationDetail(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string,
  operationId: string,
): Promise<MessagingNumberOperationDetail> {
  if (!UUID.test(applicationId) || !UUID.test(operationId)) throw new Error('Messaging number operation identity is invalid.');
  const { data, error } = await admin
    .from('messaging_number_provisioning_operations')
    .select('id, application_id, operation_type, state, attempt_count, error_code, error_detail, provider_object_id, request_payload, provider_result, updated_at')
    .eq('id', operationId)
    .eq('application_id', applicationId)
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the messaging number operation', error);
  if (!data) throw new Error('That messaging number operation no longer exists.');
  const row = data as unknown as Record<string, unknown>;
  const requestPayload = row.request_payload;
  const providerResult = row.provider_result;
  if (!requestPayload || typeof requestPayload !== 'object' || Array.isArray(requestPayload)) {
    throw new Error('Messaging number operation request evidence is invalid.');
  }
  return {
    id: requiredString(row.id, 'Messaging number operation ID'),
    applicationId: requiredString(row.application_id, 'Messaging number application ID'),
    type: requiredString(row.operation_type, 'Messaging number operation type') as MessagingNumberOperationSummary['type'],
    state: requiredString(row.state, 'Messaging number operation state') as MessagingNumberOperationSummary['state'],
    attemptCount: Number(row.attempt_count),
    errorCode: optionalString(row.error_code),
    errorDetail: optionalString(row.error_detail),
    providerObjectId: optionalString(row.provider_object_id),
    requestPayload: requestPayload as Record<string, unknown>,
    providerResult: providerResult && typeof providerResult === 'object' && !Array.isArray(providerResult)
      ? providerResult as Record<string, unknown>
      : null,
    updatedAt: requiredString(row.updated_at, 'Messaging number operation time'),
  };
}

export type DedicatedMessagingReadiness =
  | Readonly<{ kind: 'ready'; senderId: string; provider: 'twilio' | 'signalwire'; number: string }>
  | Readonly<{ kind: 'not_ready'; reason?: SignalWireProvisioningReadinessReason }>
  | Readonly<{ kind: 'unavailable'; reason?: SignalWireProvisioningReadinessReason }>;

export type SignalWireProvisioningReadinessReason =
  | 'invalid_account'
  | 'callback_origin_untrusted'
  | 'delivery_worker_disabled'
  | 'provider_unavailable'
  | 'provider_lane_not_signalwire'
  | 'signing_key_missing'
  | 'outbound_suppressed'
  | 'outside_canary'
  | 'contractor_lane_disabled';

export type SignalWireProvisioningReadiness =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'not_ready' | 'unavailable'; reason: SignalWireProvisioningReadinessReason }>;

/**
 * Provider-mutation authority, deliberately independent of customer egress.
 *
 * Purchasing/configuring a number is how LGQ prepares the inventory that the
 * delivery lane will eventually use. Requiring that lane to be live first
 * creates a circular release: the worker, global kill switch, canary and
 * contractor-purpose gate all need to remain dark while carrier setup is being
 * verified. This check therefore proves only the server-side facts a provider
 * mutation itself needs. The explicit mutation gate, MFA, compliance evidence
 * and authoritative database spend policy remain separate mandatory checks.
 */
export function signalWireProviderProvisioningReadiness(accountId: string): SignalWireProvisioningReadiness {
  if (!UUID.test(accountId)) return { kind: 'unavailable', reason: 'invalid_account' };
  if (!trustedProviderCallbackOrigin()) {
    return { kind: 'unavailable', reason: 'callback_origin_untrusted' };
  }
  const spaceOrigin = normalizeSignalWireSpaceOrigin(process.env.SIGNALWIRE_SPACE_URL ?? '');
  const projectId = (process.env.SIGNALWIRE_PROJECT_ID ?? '').trim();
  const apiToken = (process.env.SIGNALWIRE_API_TOKEN ?? '').trim();
  if (!spaceOrigin || !UUID.test(projectId) || !apiToken) {
    return { kind: 'unavailable', reason: 'provider_unavailable' };
  }
  // Webhook authentication never falls back to the provider API token. A
  // purchased number may not be pointed at LGQ until this distinct variable is
  // present, even while every outbound gate intentionally remains dark.
  if (!(process.env.SIGNALWIRE_SIGNING_KEY ?? '').trim()) {
    return { kind: 'unavailable', reason: 'signing_key_missing' };
  }
  return { kind: 'ready' };
}

/** The exact live customer-delivery lane; provisioning readiness is separate. */
export function signalWireMessagingLaneReadiness(accountId: string): SignalWireProvisioningReadiness {
  if (!UUID.test(accountId)) return { kind: 'unavailable', reason: 'invalid_account' };
  if (process.env.LGQ_SMS_DELIVERY_WORKER_ENABLED !== '1') {
    return { kind: 'not_ready', reason: 'delivery_worker_disabled' };
  }
  const activeProvider = smsProviderConfig();
  if (!activeProvider) return { kind: 'unavailable', reason: 'provider_unavailable' };
  if (activeProvider.id !== 'signalwire') {
    return { kind: 'not_ready', reason: 'provider_lane_not_signalwire' };
  }
  if (!activeProvider.signingKey.trim()) return { kind: 'unavailable', reason: 'signing_key_missing' };
  const suppression = outboundSmsLaneSuppression(accountId, 'contractor_dedicated');
  if (suppression === 'canary-account-not-enabled') return { kind: 'not_ready', reason: 'outside_canary' };
  if (suppression === 'sender-purpose-not-enabled') return { kind: 'not_ready', reason: 'contractor_lane_disabled' };
  if (suppression) return { kind: 'not_ready', reason: 'outbound_suppressed' };
  return { kind: 'ready' };
}

export class SignalWireProvisioningReadinessError extends Error {
  readonly reason: SignalWireProvisioningReadinessReason;

  constructor(reason: SignalWireProvisioningReadinessReason) {
    const copy: Record<SignalWireProvisioningReadinessReason, string> = {
      invalid_account: 'The provisioning workspace identity is invalid.',
      callback_origin_untrusted: 'SignalWire provisioning is blocked until NEXT_PUBLIC_APP_URL is a trusted bare production HTTPS origin.',
      delivery_worker_disabled: 'SignalWire provisioning is blocked while the durable SMS delivery worker is disabled.',
      provider_unavailable: 'SignalWire provisioning is blocked until the selected provider credentials and sender configuration are complete.',
      provider_lane_not_signalwire: 'SignalWire provisioning is blocked because the active SMS provider lane is not SignalWire.',
      signing_key_missing: 'SignalWire provisioning is blocked until the separate webhook signing key is configured.',
      outbound_suppressed: 'SignalWire provisioning is blocked while outbound SMS is suppressed in this environment.',
      outside_canary: 'SignalWire provisioning is blocked because this workspace is outside the SMS canary set.',
      contractor_lane_disabled: 'SignalWire provisioning is blocked while contractor customer messaging is disabled.',
    };
    super(copy[reason]);
    this.name = 'SignalWireProvisioningReadinessError';
    this.reason = reason;
  }
}

export function requireSignalWireProviderProvisioningReadiness(accountId: string): void {
  const readiness = signalWireProviderProvisioningReadiness(accountId);
  if (readiness.kind !== 'ready') throw new SignalWireProvisioningReadinessError(readiness.reason);
}

/**
 * The only readiness test the owner inbox may trust.
 *
 * A registration projection, old conversation, or configured From number is
 * not a sender. The canonical inventory must say this workspace owns an active,
 * assigned, inbound-ready contractor number. This uses the service client only
 * after the caller has authenticated the owner or staff member; the inventory
 * itself intentionally has no owner-facing grant.
 */
export async function loadDedicatedMessagingReadiness(
  accountId: string,
  admin = createAdminClient(),
): Promise<DedicatedMessagingReadiness> {
  const lane = signalWireMessagingLaneReadiness(accountId);
  if (lane.kind !== 'ready') return lane;
  const activeProvider = smsProviderConfig();
  if (!activeProvider) return { kind: 'unavailable', reason: 'provider_unavailable' };
  const { data, error } = await admin
    .from('sms_sender_numbers')
    .select('id, provider, e164_number, inbound_request_method')
    .eq('account_id', accountId)
    .eq('provider', activeProvider.id)
    .eq('purpose', 'contractor_dedicated')
    .eq('provisioning_status', 'active')
    .eq('assignment_state', 'assigned')
    .eq('inbound_ready', true)
    .is('suspended_at', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Dedicated messaging sender readiness unavailable:', error.message);
    return { kind: 'unavailable' };
  }
  if (!data) return { kind: 'not_ready' };
  const provider = String(data.provider);
  const number = String(data.e164_number);
  const senderId = String(data.id);
  const inboundMethod = String(data.inbound_request_method ?? '').toUpperCase();
  if (
    !UUID.test(senderId)
    || provider !== activeProvider.id
    || inboundMethod !== 'POST'
    || !/^\+[1-9][0-9]{7,14}$/.test(number)
  ) {
    return { kind: 'unavailable' };
  }
  return { kind: 'ready', senderId, provider, number };
}

export class CustomerMessagingRegistrationRequiredError extends Error {
  constructor(unavailable = false) {
    super(unavailable
      ? 'We cannot verify an active customer-texting number right now, so no message was queued. Try again or contact support.'
      : 'Customer texting requires an approved, active dedicated number. Open Texting setup to apply or check registration status. No message was queued.');
    this.name = 'CustomerMessagingRegistrationRequiredError';
  }
}

export async function requireActiveDedicatedMessagingSender(
  accountId: string,
  admin = createAdminClient(),
): Promise<Extract<DedicatedMessagingReadiness, { kind: 'ready' }>> {
  const readiness = await loadDedicatedMessagingReadiness(accountId, admin);
  if (readiness.kind !== 'ready') {
    throw new CustomerMessagingRegistrationRequiredError(readiness.kind === 'unavailable');
  }
  return readiness;
}

export async function submitMessagingRegistrationApplication(input: Readonly<{
  accountId: string;
  userId: string;
  submissionKey: string;
  value: Omit<MessagingApplicationInput, 'attested'>;
  admin?: ReturnType<typeof createAdminClient>;
}>): Promise<{ applicationId: string; status: string; created: boolean }> {
  if (!UUID.test(input.accountId) || !UUID.test(input.userId)) throw new Error('Messaging application owner identity is invalid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,199}$/.test(input.submissionKey)) throw new Error('Messaging application submission key is invalid.');
  const fingerprint = provisioningFingerprint(input.value);
  const admin = input.admin ?? createAdminClient();
  const { data, error } = await admin.rpc('submit_messaging_registration_application', {
    p_account_id: input.accountId,
    p_submission_key: input.submissionKey,
    p_submission_fingerprint: fingerprint,
    p_legal_business_name: input.value.legalBusinessName,
    p_dba_name: input.value.dbaName,
    p_business_type: input.value.businessType,
    p_website_url: input.value.websiteUrl,
    p_business_email: input.value.businessEmail,
    p_business_phone: input.value.businessPhone,
    p_authorized_contact_name: input.value.authorizedContactName,
    p_authorized_contact_title: input.value.authorizedContactTitle,
    p_authorized_contact_email: input.value.authorizedContactEmail,
    p_authorized_contact_phone: input.value.authorizedContactPhone,
    p_messaging_support_email: input.value.messagingSupportEmail,
    p_messaging_support_phone: input.value.messagingSupportPhone,
    p_address_line1: input.value.addressLine1,
    p_address_line2: input.value.addressLine2,
    p_city: input.value.city,
    p_region: input.value.region,
    p_postal_code: input.value.postalCode,
    p_desired_area_code: input.value.desiredAreaCode,
    p_messaging_use_case: input.value.messagingUseCase,
    p_estimated_monthly_messages: input.value.estimatedMonthlyMessages,
    p_opt_in_description: input.value.optInDescription,
    p_opt_in_evidence_url: input.value.optInEvidenceUrl,
    p_sample_messages: input.value.sampleMessages,
    p_privacy_policy_url: input.value.privacyPolicyUrl,
    p_terms_url: input.value.termsUrl,
    p_attested_at: new Date().toISOString(),
    p_actor_reference: input.userId,
  });
  if (error) throw rpcFailure('Unable to submit the messaging application', error);
  const row = oneRow(data, 'Messaging application submission');
  return {
    applicationId: requiredString(row.application_id, 'Messaging application ID'),
    status: requiredString(row.application_status, 'Messaging application status'),
    created: row.created === true,
  };
}

export type SignalWireCampaignSnapshot = Readonly<{
  brandId: string;
  campaignId: string;
  brandState: string;
  campaignState: string;
  campaignUseCase: string;
  verifiedLegalBusinessName: string;
  verifiedDbaName: string | null;
  verifiedWebsiteHost: string;
  verifiedEinLastFour: string;
  verifiedAt: string;
}>;

export type SignalWireCampaignVerification = SignalWireCampaignSnapshot & Readonly<{
  brandState: 'complete';
  campaignState: 'complete';
}>;

export type SignalWireCampaignBindingExpectation = Readonly<{
  brandId: string;
  campaignId: string;
  legalBusinessName: string;
  dbaName: string | null;
  websiteUrl: string;
  einLastFour: string;
}>;

function comparableBusinessName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function websiteHost(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Verify a carrier-complete campaign belongs to the exact downstream business.
 * SignalWire's campaign object omits brand_id, so membership is separately
 * proved through the brand-scoped campaign list. The full EIN is compared only
 * in memory and is never returned or persisted.
 */
export async function inspectSignalWireCampaignBinding(
  input: SignalWireCampaignBindingExpectation & Readonly<{ client?: SignalWireNumberProvisioningClient }>,
): Promise<SignalWireCampaignSnapshot> {
  if (!UUID.test(input.brandId) || !UUID.test(input.campaignId)) {
    throw new Error('SignalWire brand and campaign IDs must both be UUIDs.');
  }
  if (!/^[0-9]{4}$/.test(input.einLastFour)) throw new Error('A verified EIN suffix is required.');
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const [brand, campaign, belongs] = await Promise.all([
    client.getBrand(input.brandId),
    client.getCampaign(input.campaignId),
    client.campaignBelongsToBrand({ brandId: input.brandId, campaignId: input.campaignId }),
  ]);
  if (!belongs) throw new Error('The SignalWire campaign is not registered under the selected downstream brand.');
  if (comparableBusinessName(brand.companyName) !== comparableBusinessName(input.legalBusinessName)) {
    throw new Error('SignalWire brand legal company name does not match this application.');
  }
  const expectedBrandName = input.dbaName || input.legalBusinessName;
  if (comparableBusinessName(brand.name) !== comparableBusinessName(expectedBrandName)) {
    throw new Error('SignalWire brand/DBA name does not match this application.');
  }
  const expectedHost = websiteHost(input.websiteUrl);
  const providerHost = websiteHost(brand.companyWebsite);
  if (!expectedHost || providerHost !== expectedHost) {
    throw new Error('SignalWire brand website does not match this application.');
  }
  const providerEinDigits = brand.ein.replace(/\D/g, '');
  if (providerEinDigits.length < 4 || providerEinDigits.slice(-4) !== input.einLastFour) {
    throw new Error('SignalWire brand tax identity does not match the verified EIN suffix.');
  }
  return {
    brandId: brand.id,
    campaignId: campaign.id,
    brandState: brand.state,
    campaignState: campaign.state,
    campaignUseCase: campaign.smsUseCase,
    verifiedLegalBusinessName: input.legalBusinessName,
    verifiedDbaName: input.dbaName,
    verifiedWebsiteHost: expectedHost,
    verifiedEinLastFour: input.einLastFour,
    verifiedAt: new Date().toISOString(),
  };
}

export function requireCarrierCompleteCampaign(
  snapshot: SignalWireCampaignSnapshot,
): asserts snapshot is SignalWireCampaignVerification {
  if (snapshot.brandState !== 'complete') {
    throw new Error(`SignalWire brand is not carrier-complete (state: ${snapshot.brandState}).`);
  }
  if (snapshot.campaignState !== 'complete') {
    throw new Error(`SignalWire campaign is not carrier-complete (state: ${snapshot.campaignState}).`);
  }
}

export async function verifySignalWireCampaignBinding(
  input: SignalWireCampaignBindingExpectation & Readonly<{ client?: SignalWireNumberProvisioningClient }>,
): Promise<SignalWireCampaignVerification> {
  const snapshot = await inspectSignalWireCampaignBinding(input);
  requireCarrierCompleteCampaign(snapshot);
  return snapshot;
}

async function inspectRecordAndRequireCarrierCompleteCampaign(input: Readonly<{
  applicationId: string;
  binding: SignalWireCampaignBindingExpectation;
  actorReference: string;
  store: MessagingNumberOperationStore;
  client: SignalWireNumberProvisioningClient;
}>): Promise<SignalWireCampaignVerification> {
  const snapshot = await inspectSignalWireCampaignBinding({ ...input.binding, client: input.client });
  // Persist the fresh carrier state before rejecting a downgrade. The database
  // RPC suspends any formerly-active local sender when either state regresses.
  await input.store.recordCampaignVerification(input.applicationId, snapshot, input.actorReference);
  requireCarrierCompleteCampaign(snapshot);
  return snapshot;
}

export async function reviewMessagingRegistrationApplication(input: Readonly<{
  applicationId: string;
  decision: 'under_review' | 'action_required' | 'approved' | 'rejected';
  detail: string;
  providerBrandId: string;
  providerCampaignId: string;
  providerVerification?: SignalWireCampaignVerification | null;
  actorReference: string;
  admin?: ReturnType<typeof createAdminClient>;
}>): Promise<void> {
  const admin = input.admin ?? createAdminClient();
  if (input.decision === 'approved' && (
    !input.providerVerification
    || input.providerVerification.brandId !== input.providerBrandId
    || input.providerVerification.campaignId !== input.providerCampaignId
  )) {
    throw new Error('Approval requires a fresh SignalWire brand/campaign verification.');
  }
  const verification = input.providerVerification ?? null;
  const { error } = await admin.rpc('review_messaging_registration_application_v2', {
    p_application_id: input.applicationId,
    p_decision: input.decision,
    p_detail: input.detail,
    p_provider_brand_id: input.providerBrandId,
    p_provider_campaign_id: input.providerCampaignId,
    p_provider_brand_state: verification?.brandState ?? null,
    p_provider_campaign_state: verification?.campaignState ?? null,
    p_provider_campaign_use_case: verification?.campaignUseCase ?? null,
    p_verified_legal_business_name: verification?.verifiedLegalBusinessName ?? null,
    p_verified_dba_name: verification?.verifiedDbaName ?? null,
    p_verified_website_host: verification?.verifiedWebsiteHost ?? null,
    p_verified_ein_last_four: verification?.verifiedEinLastFour ?? null,
    p_provider_verified_at: verification?.verifiedAt ?? null,
    p_actor_reference: input.actorReference,
  });
  if (error) throw rpcFailure('Unable to review the messaging application', error);
}

export type ProvisioningClaim = Readonly<{
  status: 'claimed' | 'replay' | 'in_progress' | 'indeterminate' | 'attempt_cap';
  operationId: string;
  claimToken: string | null;
  providerObjectId: string | null;
  providerResult: Record<string, unknown> | null;
}>;

export type SignalWireAssignmentActivationEvidence = Readonly<{
  providerNumberId: string;
  number: string;
  smsCapable: boolean;
  messageHandler: string;
  inboundUrl: string;
  inboundMethod: string;
  checkedAt: string;
}>;

export interface MessagingNumberOperationStore {
  claim(input: Readonly<{
    applicationId: string;
    operationType: 'purchase_number' | 'configure_inbound' | 'assign_campaign';
    idempotencyKey: string;
    fingerprint: string;
    payload: Record<string, unknown>;
  }>): Promise<ProvisioningClaim>;
  begin(operationId: string, claimToken: string): Promise<void>;
  complete(operationId: string, claimToken: string, providerObjectId: string, result: Record<string, unknown>): Promise<void>;
  reject(operationId: string, claimToken: string, errorCode: string, detail: string): Promise<void>;
  indeterminate(
    operationId: string,
    claimToken: string,
    errorCode: string,
    detail: string,
    providerObjectId?: string | null,
    providerResult?: Record<string, unknown> | null,
  ): Promise<void>;
  recordCandidate(applicationId: string, candidate: SignalWireNumberCandidate, actorReference: string): Promise<void>;
  recordCampaignVerification(applicationId: string, verification: SignalWireCampaignSnapshot, actorReference: string): Promise<void>;
  recordAssignment(
    applicationId: string,
    assignment: SignalWireNumberAssignment,
    actorReference: string,
    activationEvidence?: SignalWireAssignmentActivationEvidence | null,
  ): Promise<'pending' | 'complete' | 'failed'>;
}

export class SupabaseMessagingNumberOperationStore implements MessagingNumberOperationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(input: Parameters<MessagingNumberOperationStore['claim']>[0]): Promise<ProvisioningClaim> {
    const { data, error } = await this.admin.rpc('claim_messaging_number_operation_v2', {
      p_application_id: input.applicationId,
      p_operation_type: input.operationType,
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.fingerprint,
      p_request_payload: input.payload,
    });
    if (error) throw rpcFailure('Unable to claim the messaging number operation', error);
    const row = oneRow(data, 'Messaging number operation claim');
    const status = requiredString(row.claim_status, 'Messaging number claim status') as ProvisioningClaim['status'];
    if (!['claimed', 'replay', 'in_progress', 'indeterminate', 'attempt_cap'].includes(status)) {
      throw new Error('Messaging number claim status is invalid.');
    }
    const result = row.provider_result;
    return {
      status,
      operationId: requiredString(row.operation_id, 'Messaging number operation ID'),
      claimToken: optionalString(row.claim_token),
      providerObjectId: optionalString(row.provider_object_id),
      providerResult: result && typeof result === 'object' && !Array.isArray(result)
        ? result as Record<string, unknown>
        : null,
    };
  }

  async begin(operationId: string, claimToken: string): Promise<void> {
    const { error } = await this.admin.rpc('begin_messaging_number_operation', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
    });
    if (error) throw rpcFailure('Unable to begin the messaging number provider request', error);
  }

  async complete(operationId: string, claimToken: string, providerObjectId: string, result: Record<string, unknown>): Promise<void> {
    const { error } = await this.admin.rpc('complete_messaging_number_operation_v2', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_provider_object_id: providerObjectId,
      p_provider_result: result,
    });
    if (error) throw rpcFailure('Unable to complete the messaging number operation', error);
  }

  async reject(operationId: string, claimToken: string, errorCode: string, detail: string): Promise<void> {
    const { error } = await this.admin.rpc('reject_messaging_number_operation', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_error_code: errorCode,
      p_error_detail: detail,
    });
    if (error) throw rpcFailure('Unable to record the SignalWire rejection', error);
  }

  async indeterminate(
    operationId: string,
    claimToken: string,
    errorCode: string,
    detail: string,
    providerObjectId: string | null = null,
    providerResult: Record<string, unknown> | null = null,
  ): Promise<void> {
    const { error } = await this.admin.rpc('mark_messaging_number_operation_indeterminate_v2', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_error_code: errorCode,
      p_error_detail: detail,
      p_provider_object_id: providerObjectId,
      p_provider_result: providerResult,
    });
    if (error) throw rpcFailure('Unable to quarantine the uncertain SignalWire operation', error);
  }

  async recordCandidate(applicationId: string, candidate: SignalWireNumberCandidate, actorReference: string): Promise<void> {
    const { error } = await this.admin.rpc('record_messaging_number_candidate', {
      p_application_id: applicationId,
      p_number: candidate.number,
      p_region: candidate.region,
      p_city: candidate.city,
      p_actor_reference: actorReference,
    });
    if (error) throw rpcFailure('Unable to record the SignalWire number candidate', error);
  }

  async recordCampaignVerification(
    applicationId: string,
    verification: SignalWireCampaignSnapshot,
    actorReference: string,
  ): Promise<void> {
    const { error } = await this.admin.rpc('record_messaging_campaign_verification_v2', {
      p_application_id: applicationId,
      p_provider_brand_id: verification.brandId,
      p_provider_campaign_id: verification.campaignId,
      p_provider_brand_state: verification.brandState,
      p_provider_campaign_state: verification.campaignState,
      p_provider_campaign_use_case: verification.campaignUseCase,
      p_verified_legal_business_name: verification.verifiedLegalBusinessName,
      p_verified_dba_name: verification.verifiedDbaName,
      p_verified_website_host: verification.verifiedWebsiteHost,
      p_verified_ein_last_four: verification.verifiedEinLastFour,
      p_provider_verified_at: verification.verifiedAt,
      p_actor_reference: actorReference,
    });
    if (error) throw rpcFailure('Unable to record the SignalWire campaign verification', error);
  }

  async recordAssignment(
    applicationId: string,
    assignment: SignalWireNumberAssignment,
    actorReference: string,
    activationEvidence: SignalWireAssignmentActivationEvidence | null = null,
  ): Promise<'pending' | 'complete' | 'failed'> {
    const { data, error } = await this.admin.rpc('record_messaging_number_assignment_state_v3', {
      p_application_id: applicationId,
      p_assignment_id: assignment.id,
      p_provider_state: assignment.state,
      p_provider_number_id: activationEvidence?.providerNumberId ?? assignment.providerNumberId,
      p_verified_number: activationEvidence?.number ?? null,
      p_sms_capable: activationEvidence?.smsCapable ?? false,
      p_verified_message_handler: activationEvidence?.messageHandler ?? null,
      p_verified_inbound_url: activationEvidence?.inboundUrl ?? null,
      p_verified_inbound_method: activationEvidence?.inboundMethod ?? null,
      p_provider_checked_at: activationEvidence?.checkedAt ?? new Date().toISOString(),
      p_actor_reference: actorReference,
    });
    if (error) throw rpcFailure('Unable to record the SignalWire assignment state', error);
    if (data !== 'pending' && data !== 'complete' && data !== 'failed') {
      throw new Error('SignalWire assignment normalization returned an invalid state.');
    }
    return data;
  }
}

export class MessagingProvisioningGateError extends Error {
  constructor() {
    super('SignalWire provisioning is dark. Set LGQ_SIGNALWIRE_PROVISIONING_ENABLED=1 only after staging and operator review pass.');
    this.name = 'MessagingProvisioningGateError';
  }
}

export type MessagingNumberPurchasePolicy = Readonly<{
  monthlyPriceCents: number;
  monthlySpendCeilingCents: number;
  confirmationSuffix: string;
  monthlyPriceLabel: string;
  monthlySpendCeilingLabel: string;
}>;

export type StoredMessagingNumberPurchasePolicy = MessagingNumberPurchasePolicy & Readonly<{
  provider: 'signalwire';
  revision: number;
  updatedAt: string;
}>;

function configuredPositiveCents(name: string): number | null {
  const raw = process.env[name]?.trim() ?? '';
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function centsLabel(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Refuse carrier spend when LGQ cannot display and cap an operator-reviewed price. */
export function messagingNumberPurchasePolicy(): MessagingNumberPurchasePolicy | null {
  const monthlyPriceCents = configuredPositiveCents('LGQ_SIGNALWIRE_NUMBER_MONTHLY_PRICE_CENTS');
  const monthlySpendCeilingCents = configuredPositiveCents('LGQ_SIGNALWIRE_NUMBER_MONTHLY_SPEND_CEILING_CENTS');
  if (!monthlyPriceCents || !monthlySpendCeilingCents || monthlyPriceCents > monthlySpendCeilingCents) return null;
  return {
    monthlyPriceCents,
    monthlySpendCeilingCents,
    confirmationSuffix: `USD ${(monthlyPriceCents / 100).toFixed(2)}/MO`,
    monthlyPriceLabel: `${centsLabel(monthlyPriceCents)}/month`,
    monthlySpendCeilingLabel: `${centsLabel(monthlySpendCeilingCents)}/month`,
  };
}

export function messagingNumberPurchaseConfirmation(number: string, policy: MessagingNumberPurchasePolicy): string {
  return `PURCHASE ${number} ${policy.confirmationSuffix}`;
}

function purchasePolicyValue(monthlyPriceCents: number, monthlySpendCeilingCents: number): MessagingNumberPurchasePolicy {
  if (
    !Number.isSafeInteger(monthlyPriceCents)
    || !Number.isSafeInteger(monthlySpendCeilingCents)
    || monthlyPriceCents < 1
    || monthlySpendCeilingCents < monthlyPriceCents
  ) {
    throw new Error('Stored messaging number spend policy is invalid. Purchase remains blocked.');
  }
  return {
    monthlyPriceCents,
    monthlySpendCeilingCents,
    confirmationSuffix: `USD ${(monthlyPriceCents / 100).toFixed(2)}/MO`,
    monthlyPriceLabel: `${centsLabel(monthlyPriceCents)}/month`,
    monthlySpendCeilingLabel: `${centsLabel(monthlySpendCeilingCents)}/month`,
  };
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

/** The database snapshot is the sole purchase authority; env values are only an operator proposal. */
export async function loadMessagingNumberPurchasePolicy(
  admin = createAdminClient(),
): Promise<StoredMessagingNumberPurchasePolicy | null> {
  const { data, error } = await admin
    .from('messaging_number_spend_policies')
    .select('provider, currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents, revision, updated_at')
    .eq('provider', 'signalwire')
    .maybeSingle();
  if (error) throw rpcFailure('Unable to load the authoritative messaging number spend policy', error);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  if (row.provider !== 'signalwire' || row.currency !== 'USD') {
    throw new Error('Stored messaging number spend policy provider or currency is invalid.');
  }
  const monthlyPriceCents = safeInteger(row.monthly_unit_price_cents, 'Stored monthly number price');
  const monthlySpendCeilingCents = safeInteger(row.aggregate_monthly_ceiling_cents, 'Stored monthly number ceiling');
  const revision = safeInteger(row.revision, 'Stored spend policy revision');
  if (revision < 1) throw new Error('Stored spend policy revision is invalid.');
  return {
    provider: 'signalwire',
    revision,
    updatedAt: requiredString(row.updated_at, 'Stored spend policy update time'),
    ...purchasePolicyValue(monthlyPriceCents, monthlySpendCeilingCents),
  };
}

export async function setMessagingNumberPurchasePolicy(input: Readonly<{
  monthlyPriceCents: number;
  monthlySpendCeilingCents: number;
  actorReference: string;
  admin?: ReturnType<typeof createAdminClient>;
}>): Promise<StoredMessagingNumberPurchasePolicy> {
  purchasePolicyValue(input.monthlyPriceCents, input.monthlySpendCeilingCents);
  const actorReference = input.actorReference.trim().slice(0, 320);
  if (actorReference.length < 3) throw new Error('Messaging spend-policy actor is invalid.');
  const admin = input.admin ?? createAdminClient();
  const { data, error } = await admin.rpc('set_messaging_number_spend_policy', {
    p_provider: 'signalwire',
    p_monthly_unit_price_cents: input.monthlyPriceCents,
    p_aggregate_monthly_ceiling_cents: input.monthlySpendCeilingCents,
    p_actor_reference: actorReference,
  });
  if (error) throw rpcFailure('Unable to set the authoritative messaging number spend policy', error);
  const row = oneRow(data, 'Messaging number spend policy');
  if (row.provider !== 'signalwire' || row.currency !== 'USD') {
    throw new Error('Messaging number spend policy update returned an invalid provider or currency.');
  }
  return {
    provider: 'signalwire',
    revision: safeInteger(row.revision, 'Messaging number spend policy revision'),
    updatedAt: requiredString(row.updated_at, 'Messaging number spend policy update time'),
    ...purchasePolicyValue(
      safeInteger(row.monthly_unit_price_cents, 'Messaging monthly number price'),
      safeInteger(row.aggregate_monthly_ceiling_cents, 'Messaging monthly number ceiling'),
    ),
  };
}

export type MessagingNumberOperationRuntime = Readonly<{
  enabled: boolean;
  store: MessagingNumberOperationStore;
  client: SignalWireNumberProvisioningClient;
}>;

function defaultRuntime(): MessagingNumberOperationRuntime {
  return {
    enabled: process.env.LGQ_SIGNALWIRE_PROVISIONING_ENABLED === '1',
    store: new SupabaseMessagingNumberOperationStore(),
    client: SignalWireNumberProvisioningClient.fromEnvironment(),
  };
}

function assertMutationGate(runtime?: MessagingNumberOperationRuntime): void {
  if (process.env.LGQ_SIGNALWIRE_PROVISIONING_ENABLED !== '1' || (runtime && !runtime.enabled)) {
    throw new MessagingProvisioningGateError();
  }
}

export function requireProvisioningMutationEnabled(): void {
  assertMutationGate();
}

function secureHttpsCallback(raw: string, label: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} must be a complete HTTPS URL without credentials, a query string, or a fragment.`);
  }
}

function productionAppOrigin(): string {
  const origin = trustedProviderCallbackOrigin();
  if (origin) return origin;
  throw new Error('NEXT_PUBLIC_APP_URL must be a trusted bare production HTTPS origin inside LGQ\'s configured root domain before provisioning an inbound number.');
}

export const SIGNALWIRE_10DLC_CALLBACK_TOKEN_ENV = 'LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN';
const SIGNALWIRE_10DLC_CALLBACK_TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * The 10DLC status callback URL, pinned to this deployment's own route.
 *
 * Until 2026-08-22 this threw unconditionally: there was no authenticated route
 * to receive a registry callback, so registering one would have invited an
 * unauthenticated POST. That is also why the reason for the 2026-08-21
 * assignment failure was never captured -- nothing was ever registered to
 * receive it. The route now exists at /api/sms/registry-status/[token].
 *
 * The token is a PATH SEGMENT rather than a query parameter or HTTP Basic
 * credentials because secureHttpsCallback rejects credentials, query strings
 * and fragments -- a path segment is the only channel the provider will accept.
 */
export function requireExactSignalWire10dlcStatusCallback(raw: string): string {
  // secureHttpsCallback MUST run first: its message is what pins the rejection
  // of a `?token=` style callback, and reordering makes that assertion pass for
  // the wrong reason.
  const entered = secureHttpsCallback(raw, 'SignalWire assignment callback');
  const token = (process.env[SIGNALWIRE_10DLC_CALLBACK_TOKEN_ENV] ?? '').trim();
  if (!SIGNALWIRE_10DLC_CALLBACK_TOKEN_SHAPE.test(token)) {
    throw new Error(`${SIGNALWIRE_10DLC_CALLBACK_TOKEN_ENV} must be 32-128 characters of [A-Za-z0-9_-] before a 10DLC status callback can be registered.`);
  }
  const expected = `${productionAppOrigin()}/api/sms/registry-status/${token}`;
  if (entered !== expected) {
    throw new Error('SignalWire 10DLC status callback must exactly match the configured production route.');
  }
  return expected;
}

/**
 * The same URL with the secret segment removed, for anything durable.
 *
 * Deterministic so the operation fingerprint stays stable across a token
 * rotation; a token-dependent fingerprint would read as idempotency drift and
 * refuse the next legitimate assignment.
 */
export function redactedSignalWire10dlcStatusCallback(url: string | null): string | null {
  if (!url) return null;
  const token = (process.env[SIGNALWIRE_10DLC_CALLBACK_TOKEN_ENV] ?? '').trim();
  if (token.length > 0 && url.includes(token)) return url.replace(token, '[redacted]');
  return url.replace(/\/api\/sms\/registry-status\/[^/?#]+/, '/api/sms/registry-status/[redacted]');
}

export function requireExactSignalWireInboundWebhook(raw: string): string {
  const entered = secureHttpsCallback(raw, 'SignalWire inbound webhook');
  const expected = `${productionAppOrigin()}/api/sms/inbound`;
  if (entered !== expected) {
    throw new Error(`SignalWire inbound webhook must exactly match the configured production route ${expected}.`);
  }
  return expected;
}

function safeErrorCode(error: unknown): string {
  const candidate = error instanceof SignalWireProvisioningError ? `signalwire_${error.code}` : 'provider_result_unknown';
  return candidate.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 100);
}

function safeErrorDetail(error: unknown): string {
  return (error instanceof SignalWireProvisioningError ? error.operatorMessage : error instanceof Error ? error.message : 'Unknown provider error').slice(0, 2000);
}

async function executeProviderMutation<T extends { id: string }>(input: Readonly<{
  applicationId: string;
  operationType: 'purchase_number' | 'configure_inbound' | 'assign_campaign';
  idempotencyKey: string;
  payload: Record<string, unknown>;
  request: (client: SignalWireNumberProvisioningClient) => Promise<T>;
  result: (value: T) => Record<string, unknown>;
  validate?: (value: T, result: Record<string, unknown>) => void;
  runtime?: MessagingNumberOperationRuntime;
}>): Promise<{ replay: boolean; providerObjectId: string; result: Record<string, unknown> }> {
  // The gate is checked before the claim and therefore before any provider
  // client construction or request. A dark environment leaves no misleading
  // pending operation and does not require provider credentials to be present.
  assertMutationGate(input.runtime);
  const runtime = input.runtime ?? defaultRuntime();
  const fingerprint = provisioningFingerprint(input.payload);
  if (!HEX_64.test(fingerprint)) throw new Error('Messaging number operation fingerprint failed.');
  const claim = await runtime.store.claim({
    applicationId: input.applicationId,
    operationType: input.operationType,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
    payload: input.payload,
  });
  if (claim.status === 'replay') {
    if (!claim.providerObjectId || !claim.providerResult) throw new Error('Messaging number replay is incomplete.');
    return { replay: true, providerObjectId: claim.providerObjectId, result: claim.providerResult };
  }
  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new Error(
      claim.status === 'indeterminate'
        ? 'This SignalWire operation has an uncertain outcome. Reconcile it before doing anything else.'
        : claim.status === 'attempt_cap'
          ? 'This SignalWire operation reached its attempt cap and needs operator review.'
          : 'This SignalWire operation is already in progress.',
    );
  }

  await runtime.store.begin(claim.operationId, claim.claimToken);
  let providerValue: T | null = null;
  let providerResult: Record<string, unknown> | null = null;
  try {
    providerValue = await input.request(runtime.client);
    providerResult = input.result(providerValue);
    input.validate?.(providerValue, providerResult);
    await runtime.store.complete(claim.operationId, claim.claimToken, providerValue.id, providerResult);
    return { replay: false, providerObjectId: providerValue.id, result: providerResult };
  } catch (error) {
    const code = safeErrorCode(error);
    const detail = safeErrorDetail(error);
    try {
      if (error instanceof SignalWireProvisioningError && error.outcomeKnownAbsent) {
        await runtime.store.reject(claim.operationId, claim.claimToken, code, detail);
      } else {
        await runtime.store.indeterminate(
          claim.operationId,
          claim.claimToken,
          code,
          detail,
          providerValue?.id ?? null,
          providerResult,
        );
      }
    } catch (recordError) {
      // PostgREST/provider-shaped errors can echo request bodies, customer
      // numbers, callback URLs or credentials. The durable operation already
      // carries the intended diagnostic fields when persistence succeeds; if
      // that write itself fails, log only fixed context and a bounded safe code.
      console.error({
        event: 'messaging_number_operation_failure_persistence_failed',
        applicationId: input.applicationId,
        operationType: input.operationType,
        errorCode: safeErrorCode(recordError),
      });
    }
    throw error;
  }
}

export async function searchAndRecordMessagingNumberCandidate(input: Readonly<{
  applicationId: string;
  areaCode: string;
  region: string;
  actorReference: string;
  store?: MessagingNumberOperationStore;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<SignalWireNumberCandidate> {
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const store = input.store ?? new SupabaseMessagingNumberOperationStore();
  const candidates = await client.searchAvailableNumbers({
    areaCode: input.areaCode,
    region: input.region,
    maxResults: 10,
  });
  const candidate = candidates.find((item) => item.capabilities.sms && item.capabilities.mms)
    ?? candidates.find((item) => item.capabilities.sms);
  if (!candidate) throw new Error('SignalWire returned no SMS-capable number for that area code.');
  await store.recordCandidate(input.applicationId, candidate, input.actorReference);
  return candidate;
}

export async function purchaseMessagingNumber(input: Readonly<{
  applicationId: string;
  accountId: string;
  number: string;
  purchasePolicy: MessagingNumberPurchasePolicy;
  binding: SignalWireCampaignBindingExpectation;
  actorReference: string;
  runtime?: MessagingNumberOperationRuntime;
}>) {
  assertMutationGate(input.runtime);
  requireSignalWireProviderProvisioningReadiness(input.accountId);
  const purchasePolicy = input.purchasePolicy;
  purchasePolicyValue(purchasePolicy.monthlyPriceCents, purchasePolicy.monthlySpendCeilingCents);
  const runtime = input.runtime ?? defaultRuntime();
  await inspectRecordAndRequireCarrierCompleteCampaign({
    applicationId: input.applicationId,
    binding: input.binding,
    actorReference: input.actorReference,
    store: runtime.store,
    client: runtime.client,
  });
  const payload = {
    number: input.number,
    monthly_price_cents: purchasePolicy.monthlyPriceCents,
    monthly_spend_ceiling_cents: purchasePolicy.monthlySpendCeilingCents,
  };
  return executeProviderMutation({
    applicationId: input.applicationId,
    operationType: 'purchase_number',
    idempotencyKey: `messaging:${input.applicationId}:purchase:${input.number}`,
    payload,
    request: (client) => client.purchaseNumber(input.number),
    result: (phone) => ({
      id: phone.id,
      number: phone.number,
      name: phone.name,
      capabilities: phone.capabilities,
    }),
    runtime,
  });
}

export async function configureMessagingNumberInbound(input: Readonly<{
  applicationId: string;
  accountId: string;
  providerNumberId: string;
  number: string;
  friendlyName: string;
  binding: SignalWireCampaignBindingExpectation;
  actorReference: string;
  inboundWebhookUrl?: string;
  runtime?: MessagingNumberOperationRuntime;
}>) {
  assertMutationGate(input.runtime);
  requireSignalWireProviderProvisioningReadiness(input.accountId);
  const inboundUrl = requireExactSignalWireInboundWebhook(
    input.inboundWebhookUrl ?? process.env.LGQ_SIGNALWIRE_INBOUND_WEBHOOK_URL ?? '',
  );
  const runtime = input.runtime ?? defaultRuntime();
  await inspectRecordAndRequireCarrierCompleteCampaign({
    applicationId: input.applicationId,
    binding: input.binding,
    actorReference: input.actorReference,
    store: runtime.store,
    client: runtime.client,
  });
  const payload = {
    provider_number_id: input.providerNumberId,
    number: input.number,
    inbound_url: inboundUrl,
    message_handler: 'laml_webhooks',
    message_request_method: 'POST',
  };
  return executeProviderMutation({
    applicationId: input.applicationId,
    operationType: 'configure_inbound',
    idempotencyKey: `messaging:${input.applicationId}:configure:${input.providerNumberId}`,
    payload,
    request: (client) => client.updatePhoneNumber({
      providerNumberId: input.providerNumberId,
      number: input.number,
      friendlyName: input.friendlyName,
      inboundWebhookUrl: inboundUrl,
    }),
    result: (phone) => ({
      id: phone.id,
      number: phone.number,
      message_handler: phone.messageHandler,
      message_request_url: phone.messageRequestUrl,
      message_request_method: phone.messageRequestMethod,
    }),
    runtime,
  });
}

export async function assignMessagingNumberCampaign(input: Readonly<{
  applicationId: string;
  accountId: string;
  campaignId: string;
  number: string;
  binding: SignalWireCampaignBindingExpectation;
  actorReference: string;
  statusCallbackUrl?: string | null;
  runtime?: MessagingNumberOperationRuntime;
}>) {
  assertMutationGate(input.runtime);
  requireSignalWireProviderProvisioningReadiness(input.accountId);
  if (input.binding.campaignId !== input.campaignId) throw new Error('Campaign binding does not match the assignment request.');
  const callbackRaw = input.statusCallbackUrl ?? process.env.LGQ_SIGNALWIRE_10DLC_STATUS_CALLBACK_URL ?? null;
  // Unset stays legal: the callback is evidence, never the activation path.
  const callbackUrl = callbackRaw ? requireExactSignalWire10dlcStatusCallback(callbackRaw) : null;
  const runtime = input.runtime ?? defaultRuntime();
  await inspectRecordAndRequireCarrierCompleteCampaign({
    applicationId: input.applicationId,
    binding: input.binding,
    actorReference: input.actorReference,
    store: runtime.store,
    client: runtime.client,
  });
  const payload = {
    campaign_id: input.campaignId,
    number: input.number,
    // Redacted BEFORE the fingerprint is computed. The real URL goes to the
    // provider only; the token is a credential and must not become a durable row.
    status_callback_url: redactedSignalWire10dlcStatusCallback(callbackUrl),
  };
  return executeProviderMutation({
    applicationId: input.applicationId,
    operationType: 'assign_campaign',
    idempotencyKey: `messaging:${input.applicationId}:assign:${input.campaignId}:${input.number}`,
    payload,
    request: (client) => client.assignNumberToCampaign({
      campaignId: input.campaignId,
      number: input.number,
      statusCallbackUrl: callbackUrl,
    }),
    result: (order) => ({
      id: order.id,
      state: order.state,
      status_callback_url: redactedSignalWire10dlcStatusCallback(order.statusCallbackUrl),
    }),
    runtime,
  });
}

export async function reconcileMessagingNumberAssignment(input: Readonly<{
  applicationId: string;
  accountId: string;
  campaignId: string;
  number: string;
  expectedProviderNumberId: string;
  binding: SignalWireCampaignBindingExpectation;
  actorReference: string;
  store?: MessagingNumberOperationStore;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<'not_found' | 'pending' | 'complete' | 'failed'> {
  assertMutationGate();
  requireSignalWireProviderProvisioningReadiness(input.accountId);
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const store = input.store ?? new SupabaseMessagingNumberOperationStore();
  if (input.binding.campaignId !== input.campaignId) throw new Error('Campaign binding does not match the reconciliation request.');
  await inspectRecordAndRequireCarrierCompleteCampaign({
    applicationId: input.applicationId,
    binding: input.binding,
    actorReference: input.actorReference,
    store,
    client,
  });
  const assignment = await client.getNumberAssignment({ campaignId: input.campaignId, number: input.number });
  if (!assignment) return 'not_found';
  if (!assignment.providerNumberId || assignment.providerNumberId !== input.expectedProviderNumberId) {
    throw new Error('SignalWire assignment does not reference the exact purchased phone resource.');
  }
  if (assignment.state !== 'complete') {
    return store.recordAssignment(input.applicationId, assignment, input.actorReference);
  }
  const phone = await client.getPhoneNumber(input.expectedProviderNumberId);
  const expectedInboundUrl = requireExactSignalWireInboundWebhook(
    process.env.LGQ_SIGNALWIRE_INBOUND_WEBHOOK_URL ?? '',
  );
  if (phone.id !== input.expectedProviderNumberId || phone.number !== input.number) {
    throw new Error('SignalWire live phone identity does not match the purchased resource and E.164 number.');
  }
  if (!phone.capabilities.includes('sms')) {
    throw new Error('SignalWire has not yet provisioned SMS capability on the assigned number. The number remains inactive.');
  }
  if (
    phone.messageHandler?.toLowerCase() !== 'laml_webhooks'
    || phone.messageRequestUrl !== expectedInboundUrl
    || phone.messageRequestMethod?.toUpperCase() !== 'POST'
  ) {
    throw new Error('SignalWire live phone configuration does not show the exact production POST LaML inbound webhook. The number remains inactive.');
  }
  return store.recordAssignment(input.applicationId, assignment, input.actorReference, {
    providerNumberId: phone.id,
    number: phone.number,
    smsCapable: true,
    messageHandler: 'laml_webhooks',
    inboundUrl: expectedInboundUrl,
    inboundMethod: 'POST',
    checkedAt: new Date().toISOString(),
  });
}

function assignmentRecoveryTarget(
  operation: MessagingNumberOperationDetail,
  application: MessagingRegistrationApplication,
  binding: SignalWireCampaignBindingExpectation,
): Readonly<{ campaignId: string; number: string }> {
  const campaignId = requiredString(operation.requestPayload.campaign_id, 'Claimed campaign');
  const number = requiredString(operation.requestPayload.number, 'Claimed assigned number');
  if (campaignId !== binding.campaignId || campaignId !== application.providerCampaignId) {
    throw new Error('The quarantined assignment campaign does not match the current verified campaign.');
  }
  if (number !== application.purchasedNumber) {
    throw new Error('The quarantined assignment number does not match this application\'s purchased number.');
  }
  return { campaignId, number };
}

/**
 * An order UUID is useful recovery evidence only when it came back from the
 * original exact campaign+number request and survived in both durable fields.
 *
 * SignalWire's order lookup returns only id/state/timestamps/callback. It does
 * not return the campaign or phone numbers, so an operator-supplied UUID cannot
 * establish that it belongs to this operation. Requiring the captured response
 * ID closes that substitution gap; live assignment evidence below then proves
 * the exact requested campaign, E.164 number, and purchased phone resource.
 */
function capturedAssignmentOrderId(operation: MessagingNumberOperationDetail): string | null {
  const objectId = operation.providerObjectId;
  const resultId = operation.providerResult ? optionalString(operation.providerResult.id) : null;
  if (!objectId && !resultId) return null;
  if (!objectId || !UUID.test(objectId) || resultId !== objectId) {
    throw new Error('The quarantined assignment order evidence is incomplete or inconsistent. Recovery is blocked.');
  }
  return objectId;
}

export async function resolveIndeterminateMessagingNumberOperation(input: Readonly<{
  application: MessagingRegistrationApplication;
  operationId: string;
  resolution: 'confirmed_absent' | 'confirmed_succeeded';
  providerObjectId?: string | null;
  actorReference: string;
  campaignBinding: SignalWireCampaignBindingExpectation;
  admin?: ReturnType<typeof createAdminClient>;
  client?: SignalWireNumberProvisioningClient;
}>): Promise<void> {
  // Recovery can activate or authorize a retry after an uncertain carrier
  // request, so it obeys the same deliberate safety gate as provisioning.
  assertMutationGate();
  requireSignalWireProviderProvisioningReadiness(input.application.accountId);
  const admin = input.admin ?? createAdminClient();
  const operation = await loadMessagingNumberOperationDetail(
    admin,
    input.application.id,
    input.operationId,
  );
  if (operation.state !== 'indeterminate') throw new Error('Only an indeterminate operation can be recovered.');
  if (input.campaignBinding.campaignId !== input.application.providerCampaignId) {
    throw new Error('Operation recovery requires the current verified downstream campaign binding.');
  }
  const client = input.client ?? SignalWireNumberProvisioningClient.fromEnvironment();
  const store = new SupabaseMessagingNumberOperationStore(admin);
  await inspectRecordAndRequireCarrierCompleteCampaign({
    applicationId: input.application.id,
    binding: input.campaignBinding,
    actorReference: input.actorReference,
    store,
    client,
  });

  if (input.resolution === 'confirmed_absent') {
    if (operation.type === 'purchase_number') {
      const expectedNumber = requiredString(operation.requestPayload.number, 'Claimed purchase number');
      const existing = await client.findOwnedPhoneNumber(expectedNumber);
      if (existing) {
        throw new Error(`SignalWire already owns ${expectedNumber} as resource ${existing.id}. Import that success; do not retry the purchase.`);
      }
    } else if (operation.type === 'configure_inbound') {
      const expectedProviderNumberId = requiredString(operation.requestPayload.provider_number_id, 'Claimed phone resource');
      const expectedNumber = requiredString(operation.requestPayload.number, 'Claimed configured number');
      const expectedUrl = requireExactSignalWireInboundWebhook(
        requiredString(operation.requestPayload.inbound_url, 'Claimed inbound URL'),
      );
      const phone = await client.getPhoneNumber(expectedProviderNumberId);
      if (phone.number !== expectedNumber) {
        throw new Error('The live SignalWire phone resource no longer matches the claimed configured number. Recovery is blocked.');
      }
      if (
        phone.messageRequestUrl === expectedUrl
        && phone.messageHandler?.toLowerCase() === 'laml_webhooks'
        && phone.messageRequestMethod?.toUpperCase() === 'POST'
      ) {
        throw new Error('SignalWire already shows the exact production POST inbound configuration. Import that success; do not retry the update.');
      }
    } else {
      const target = assignmentRecoveryTarget(operation, input.application, input.campaignBinding);
      const assignment = await client.getNumberAssignment(target);
      if (assignment) {
        throw new Error(`SignalWire already has assignment ${assignment.id} for ${target.number}. Import/reconcile that success; do not create a duplicate order.`);
      }
      const capturedOrderId = capturedAssignmentOrderId(operation);
      if (!capturedOrderId) {
        throw new Error('SignalWire does not expose campaign or phone-number identity on an order lookup, so LGQ cannot prove this assignment order absent without its originally captured order ID. Recovery is blocked.');
      }
      try {
        const order = await client.getAssignmentOrder(capturedOrderId);
        throw new Error(`SignalWire still has assignment order ${order.id}. Import that success; do not create a duplicate order.`);
      } catch (error) {
        if (!(error instanceof SignalWireProvisioningError && error.status === 404 && error.outcomeKnownAbsent)) {
          throw error;
        }
      }
    }
    const { error } = await admin.rpc('resolve_messaging_number_operation_v2', {
      p_operation_id: operation.id,
      p_resolution: 'confirmed_absent',
      p_provider_object_id: null,
      p_provider_result: null,
      p_actor_reference: input.actorReference,
    });
    if (error) throw rpcFailure('Unable to resolve the absent SignalWire operation', error);
    return;
  }

  const providerObjectId = (input.providerObjectId || operation.providerObjectId || '').trim();
  if (!UUID.test(providerObjectId)) throw new Error('Confirmed success requires the exact SignalWire provider object UUID.');
  let providerResult: Record<string, unknown>;

  if (operation.type === 'purchase_number') {
    const phone = await client.getPhoneNumber(providerObjectId);
    const expectedNumber = requiredString(operation.requestPayload.number, 'Claimed purchase number');
    if (phone.number !== expectedNumber) {
      throw new Error('The SignalWire phone resource does not match the claimed purchase.');
    }
    providerResult = {
      id: phone.id,
      number: phone.number,
      name: phone.name,
      capabilities: phone.capabilities,
    };
  } else if (operation.type === 'configure_inbound') {
    if (providerObjectId !== input.application.providerNumberId) {
      throw new Error('Inbound recovery provider object does not match the purchased number resource.');
    }
    const phone = await client.getPhoneNumber(providerObjectId);
    const expectedUrl = requireExactSignalWireInboundWebhook(
      requiredString(operation.requestPayload.inbound_url, 'Claimed inbound URL'),
    );
    if (
      phone.number !== input.application.purchasedNumber
      || phone.messageRequestUrl !== expectedUrl
      || phone.messageHandler?.toLowerCase() !== 'laml_webhooks'
      || phone.messageRequestMethod?.toUpperCase() !== 'POST'
    ) {
      throw new Error('SignalWire does not currently show the exact production POST inbound configuration.');
    }
    providerResult = {
      id: phone.id,
      number: phone.number,
      message_handler: phone.messageHandler,
      message_request_url: phone.messageRequestUrl,
      message_request_method: phone.messageRequestMethod,
    };
  } else {
    const target = assignmentRecoveryTarget(operation, input.application, input.campaignBinding);
    const capturedOrderId = capturedAssignmentOrderId(operation);
    if (!capturedOrderId) {
      throw new Error('SignalWire order lookups do not expose their campaign or phone numbers. An operator-supplied assignment order UUID cannot be imported without the originally captured provider response.');
    }
    if (providerObjectId !== capturedOrderId) {
      throw new Error('The supplied assignment order UUID does not match the provider response captured for this operation.');
    }
    const order = await client.getAssignmentOrder(capturedOrderId);
    const assignment = await client.getNumberAssignment(target);
    if (!assignment) {
      throw new Error('SignalWire does not yet show the exact campaign and number assignment for the captured order. Recovery remains blocked.');
    }
    if (!input.application.providerNumberId
        || assignment.providerNumberId !== input.application.providerNumberId) {
      throw new Error('SignalWire assignment evidence does not reference this application\'s exact purchased phone resource.');
    }
    providerResult = {
      id: order.id,
      state: order.state,
      // Redacted for the same reason as the sibling at the normal completion
      // site: the token is a credential and must not become a durable row.
      status_callback_url: redactedSignalWire10dlcStatusCallback(order.statusCallbackUrl),
      campaign_id: assignment.campaignId,
      number: assignment.number,
      assignment_id: assignment.id,
      assignment_state: assignment.state,
      provider_number_id: assignment.providerNumberId,
    };
  }

  const { error } = await admin.rpc('resolve_messaging_number_operation_v2', {
    p_operation_id: operation.id,
    p_resolution: 'confirmed_succeeded',
    p_provider_object_id: providerObjectId,
    p_provider_result: providerResult,
    p_actor_reference: input.actorReference,
  });
  if (error) throw rpcFailure('Unable to import the confirmed SignalWire operation', error);
}

export function isProvisioningMutationEnabled(): boolean {
  return process.env.LGQ_SIGNALWIRE_PROVISIONING_ENABLED === '1';
}

export function minutesUntilCampaignAssignment(purchasedAt: string | null, now = new Date()): number | null {
  if (!purchasedAt) return null;
  const purchased = new Date(purchasedAt).getTime();
  if (!Number.isFinite(purchased)) return null;
  return Math.max(0, Math.ceil((purchased + 60 * 60_000 - now.getTime()) / 60_000));
}
