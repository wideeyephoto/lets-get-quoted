'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAdminAction } from '@/lib/admin';
import { requireMfaPermission } from '@/lib/auth';
import { logMessagingRegistrationActionFailure } from '@/lib/messaging-registration-action-failure';
import {
  assignMessagingNumberCampaign,
  configureMessagingNumberInbound,
  loadAdminMessagingRegistrationApplication,
  loadMessagingComplianceVerification,
  loadMessagingNumberPurchasePolicy,
  messagingNumberPurchaseConfirmation,
  minutesUntilCampaignAssignment,
  purchaseMessagingNumber,
  reconcileMessagingNumberAssignment,
  recordMessagingComplianceVerification,
  requireProvisioningMutationEnabled,
  requireSignalWireProviderProvisioningReadiness,
  resolveIndeterminateMessagingNumberOperation,
  reviewMessagingRegistrationApplication,
  searchAndRecordMessagingNumberCandidate,
  setMessagingNumberPurchasePolicy,
  SupabaseMessagingNumberOperationStore,
  verifySignalWireCampaignBinding,
  type MessagingRegistrationApplication,
  type SignalWireCampaignBindingExpectation,
} from '@/lib/messaging-number-provisioning';
import {
  SignalWireNumberProvisioningClient,
} from '@/lib/signalwire-number-provisioning';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RegistrationAction =
  | 'review_application'
  | 'record_compliance_verification'
  | 'search_number_candidate'
  | 'purchase_number'
  | 'configure_inbound'
  | 'assign_campaign'
  | 'reconcile_assignment'
  | 'resolve_indeterminate_operation'
  | 'set_spend_policy';

function completed(applicationId: string): never {
  const query = new URLSearchParams({ application: applicationId, done: '1' });
  redirect(`/admin/messaging/registrations?${query}`);
}

function failed(
  applicationId: string | null,
  action: RegistrationAction,
  fallbackCode: string,
  error: unknown,
): never {
  const correlationId = logMessagingRegistrationActionFailure({
    applicationId,
    action,
    fallbackCode,
    error: typeof error === 'string' ? new Error(error) : error,
  });
  const query = new URLSearchParams({ error: '1', correlation: correlationId });
  if (applicationId) query.set('application', applicationId);
  redirect(`/admin/messaging/registrations?${query}`);
}

function applicationId(formData: FormData, action: RegistrationAction): string {
  const value = String(formData.get('applicationId') ?? '').trim().toLowerCase();
  if (!UUID.test(value)) failed(null, action, 'invalid_application_id', 'The application identifier was missing or malformed.');
  return value;
}

function refresh(): void {
  revalidatePath('/admin/messaging');
  revalidatePath('/admin/messaging/registrations');
  revalidatePath('/dashboard/messages');
  revalidatePath('/dashboard/messages/dedicated-number');
}

function positiveCents(formData: FormData, name: string, label: string): number {
  const raw = String(formData.get(name) ?? '').trim();
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) throw new Error(`${label} must be a positive whole number of cents.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is too large.`);
  return value;
}

function spendPolicyConfirmation(monthlyPriceCents: number, ceilingCents: number): string {
  return `SET SIGNALWIRE POLICY USD ${(monthlyPriceCents / 100).toFixed(2)}/MO LIMIT USD ${(ceilingCents / 100).toFixed(2)}/MO`;
}

async function requireApplication(
  id: string,
  action: RegistrationAction,
  admin: Parameters<typeof loadAdminMessagingRegistrationApplication>[1],
): Promise<MessagingRegistrationApplication> {
  let application: MessagingRegistrationApplication | null;
  try {
    application = await loadAdminMessagingRegistrationApplication(id, admin);
  } catch (error) {
    failed(id, action, 'application_read_failed', error);
  }
  if (!application) failed(id, action, 'application_not_found', 'That application no longer exists.');
  return application;
}

async function campaignBinding(
  application: MessagingRegistrationApplication,
  admin: Parameters<typeof loadMessagingComplianceVerification>[1],
): Promise<SignalWireCampaignBindingExpectation> {
  if (!application.providerBrandId || !application.providerCampaignId) {
    throw new Error('The downstream SignalWire brand and campaign IDs are both required.');
  }
  const compliance = await loadMessagingComplianceVerification(application.id, admin);
  if (
    !compliance
    || compliance.accountId !== application.accountId
    || compliance.applicationRevision !== application.revision
  ) {
    throw new Error('A current tax-identity verification is required for this application revision.');
  }
  return {
    brandId: application.providerBrandId,
    campaignId: application.providerCampaignId,
    legalBusinessName: application.legalBusinessName,
    dbaName: application.dbaName,
    websiteUrl: application.websiteUrl,
    einLastFour: compliance.einLastFour,
  };
}

export async function reviewMessagingApplicationAction(formData: FormData): Promise<void> {
  const action = 'review_application' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const before = await requireApplication(id, action, ctx.admin);
  if (
    ['approved', 'provisioning', 'active', 'suspended'].includes(before.status)
    || before.providerBrandId
    || before.providerCampaignId
    || before.providerNumberId
  ) {
    failed(id, action, 'immutable_approved_identity', 'Approved registration identity is immutable. Suspend and create a new reviewed revision instead of editing it in place.');
  }
  const decision = String(formData.get('decision') ?? '') as 'under_review' | 'action_required' | 'approved' | 'rejected';
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 4000);
  const providerBrandId = String(formData.get('providerBrandId') ?? '').trim();
  const providerCampaignId = String(formData.get('providerCampaignId') ?? '').trim();
  if (!['under_review', 'action_required', 'approved', 'rejected'].includes(decision)) {
    failed(id, action, 'invalid_review_decision', 'Choose a valid review decision.');
  }
  if (['action_required', 'rejected'].includes(decision) && detail.length < 10) {
    failed(id, action, 'review_detail_required', 'Explain what the business must change.');
  }
  if (decision === 'approved' && (!UUID.test(providerCampaignId) || !UUID.test(providerBrandId))) {
    failed(id, action, 'invalid_provider_registration_ids', 'Approval requires both the SignalWire downstream brand UUID and campaign UUID.');
  }
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (decision === 'approved' && confirmation !== `APPROVE ${id}`) {
    failed(id, action, 'confirmation_mismatch', 'The typed approval confirmation did not match. The application was not approved.');
  }
  try {
    let providerVerification: Awaited<ReturnType<typeof verifySignalWireCampaignBinding>> | null = null;
    if (decision === 'approved') {
      // Gate, MFA, IDs and typed confirmation all precede credential/client construction.
      requireProvisioningMutationEnabled();
      requireSignalWireProviderProvisioningReadiness(before.accountId);
      const compliance = await loadMessagingComplianceVerification(id, ctx.admin);
      if (!compliance || compliance.accountId !== before.accountId || compliance.applicationRevision !== before.revision) {
        throw new Error('Approval requires current tax verification for this exact application revision.');
      }
      providerVerification = await verifySignalWireCampaignBinding({
        brandId: providerBrandId,
        campaignId: providerCampaignId,
        legalBusinessName: before.legalBusinessName,
        dbaName: before.dbaName,
        websiteUrl: before.websiteUrl,
        einLastFour: compliance.einLastFour,
        client: SignalWireNumberProvisioningClient.fromEnvironment(),
      });
    }
    await reviewMessagingRegistrationApplication({
      applicationId: id,
      decision,
      detail,
      providerBrandId,
      providerCampaignId,
      providerVerification,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_registration_review',
      accountId: before.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: detail || decision,
      before: { status: before.status },
      after: { status: decision, providerBrandId: providerBrandId || null, providerCampaignId: providerCampaignId || null },
    });
  } catch (error) {
    failed(id, action, 'review_failed', error);
  }
  refresh();
  completed(id);
}

export async function recordMessagingComplianceVerificationAction(formData: FormData): Promise<void> {
  const action = 'record_compliance_verification' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  if (
    ['approved', 'provisioning', 'active', 'suspended'].includes(application.status)
    || application.providerBrandId
    || application.providerCampaignId
    || application.providerNumberId
  ) {
    failed(id, action, 'immutable_approved_identity', 'Approved registration identity is immutable. Start a new reviewed revision to change tax evidence.');
  }
  const einLastFour = String(formData.get('einLastFour') ?? '').trim();
  const verificationReference = String(formData.get('verificationReference') ?? '').trim().slice(0, 255);
  if (!/^[0-9]{4}$/.test(einLastFour)) failed(id, action, 'invalid_ein_last_four', 'Enter exactly the last four EIN digits.');
  if (verificationReference.length < 4) failed(id, action, 'verification_reference_required', 'Enter the nonsecret provider or case reference.');
  if (verificationReference.replace(/\D/g, '').length === 9
      || /(?:^|\D)[0-9]{2}-?[0-9]{7}(?:\D|$)/.test(verificationReference)) {
    failed(id, action, 'full_ein_refused', 'Do not put a full EIN in the verification reference.');
  }
  try {
    await recordMessagingComplianceVerification({
      applicationId: id,
      einLastFour,
      verificationReference,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_compliance_verification_record',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: verificationReference,
      after: {
        applicationRevision: application.revision,
        einLastFourStored: true,
        verificationReference,
      },
    });
  } catch (error) {
    failed(id, action, 'compliance_verification_failed', error);
  }
  refresh();
  completed(id);
}

export async function searchMessagingNumberCandidateAction(formData: FormData): Promise<void> {
  const action = 'search_number_candidate' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  try {
    const candidate = await searchAndRecordMessagingNumberCandidate({
      applicationId: id,
      areaCode: application.desiredAreaCode,
      region: application.region,
      actorReference: ctx.adminEmail,
      store: new SupabaseMessagingNumberOperationStore(ctx.admin),
      client: SignalWireNumberProvisioningClient.fromEnvironment(),
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_candidate_select',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      meta: { number: candidate.number, areaCode: application.desiredAreaCode, region: application.region },
    });
  } catch (error) {
    failed(id, action, 'candidate_search_failed', error);
  }
  refresh();
  completed(id);
}

export async function purchaseMessagingNumberAction(formData: FormData): Promise<void> {
  const action = 'purchase_number' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  if (!application.candidateNumber) failed(id, action, 'candidate_required', 'Refresh a number candidate first.');
  let purchasePolicy: Awaited<ReturnType<typeof loadMessagingNumberPurchasePolicy>>;
  try {
    purchasePolicy = await loadMessagingNumberPurchasePolicy(ctx.admin);
  } catch (error) {
    failed(id, action, 'purchase_policy_read_failed', error);
  }
  if (!purchasePolicy) {
    failed(id, action, 'purchase_policy_missing', 'Purchase is blocked until an operator-reviewed monthly carrier price and aggregate spend ceiling are configured.');
  }
  const expectedConfirmation = messagingNumberPurchaseConfirmation(application.candidateNumber, purchasePolicy);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expectedConfirmation) {
    failed(id, action, 'confirmation_mismatch', 'The typed purchase confirmation did not match. Nothing was purchased.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const binding = await campaignBinding(application, ctx.admin);
    const result = await purchaseMessagingNumber({
      applicationId: id,
      accountId: application.accountId,
      number: application.candidateNumber,
      purchasePolicy,
      binding,
      actorReference: ctx.adminEmail,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_purchase',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: confirmation,
      after: {
        providerNumberId: result.providerObjectId,
        number: application.candidateNumber,
        monthlyCarrierPriceCents: purchasePolicy.monthlyPriceCents,
        monthlySpendCeilingCents: purchasePolicy.monthlySpendCeilingCents,
        replay: result.replay,
      },
    });
  } catch (error) {
    failed(id, action, 'purchase_failed', error);
  }
  refresh();
  completed(id);
}

export async function configureMessagingInboundAction(formData: FormData): Promise<void> {
  const action = 'configure_inbound' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  if (!application.providerNumberId || !application.purchasedNumber) failed(id, action, 'purchased_number_required', 'No purchased number is recorded.');
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== `CONFIGURE ${application.purchasedNumber}`) {
    failed(id, action, 'confirmation_mismatch', 'The typed inbound-configuration confirmation did not match. The provider number was not changed.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const binding = await campaignBinding(application, ctx.admin);
    const result = await configureMessagingNumberInbound({
      applicationId: id,
      accountId: application.accountId,
      providerNumberId: application.providerNumberId,
      number: application.purchasedNumber,
      friendlyName: `LGQ ${application.businessName || application.legalBusinessName}`,
      binding,
      actorReference: ctx.adminEmail,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_inbound_configure',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: confirmation,
      after: { providerNumberId: result.providerObjectId, replay: result.replay },
    });
  } catch (error) {
    failed(id, action, 'inbound_configuration_failed', error);
  }
  refresh();
  completed(id);
}

export async function assignMessagingCampaignAction(formData: FormData): Promise<void> {
  const action = 'assign_campaign' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  if (!application?.purchasedNumber || !application.providerCampaignId || !application.inboundConfiguredAt) {
    failed(id, action, 'assignment_prerequisites_missing', 'The number, campaign, and inbound webhook must all be ready first.');
  }
  const wait = minutesUntilCampaignAssignment(application.purchasedAt);
  if (wait === null || wait > 0) failed(id, action, 'provider_provisioning_wait', 'The provider provisioning wait has not elapsed for this newly purchased number.');
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== `ASSIGN ${application.purchasedNumber}`) {
    failed(id, action, 'confirmation_mismatch', 'The typed campaign-assignment confirmation did not match. No assignment was created.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const binding = await campaignBinding(application, ctx.admin);
    const result = await assignMessagingNumberCampaign({
      applicationId: id,
      accountId: application.accountId,
      campaignId: application.providerCampaignId,
      number: application.purchasedNumber,
      binding,
      actorReference: ctx.adminEmail,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_campaign_assign',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: confirmation,
      after: { orderId: result.providerObjectId, number: application.purchasedNumber, replay: result.replay },
    });
  } catch (error) {
    failed(id, action, 'campaign_assignment_failed', error);
  }
  refresh();
  completed(id);
}

export async function reconcileMessagingAssignmentAction(formData: FormData): Promise<void> {
  const action = 'reconcile_assignment' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  if (!application.purchasedNumber || !application.providerNumberId || !application.providerCampaignId || !application.assignmentOrderId) {
    failed(id, action, 'assignment_order_required', 'No campaign assignment order is recorded for this application.');
  }
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== `RECONCILE ${application.purchasedNumber}`) {
    failed(id, action, 'confirmation_mismatch', 'The typed reconciliation confirmation did not match. Local activation was not changed.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const binding = await campaignBinding(application, ctx.admin);
    const state = await reconcileMessagingNumberAssignment({
      applicationId: id,
      accountId: application.accountId,
      campaignId: application.providerCampaignId,
      number: application.purchasedNumber,
      expectedProviderNumberId: application.providerNumberId,
      binding,
      actorReference: ctx.adminEmail,
      store: new SupabaseMessagingNumberOperationStore(ctx.admin),
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_assignment_reconcile',
      accountId: application.accountId,
      targetType: 'messaging_registration_application',
      targetId: id,
      reason: confirmation,
      after: { individualAssignmentState: state },
    });
  } catch (error) {
    failed(id, action, 'assignment_reconciliation_failed', error);
  }
  refresh();
  completed(id);
}

export async function resolveMessagingNumberOperationAction(formData: FormData): Promise<void> {
  const action = 'resolve_indeterminate_operation' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  const operationId = String(formData.get('operationId') ?? '').trim().toLowerCase();
  const resolution = String(formData.get('resolution') ?? '') as 'confirmed_absent' | 'confirmed_succeeded';
  const providerObjectId = String(formData.get('providerObjectId') ?? '').trim().toLowerCase();
  if (!UUID.test(operationId) || !['confirmed_absent', 'confirmed_succeeded'].includes(resolution)) {
    failed(id, action, 'invalid_recovery_decision', 'Choose a valid indeterminate operation and recovery decision.');
  }
  if (resolution === 'confirmed_succeeded' && !UUID.test(providerObjectId)) {
    failed(id, action, 'invalid_provider_object_id', 'Importing success requires the exact SignalWire provider object UUID.');
  }
  const expectedConfirmation = resolution === 'confirmed_absent'
    ? `ABSENT ${operationId}`
    : `IMPORT ${operationId} ${providerObjectId}`;
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expectedConfirmation) {
    failed(id, action, 'confirmation_mismatch', 'The typed recovery confirmation did not match. The quarantined operation was not changed.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const binding = await campaignBinding(application, ctx.admin);
    await resolveIndeterminateMessagingNumberOperation({
      application,
      operationId,
      resolution,
      providerObjectId: providerObjectId || null,
      actorReference: ctx.adminEmail,
      campaignBinding: binding,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_operation_recovery',
      accountId: application.accountId,
      targetType: 'messaging_number_provisioning_operation',
      targetId: operationId,
      reason: confirmation,
      after: { resolution, providerObjectId: providerObjectId || null },
    });
  } catch (error) {
    failed(id, action, 'operation_recovery_failed', error);
  }
  refresh();
  completed(id);
}

export async function setMessagingNumberSpendPolicyAction(formData: FormData): Promise<void> {
  const action = 'set_spend_policy' satisfies RegistrationAction;
  const ctx = await requireMfaPermission('ops.manage');
  const id = applicationId(formData, action);
  const application = await requireApplication(id, action, ctx.admin);
  let monthlyPriceCents: number;
  let monthlySpendCeilingCents: number;
  try {
    monthlyPriceCents = positiveCents(formData, 'monthlyPriceCents', 'Monthly unit price');
    monthlySpendCeilingCents = positiveCents(formData, 'monthlySpendCeilingCents', 'Aggregate monthly ceiling');
  } catch (error) {
    failed(id, action, 'invalid_spend_policy', error);
  }
  if (monthlyPriceCents > monthlySpendCeilingCents) {
    failed(id, action, 'invalid_spend_policy_range', 'The aggregate monthly ceiling cannot be lower than one number\'s monthly price.');
  }
  const expectedConfirmation = spendPolicyConfirmation(monthlyPriceCents, monthlySpendCeilingCents);
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  if (confirmation !== expectedConfirmation) {
    failed(id, action, 'confirmation_mismatch', 'The typed spend-policy confirmation did not match. The policy was not changed.');
  }
  try {
    requireProvisioningMutationEnabled();
    requireSignalWireProviderProvisioningReadiness(application.accountId);
    const policy = await setMessagingNumberPurchasePolicy({
      monthlyPriceCents,
      monthlySpendCeilingCents,
      actorReference: ctx.adminEmail,
      admin: ctx.admin,
    });
    await logAdminAction(ctx.admin, ctx, {
      action: 'messaging_number_spend_policy_set',
      accountId: application.accountId,
      targetType: 'messaging_number_spend_policy',
      targetId: policy.provider,
      reason: confirmation,
      after: {
        provider: policy.provider,
        revision: policy.revision,
        monthlyCarrierPriceCents: policy.monthlyPriceCents,
        monthlySpendCeilingCents: policy.monthlySpendCeilingCents,
      },
    });
  } catch (error) {
    failed(id, action, 'spend_policy_update_failed', error);
  }
  refresh();
  completed(id);
}
