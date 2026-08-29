'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { buildStandardContractorCampaignPayload } from '@/lib/messaging-contractor-campaign-template';
import {
  recordMessagingComplianceVerification,
  submitMessagingRegistrationApplication,
  validateMessagingApplication,
} from '@/lib/messaging-number-provisioning';
import { sendFounderMessagingApplicationAlert } from '@/lib/founder-alerts';
import { sendMessagingApplicationSubmittedEmail } from '@/lib/email';
import { MESSAGING_SETUP_FEE_USD } from '@/lib/billing/messaging-setup-checkout';
import { logMessagingRegistrationActionFailure } from '@/lib/messaging-registration-action-failure';

type ResultCode = 'submitted' | 'invalid' | 'save_failed';

function back(kind: 'done' | 'error', code: ResultCode): never {
  redirect(`/dashboard/messages/dedicated-number?${kind}=${code}`);
}

export async function submitDedicatedNumberApplicationAction(formData: FormData) {
  const { accountId, userId, userEmail } = await requireOwnerContext();

  const businessType = String(formData.get('businessType') ?? '');
  const rawEin = String(formData.get('ein') ?? '').trim();

  const einDigits = rawEin.replace(/\D/g, '');
  const isSoleProp = businessType === 'sole_proprietor';
  const hasEin = einDigits.length > 0;

  // EIN validation:
  // Non-sole proprietors MUST have a valid 9-digit EIN.
  // Sole proprietors can either provide a 9-digit EIN or register as no-EIN sole prop.
  if (!isSoleProp) {
    if (einDigits.length !== 9) back('error', 'invalid');
  } else if (hasEin && einDigits.length !== 9) {
    back('error', 'invalid');
  }

  const legalBusinessName = String(formData.get('legalBusinessName') ?? '').trim();
  const dbaName = String(formData.get('dbaName') ?? '').trim();
  const websiteUrl = String(formData.get('websiteUrl') ?? '').trim();
  const businessEmail = String(formData.get('businessEmail') ?? '').trim();
  const businessPhone = String(formData.get('businessPhone') ?? '').trim();
  const authorizedContactName = String(formData.get('authorizedContactName') ?? '').trim();
  const authorizedContactTitle = String(formData.get('authorizedContactTitle') ?? '').trim();
  const authorizedContactEmail = String(formData.get('authorizedContactEmail') ?? '').trim();
  const authorizedContactPhone = String(formData.get('authorizedContactPhone') ?? '').trim();

  const standardTemplate = buildStandardContractorCampaignPayload({
    legalBusinessName: legalBusinessName || 'Your Business',
    dbaName: dbaName || null,
    websiteUrl: websiteUrl || 'https://example.com',
    supportEmail: businessEmail || userEmail || 'support@example.com',
    supportPhone: businessPhone || '+12485550140',
  });

  const parsedVolume = Number(String(formData.get('estimatedMonthlyMessages') ?? '').trim()) || 500;
  const messagingSupportEmail = String(formData.get('messagingSupportEmail') ?? '').trim()
    || businessEmail
    || authorizedContactEmail
    || userEmail
    || '';
  const messagingSupportPhone = String(formData.get('messagingSupportPhone') ?? '').trim()
    || businessPhone
    || authorizedContactPhone
    || '';
  const optInEvidenceUrl = String(formData.get('optInEvidenceUrl') ?? '').trim()
    || (websiteUrl ? `${websiteUrl.replace(/\/+$/, '')}/#quote` : '');
  const messagingUseCase = String(formData.get('messagingUseCase') ?? '').trim()
    || standardTemplate.description;
  const optInDescription = String(formData.get('optInDescription') ?? '').trim()
    || standardTemplate.optInDescription;
  const privacyPolicyUrl = String(formData.get('privacyPolicyUrl') ?? '').trim()
    || (websiteUrl ? `${websiteUrl.replace(/\/+$/, '')}/privacy` : '');
  const termsUrl = String(formData.get('termsUrl') ?? '').trim()
    || (websiteUrl ? `${websiteUrl.replace(/\/+$/, '')}/terms` : '');

  const sampleMessage1 = String(formData.get('sampleMessage1') ?? '').trim() || standardTemplate.sampleMessages[0] || '';
  const sampleMessage2 = String(formData.get('sampleMessage2') ?? '').trim() || standardTemplate.sampleMessages[1] || '';
  const sampleMessage3 = String(formData.get('sampleMessage3') ?? '').trim() || standardTemplate.sampleMessages[2] || '';

  const validation = validateMessagingApplication({
    legalBusinessName,
    dbaName,
    businessType,
    websiteUrl,
    businessEmail,
    businessPhone,
    authorizedContactName,
    authorizedContactTitle,
    authorizedContactEmail,
    authorizedContactPhone,
    messagingSupportEmail,
    messagingSupportPhone,
    addressLine1: String(formData.get('addressLine1') ?? ''),
    addressLine2: String(formData.get('addressLine2') ?? ''),
    city: String(formData.get('city') ?? ''),
    region: String(formData.get('region') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    desiredAreaCode: String(formData.get('desiredAreaCode') ?? ''),
    messagingUseCase,
    estimatedMonthlyMessages: parsedVolume,
    optInDescription,
    optInEvidenceUrl,
    sampleMessages: [sampleMessage1, sampleMessage2, sampleMessage3].filter(Boolean),
    privacyPolicyUrl,
    termsUrl,
    attested: formData.get('attested') === 'on',
  });
  if (!validation.ok) back('error', 'invalid');

  const submissionKey = String(formData.get('submissionKey') ?? '');
  try {
    const result = await submitMessagingRegistrationApplication({
      accountId,
      userId,
      submissionKey,
      value: validation.value,
    });

    if (einDigits.length === 9) {
      await recordMessagingComplianceVerification({
        applicationId: result.applicationId,
        einLastFour: einDigits.slice(-4),
        verificationReference: 'Owner-submitted 10DLC registration',
        actorReference: userEmail || userId,
      });
    }

    // Fire dual notifications (Admin / Founder alert + Contractor receipt)
    sendFounderMessagingApplicationAlert({
      applicationId: result.applicationId,
      accountId,
      businessName: validation.value.legalBusinessName,
      dbaName: validation.value.dbaName,
      businessType: validation.value.businessType,
      contactName: validation.value.authorizedContactName,
      contactEmail: validation.value.authorizedContactEmail || userEmail || '',
      contactPhone: validation.value.authorizedContactPhone,
      desiredAreaCode: validation.value.desiredAreaCode,
      setupFeePaid: `${MESSAGING_SETUP_FEE_USD} (Paid)`,
      einLastFour: einDigits.length === 9 ? einDigits.slice(-4) : null,
      websiteUrl: validation.value.websiteUrl,
    }).catch((err) => {
      console.error('[founder-alert] Failed to send messaging application alert:', err);
    });

    sendMessagingApplicationSubmittedEmail({
      accountId,
      recipientEmail: validation.value.businessEmail || validation.value.authorizedContactEmail || userEmail || '',
      businessName: validation.value.legalBusinessName,
      desiredAreaCode: validation.value.desiredAreaCode,
      amountPaid: MESSAGING_SETUP_FEE_USD,
    }).catch((err) => {
      console.error('[contractor-email] Failed to send messaging confirmation email:', err);
    });
  } catch (error) {
    logMessagingRegistrationActionFailure({
      applicationId: null,
      action: 'owner_submit_dedicated_number_application',
      fallbackCode: 'owner_submission_failed',
      error,
    });
    back('error', 'save_failed');
  }

  revalidatePath('/dashboard/messages');
  revalidatePath('/dashboard/messages/dedicated-number');
  back('done', 'submitted');
}
