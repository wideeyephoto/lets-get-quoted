'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { sendClientPortalLinkEmail } from '@/lib/email';
import { sendClientPortalLinkSms } from '@/lib/sms';
import { portalLinkText } from '@/lib/sms-templates';
import { issuePortalLink } from '@/lib/client-portal-data';
import { parsePortalIdentifier, PORTAL_REQUEST_ACK } from '@/lib/client-portal';

/**
 * "Send me a link to my jobs" — by email OR by text.
 *
 * A contractor's customer list is not an email list. Plenty of homeowners are
 * in it by phone alone, added from a call or a text or an import that never had
 * an address, and an email-only door locks those people out of their own
 * history with no way in. One box takes whichever they have.
 *
 * Returns THE SAME acknowledgement in every case: matched, unmatched, rate
 * limited, opted out of texts, or malformed. A page that says "no account
 * found" is a page that tells a stranger which of their neighbours used this
 * contractor — and this form is public by definition.
 *
 * Rate limited on both the IP and the identifier. Without the second one,
 * somebody can walk a list from a pool of IPs and read the answer off the
 * timing of the response instead of its text. The identifier is normalized
 * first (lower-cased email, E.164 number) so that "Bob@x.com" and "bob@x.com",
 * or "248-555-0117" and "(248) 555 0117", cannot each buy their own three
 * attempts.
 */
export async function requestPortalLinkAction(subdomain: string, formData: FormData): Promise<{ message: string }> {
  const admin = createAdminClient();
  // One field. Asking somebody to classify their own contact details before
  // typing them is asking them to do the computer's job.
  const identifier = parsePortalIdentifier(String(formData.get('contact') ?? ''));
  const ip = clientIpFrom(await headers());

  // Always return the same words, even when refusing. Saying "too many
  // attempts" only for addresses that exist would leak the same fact.
  if (!(await checkRateLimit(admin, `portal:ip:${ip}`, 8, 60))) return { message: PORTAL_REQUEST_ACK };
  if (!identifier) return { message: PORTAL_REQUEST_ACK };
  if (!(await checkRateLimit(admin, `portal:id:${identifier.value}`, 3, 900))) return { message: PORTAL_REQUEST_ACK };

  try {
    const site = await getPublicSiteBySubdomain(admin, subdomain);
    if (!site) return { message: PORTAL_REQUEST_ACK };

    const { data: account } = await admin
      .from('accounts')
      .select('client_portal_enabled, business_name')
      .eq('id', site.account_id)
      .maybeSingle();
    if (!account?.client_portal_enabled) return { message: PORTAL_REQUEST_ACK };

    const issued = await issuePortalLink(admin, site.account_id, identifier);
    if (issued) {
      const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
      const businessName = site.company_name || account.business_name || 'your contractor';
      const linkUrl = `${origin}/portal/view/${issued.token}`;

      if (identifier.kind === 'email') {
        await sendClientPortalLinkEmail({
          recipientEmail: identifier.value,
          businessName,
          linkUrl,
          accountId: site.account_id,
        });
      } else {
        // The words live in lib/sms-templates with every other outgoing text,
        // never inline here: the catalogue a contractor reads to see what goes
        // out under their name BUILDS its examples from those functions, so a
        // message typed at the call site is one the catalogue would show wrong.
        await sendClientPortalLinkSms({
          accountId: site.account_id,
          toPhone: identifier.value,
          message: portalLinkText({ businessName, link: linkUrl }),
        });
      }
    }
  } catch (error) {
    // Logged, never surfaced. An error message that only appears for real
    // contacts is the same leak wearing a different hat.
    console.error('Portal link request failed:', error instanceof Error ? error.message : error);
  }

  return { message: PORTAL_REQUEST_ACK };
}
