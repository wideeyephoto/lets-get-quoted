'use server';

import { revalidatePath } from 'next/cache';
import {
  acceptSubcontractorOffer,
  askSubcontractorQuestion,
  declineSubcontractorOffer,
  keepAsBackup,
} from '@/lib/subcontractor-dispatch-data';

// The public actions. No session, no account context — the signed token IS the
// authorisation, and every one of these resolves it fresh rather than trusting
// anything the form posted alongside it.
//
// Each action revalidates only this token's own page. There is nothing else this
// visitor can see, and revalidating a dashboard path from an unauthenticated
// request would be handing a stranger a lever on somebody else's cache.

export async function acceptOfferAction(token: string) {
  await acceptSubcontractorOffer(token);
  revalidatePath(`/sub/${token}`);
}

export async function declineOfferAction(token: string, formData: FormData) {
  await declineSubcontractorOffer(token, {
    reason: (formData.get('reason') ?? '').toString(),
    backup: formData.get('backup') !== null,
  });
  revalidatePath(`/sub/${token}`);
}

export async function askQuestionAction(token: string, formData: FormData) {
  await askSubcontractorQuestion(token, (formData.get('question') ?? '').toString());
  revalidatePath(`/sub/${token}`);
}

export async function keepAsBackupAction(token: string) {
  await keepAsBackup(token);
  revalidatePath(`/sub/${token}`);
}
