'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { restoreEntity, type RecoverableEntityType } from '@/lib/recoverable-deletions';

export async function restoreTrashItemAction(entityType: string, entityId: string) {
  const { accountId, userId, userEmail, role } = await requireOfficeContext('settings.write');

  const validTypes: RecoverableEntityType[] = ['lead', 'crew', 'service', 'job', 'attachment'];
  if (!validTypes.includes(entityType as RecoverableEntityType)) {
    throw new Error(`Invalid entity type: ${entityType}`);
  }

  await restoreEntity({
    accountId,
    entityType: entityType as RecoverableEntityType,
    entityId,
    actor: {
      userId,
      role,
      email: userEmail ?? undefined,
    },
    source: 'web',
  });

  revalidatePath('/dashboard/trash');
  revalidatePath('/dashboard/activity');
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/services');
  revalidatePath('/dashboard/jobs');
}
