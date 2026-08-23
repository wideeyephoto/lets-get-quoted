'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
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
  const { accountId, userId } = await requireOwnerContext();
  const parsedVolume = Number(String(formData.get('estimatedMonthlyMessages') ?? '').trim());
  const validation = validateMessagingApplication({
    legalBusinessName: String(formData.get('legalBusinessName') ?? ''),
    dbaName: String(formData.get('dbaName') ?? ''),
    businessType: String(formData.get('businessType') ?? ''),
    websiteUrl: String(formData.get('websiteUrl') ?? ''),
    businessEmail: String(formData.get('businessEmail') ?? ''),
    businessPhone: String(formData.get('businessPhone') ?? ''),
    authorizedContactName: String(formData.get('authorizedContactName') ?? ''),
    authorizedContactTitle: String(formData.get('authorizedContactTitle') ?? ''),
    authorizedContactEmail: String(formData.get('authorizedContactEmail') ?? ''),
    authorizedContactPhone: String(formData.get('authorizedContactPhone') ?? ''),
    messagingSupportEmail: String(formData.get('messagingSupportEmail') ?? ''),
    messagingSupportPhone: String(formData.get('messagingSupportPhone') ?? ''),
    addressLine1: String(formData.get('addressLine1') ?? ''),
    addressLine2: String(formData.get('addressLine2') ?? ''),
    city: String(formData.get('city') ?? ''),
    region: String(formData.get('region') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    desiredAreaCode: String(formData.get('desiredAreaCode') ?? ''),
    messagingUseCase: String(formData.get('messagingUseCase') ?? ''),
    estimatedMonthlyMessages: parsedVolume,
    optInDescription: String(formData.get('optInDescription') ?? ''),
    optInEvidenceUrl: String(formData.get('optInEvidenceUrl') ?? ''),
    sampleMessages: [
      String(formData.get('sampleMessage1') ?? ''),
      String(formData.get('sampleMessage2') ?? ''),
      String(formData.get('sampleMessage3') ?? ''),
    ],
    privacyPolicyUrl: String(formData.get('privacyPolicyUrl') ?? ''),
    termsUrl: String(formData.get('termsUrl') ?? ''),
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
