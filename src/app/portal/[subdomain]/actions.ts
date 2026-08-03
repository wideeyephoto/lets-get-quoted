'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { sendClientPortalLinkEmail } from '@/lib/email';
import { issuePortalLink } from '@/lib/client-portal-data';
import { PORTAL_REQUEST_ACK } from '@/lib/client-portal';

/**
 * "Email me a link to my jobs."
 *
 * Returns THE SAME acknowledgement whether or not the email matched. A page that
 * says "no account found" is a page that tells a stranger which of their
 * neighbours used this contractor — and this form is public by definition.
 *
 * Rate limited on both the IP and the address: without the second one, somebody
 * can walk an address list from a pool of IPs and read the answer off the timing
 * of the response instead of its text.
 */
export async function requestPortalLinkAction(subdomain: string, formData: FormData): Promise<{ message: string }> {
  const admin = createAdminClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const ip = clientIpFrom(headers());

  // Always return the same words, even when refusing. Saying "too many
  // attempts" only for addresses that exist would leak the same fact.
  if (!(await checkRateLimit(admin, `portal:ip:${ip}`, 8, 60))) return { message: PORTAL_REQUEST_ACK };
  if (!email || !email.includes('@')) return { message: PORTAL_REQUEST_ACK };
  if (!(await checkRateLimit(admin, `portal:email:${email}`, 3, 900))) return { message: PORTAL_REQUEST_ACK };

  try {
    const site = await getPublicSiteBySubdomain(admin, subdomain);
    if (!site) return { message: PORTAL_REQUEST_ACK };

    const { data: account } = await admin
      .from('accounts')
      .select('client_portal_enabled, business_name')
      .eq('id', site.account_id)
      .maybeSingle();
    if (!account?.client_portal_enabled) return { message: PORTAL_REQUEST_ACK };

    const issued = await issuePortalLink(admin, site.account_id, email);
    if (issued) {
      const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
      await sendClientPortalLinkEmail({
        recipientEmail: email,
        businessName: site.company_name || account.business_name || 'your contractor',
        linkUrl: `${origin}/portal/view/${issued.token}`,
      });
    }
  } catch (error) {
    // Logged, never surfaced. An error message that only appears for real
    // addresses is the same leak wearing a different hat.
    console.error('Portal link request failed:', error instanceof Error ? error.message : error);
  }

  return { message: PORTAL_REQUEST_ACK };
}
