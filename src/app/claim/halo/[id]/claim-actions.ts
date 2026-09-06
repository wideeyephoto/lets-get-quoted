'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { createLead } from '@/lib/leads';
import { getHaloCampaignById } from '@/lib/neighborhood-halo-service';
import { sendSpeedToLeadSms, sendContractorAdLeadSms } from '@/lib/sms';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

export type ClaimFormState = {
  success: boolean;
  error?: string;
  voucherCode?: string;
};

export async function submitNeighborHaloClaimAction(
  prevState: ClaimFormState,
  formData: FormData
): Promise<ClaimFormState> {
  const admin = createAdminClient();

  let isAllowed = true;
  try {
    const ip = clientIpFrom(await headers());
    if (typeof admin?.rpc === 'function') {
      isAllowed = await checkRateLimitStrict(admin, `halo_claim:${ip}`, 10, 3600);
    }
  } catch {
    // Non-request context (e.g. test environment)
  }

  if (!isAllowed) {
    return { success: false, error: 'Too many claim attempts. Please try again later.' };
  }

  const campaignId = String(formData.get('campaignId') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  if (!campaignId) {
    return { success: false, error: 'Invalid campaign link.' };
  }
  if (!name) {
    return { success: false, error: 'Please enter your name.' };
  }
  if (!phone) {
    return { success: false, error: 'Please provide a valid phone number for SMS confirmation.' };
  }

  const campaign = await getHaloCampaignById(admin, campaignId);
  if (!campaign) {
    return { success: false, error: 'Neighborhood offer not found or has expired.' };
  }

  const accountId = campaign.accountId;

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name, phone').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = (site?.company_name as string | undefined) || account?.business_name || 'Our Team';
  const voucherCode = `NEIGHBOR-${campaign.streetName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-250`;

  // 1. Ingest Lead into CRM
  try {
    await createLead(admin, accountId, {
      name,
      phone,
      email: email || undefined,
      address: address || `${campaign.streetName}, ${campaign.city}`,
      source: 'neighborhood_halo',
      sourcePage: `/claim/halo/${campaignId}`,
      message: `[Neighborhood Halo Voucher: ${voucherCode}] Neighbor claimed group cluster discount around recent work on ${campaign.streetName}.${notes ? ` Notes: ${notes}` : ''}`,
      triage: {
        score: 'hot',
        flags: ['neighborhood_halo', 'neighbor_cluster_discount'],
        location: campaign.streetName,
      },
    });
  } catch (leadError) {
    console.error('Failed to create lead from halo claim:', leadError);
    return { success: false, error: 'Unable to register your offer. Please try again or call directly.' };
  }

  // 2. Increment leads_generated count
  await admin
    .from('neighborhood_halo_campaigns')
    .update({
      leads_generated: campaign.leadsGenerated + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  // 3. Instant Speed-to-Lead SMS to Homeowner (<60 seconds response)
  try {
    await sendSpeedToLeadSms({
      accountId,
      phone,
      businessName,
      body: `Hi ${name}! Thanks for claiming your neighbor group discount for ${campaign.streetName}. Your voucher code is ${voucherCode}. A team member from ${businessName} will contact you shortly to schedule your priority estimate!`,
      idempotencyKey: `halo_lead_claim_${campaignId}_${phone.replace(/[^0-9]/g, '')}`,
    });
  } catch (smsError) {
    console.warn('[NeighborhoodHalo] Speed-to-lead SMS to neighbor skipped:', smsError);
  }

  // 4. Instant Dispatch Alert to Contractor
  if (account?.phone) {
    try {
      await sendContractorAdLeadSms({
        accountId,
        phone: account.phone,
        body: `🔥 New Neighborhood Halo Lead! ${name} (${phone}) on/near ${campaign.streetName} claimed the $250 neighbor cluster discount. Open dashboard to view: /dashboard/leads`,
        idempotencyKey: `halo_contractor_alert_${campaignId}_${Date.now()}`,
      });
    } catch (ownerAlertErr) {
      console.warn('[NeighborhoodHalo] Contractor alert SMS skipped:', ownerAlertErr);
    }
  }

  return {
    success: true,
    voucherCode,
  };
}
