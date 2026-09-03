'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { sendClientPortalLinkEmail } from '@/lib/email';
import { sendClientPortalLinkSms } from '@/lib/sms';
import { portalLinkText } from '@/lib/sms-templates';
import { issuePortalLink } from '@/lib/client-portal-data';
import { parsePortalIdentifier, PORTAL_REQUEST_ACK } from '@/lib/client-portal';

/**
 * Global portal lookup action for homeowners visiting /portal directly.
 * Matches by phone or email, issues secure access tokens, and delivers links
 * via SMS or email while preserving strict rate limiting and privacy.
 */
export async function requestGlobalPortalLinkAction(formData: FormData): Promise<{ message: string }> {
  const admin = createAdminClient();
  const identifier = parsePortalIdentifier(String(formData.get('contact') ?? ''));
  const ip = clientIpFrom(await headers());

  if (!(await checkRateLimit(admin, `portal:ip:${ip}`, 8, 60))) return { message: PORTAL_REQUEST_ACK };
  if (!identifier) return { message: PORTAL_REQUEST_ACK };
  if (!(await checkRateLimit(admin, `portal:id:${identifier.value}`, 3, 900))) return { message: PORTAL_REQUEST_ACK };

  try {
    let clients: Array<{ id: string; account_id: string; name?: string | null; phone?: string | null; email?: string | null }> = [];

    if (identifier.kind === 'email') {
      const { data } = await admin
        .from('clients')
        .select('id, account_id, name, phone, email')
        .eq('email', identifier.value)
        .limit(10);
      clients = data ?? [];
    } else {
      const { data: exactMatches } = await admin
        .from('clients')
        .select('id, account_id, name, phone, email')
        .eq('phone', identifier.value)
        .limit(10);

      if (exactMatches && exactMatches.length > 0) {
        clients = exactMatches;
      } else {
        // Fallback: match by normalized last 10 digits across accounts
        const last10 = identifier.value.replace(/\D/g, '').slice(-10);
        if (last10.length === 10) {
          const { data: candidates } = await admin
            .from('clients')
            .select('id, account_id, name, phone, email')
            .not('phone', 'is', null)
            .limit(500);

          clients = (candidates ?? [])
            .filter((c) => String(c.phone ?? '').replace(/\D/g, '').slice(-10) === last10)
            .slice(0, 10);
        }
      }
    }

    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

    if (clients && clients.length > 0) {
      for (const client of clients) {
        const { data: account } = await admin
          .from('accounts')
          .select('client_portal_enabled, business_name')
          .eq('id', client.account_id)
          .maybeSingle();

        if (!account?.client_portal_enabled) continue;

        const issued = await issuePortalLink(admin, client.account_id, identifier);
        if (issued) {
          const businessName = account.business_name || "Let's Get Quoted";
          const linkUrl = `${origin}/portal/view/${issued.token}`;

          if (identifier.kind === 'email') {
            await sendClientPortalLinkEmail({
              recipientEmail: identifier.value,
              businessName,
              linkUrl,
              accountId: client.account_id,
            });
          } else {
            await sendClientPortalLinkSms({
              accountId: client.account_id,
              toPhone: identifier.value,
              message: portalLinkText({ businessName, link: linkUrl }),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Global portal link request error:', error);
  }

  return { message: PORTAL_REQUEST_ACK };
}
