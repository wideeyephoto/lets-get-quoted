'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import {
  createApiToken,
  revokeApiToken,
  type ApiScope,
} from '@/lib/public-api/api-credentials';
import { validateWebhookUrl } from '@/lib/public-api/ssrf-guard';
import {
  generateWebhookSecret,
  encryptWebhookSecret,
} from '@/lib/public-api/webhook-vault-crypto';

export type CreateTokenActionResult = {
  success: boolean;
  error?: string;
  tokenSecret?: string;
  tokenPrefix?: string;
  name?: string;
};

export async function createApiTokenAction(
  prevState: CreateTokenActionResult | null,
  formData: FormData
): Promise<CreateTokenActionResult> {
  const { accountId, userId } = await requireOfficeContext('settings.write');
  const name = String(formData.get('name') || '').trim();
  const rawScopes = formData.getAll('scopes').map((s) => String(s).trim()) as ApiScope[];

  if (!name) {
    return { success: false, error: 'Token name is required.' };
  }
  if (!rawScopes.length) {
    return { success: false, error: 'At least one permission scope must be selected.' };
  }

  const admin = createAdminClient();
  try {
    const generated = await createApiToken(admin, {
      accountId,
      name,
      scopes: rawScopes,
      createdBy: userId,
    });

    revalidatePath('/dashboard/settings');
    return {
      success: true,
      tokenSecret: generated.tokenSecret,
      tokenPrefix: generated.tokenPrefix,
      name: generated.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create API token.',
    };
  }
}

export async function revokeApiTokenAction(formData: FormData): Promise<void> {
  const { accountId } = await requireOfficeContext('settings.write');
  const credentialId = String(formData.get('credentialId') || '').trim();
  if (!credentialId) return;

  const admin = createAdminClient();
  try {
    await revokeApiToken(admin, accountId, credentialId);
    revalidatePath('/dashboard/settings');
  } catch (error) {
    console.error('Failed to revoke token:', error);
  }
}

export type CreateWebhookActionResult = {
  success: boolean;
  error?: string;
  secret?: string;
  secretPreview?: string;
};

export async function createWebhookSubscriptionAction(
  prevState: CreateWebhookActionResult | null,
  formData: FormData
): Promise<CreateWebhookActionResult> {
  const { accountId } = await requireOfficeContext('settings.write');
  const targetUrl = String(formData.get('targetUrl') || '').trim();
  const eventTypes = formData.getAll('eventTypes').map((e) => String(e).trim());

  if (!targetUrl) {
    return { success: false, error: 'Target webhook URL is required.' };
  }

  const ssrf = await validateWebhookUrl(targetUrl);
  if (!ssrf.safe) {
    return { success: false, error: `Invalid URL: ${ssrf.reason}` };
  }

  if (!eventTypes.length) {
    return { success: false, error: 'At least one event type must be selected.' };
  }

  const rawSecret = generateWebhookSecret();
  const encryptedSecret = encryptWebhookSecret(rawSecret);
  const secretPreview = `${rawSecret.slice(0, 10)}...`;
  const admin = createAdminClient();

  try {
    const { error } = await admin.from('webhook_subscriptions').insert({
      account_id: accountId,
      target_url: targetUrl,
      event_types: eventTypes,
      encrypted_secret: encryptedSecret,
      secret_preview: secretPreview,
      status: 'active',
    });

    if (error) throw error;
    revalidatePath('/dashboard/settings');
    return {
      success: true,
      secret: rawSecret,
      secretPreview,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register webhook subscription.',
    };
  }
}

export async function deleteWebhookSubscriptionAction(formData: FormData): Promise<void> {
  const { accountId } = await requireOfficeContext('settings.write');
  const subscriptionId = String(formData.get('subscriptionId') || '').trim();
  if (!subscriptionId) return;

  const admin = createAdminClient();
  try {
    const { error } = await admin
      .from('webhook_subscriptions')
      .delete()
      .eq('account_id', accountId)
      .eq('id', subscriptionId);

    if (error) throw error;
    revalidatePath('/dashboard/settings');
  } catch (error) {
    console.error('Failed to delete subscription:', error);
  }
}

export async function retryWebhookDeliveryAction(formData: FormData): Promise<void> {
  const { accountId } = await requireOfficeContext('settings.write');
  const deliveryId = String(formData.get('deliveryId') || '').trim();
  if (!deliveryId) return;

  const admin = createAdminClient();
  try {
    const { data: success, error } = await admin.rpc('retry_webhook_delivery', {
      p_delivery_id: deliveryId,
      p_account_id: accountId,
    });

    if (error || success !== true) {
      console.error('Failed to requeue delivery');
      return;
    }

    revalidatePath('/dashboard/settings');
  } catch (error) {
    console.error('Failed to retry delivery:', error);
  }
}
