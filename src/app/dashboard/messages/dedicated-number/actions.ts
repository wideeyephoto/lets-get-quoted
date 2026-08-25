'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { buildStandardContractorCampaignPayload } from '@/lib/messaging-contractor-campaign-template';
import {
  submitMessagingRegistrationApplication,
  validateMessagingApplication,
} from '@/lib/messaging-number-provisioning';
import { logMessagingRegistrationActionFailure } from '@/lib/messaging-registration-action-failure';

type ResultCode = 'submitted' | 'invalid' | 'save_failed';

function back(kind: 'done' | 'error', code: ResultCode): never {
  redirect(`/dashboard/messages/dedicated-number?${kind}=${code}`);
}

export async function submitDedicatedNumberApplicationAction(formData: FormData) {
  const { accountId, userId, userEmail } = await requireOwnerContext();

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
    businessType: String(formData.get('businessType') ?? ''),
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
    await submitMessagingRegistrationApplication({
      accountId,
      userId,
      submissionKey,
      value: validation.value,
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
