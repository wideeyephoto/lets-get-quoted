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
  const ip = clientIpFrom(headers());

  if (!(await checkRateLimit(admin, `portal:ip:${ip}`, 8, 60))) return { message: PORTAL_REQUEST_ACK };
  if (!identifier) return { message: PORTAL_REQUEST_ACK };
  if (!(await checkRateLimit(admin, `portal:id:${identifier.value}`, 3, 900))) return { message: PORTAL_REQUEST_ACK };

  try {
    let clientQuery = admin
      .from('clients')
      .select('id, account_id, name, phone, email')
      .limit(10);

    if (identifier.kind === 'email') {
      clientQuery = clientQuery.eq('email', identifier.value);
    } else {
      clientQuery = clientQuery.eq('phone', identifier.value);
    }

    const { data: clients } = await clientQuery;
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
