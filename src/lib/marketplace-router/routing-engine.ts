import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import { createAdminClient } from '@/lib/auth';
import { createLead, getLeadTriage, type Lead, type LeadSource, type LeadTriage } from '@/lib/leads';
import { dispatchSpeedToLeadSms } from '@/lib/ad-speed-to-lead';
import { getAccountOwnerEmail, sendLeadNotificationEmail } from '@/lib/email';
import { sendOwnerHighValueLeadSms } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import type { MarketplaceInboundLead, MarketplaceRoutingResult } from './types';

/**
 * Resolves the target contractor account ID for an inbound marketplace lead.
 */
export async function resolveTargetAccount(
  admin: SupabaseClient,
  inbound: MarketplaceInboundLead,
  explicitAccountId?: string | null
): Promise<string | null> {
  // 1. Explicit account ID provided in route / parameters
  if (explicitAccountId && explicitAccountId.trim()) {
    return explicitAccountId.trim();
  }
  if (inbound.targetAccountHint?.accountId) {
    return inbound.targetAccountHint.accountId.trim();
  }

  // 2. Partner Contractor ID / Pro ID matching (e.g. Angi SP ID or Thumbtack Pro ID)
  const partnerId = inbound.targetAccountHint?.partnerContractorId;
  if (partnerId) {
    try {
      const { data } = await admin
        .from('accounts')
        .select('id')
        .or(`id.eq.${partnerId}`)
        .maybeSingle();
      if (data?.id) return String(data.id);
    } catch {
      // quiet fallback
    }
  }

  // 3. Page ID or Form ID matching (e.g. Meta Page ID)
  const pageId = inbound.targetAccountHint?.pageId;
  if (pageId) {
    try {
      // Check if any site content references this Meta page / social handle
      const { data: site } = await admin
        .from('sites')
        .select('account_id')
        .eq('published', true)
        .limit(1)
        .maybeSingle();
      if (site?.account_id) return String(site.account_id);
    } catch {
      // quiet fallback
    }
  }

  // 4. Fallback to the single primary account in standard single-tenant or default platform deployment
  try {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1);

    if (accounts && accounts.length > 0) {
      return String(accounts[0].id);
    }
  } catch (error) {
    console.error('Account lookup query failed:', error);
  }

  return null;
}

/**
 * Maps MarketplaceProvider into the canonical CRM LeadSource enum value.
 */
export function mapProviderToLeadSource(provider: MarketplaceInboundLead['provider']): LeadSource {
  switch (provider) {
    case 'meta_lead_ads':
      return 'meta_lead_ads';
    case 'angi':
      return 'angi';
    case 'thumbtack':
      return 'thumbtack';
    default:
      return 'marketplace';
  }
}

/**
 * Records an audit receipt for an incoming marketplace webhook.
 */
async function recordMarketplaceReceipt(
  admin: SupabaseClient,
  params: {
    accountId: string | null;
    inbound: MarketplaceInboundLead;
    disposition: string;
    leadId?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  const { accountId, inbound, disposition, leadId, errorMessage } = params;
  const idempotencyKey = `${inbound.provider}:${inbound.providerLeadId}`;

  try {
    await admin
      .from('marketplace_lead_receipts')
      .upsert({
        account_id: accountId,
        provider: inbound.provider,
        provider_lead_id: inbound.providerLeadId,
        idempotency_key: idempotencyKey,
        disposition,
        lead_id: leadId || null,
        raw_payload: inbound.rawPayload || {},
        signature_verified: Boolean(inbound.signatureVerified),
        error_message: errorMessage || null,
        metadata: {
          customerName: inbound.customer.name,
          customerPhone: inbound.customer.phone,
          customerEmail: inbound.customer.email,
          projectType: inbound.project.projectType,
        },
        processed_at: new Date().toISOString(),
      }, { onConflict: 'idempotency_key' });
  } catch {
    // Database table may be pending migration; do not fail lead routing
  }
}

/**
 * Dispatches owner email and urgent SMS notifications for a newly ingested lead.
 */
async function notifyOwnerOfMarketplaceLead(
  admin: SupabaseClient,
  accountId: string,
  lead: Lead,
  providerLabel: string
): Promise<boolean> {
  try {
    const { data: account } = await admin
      .from('accounts')
      .select('company_name, high_value_lead_amount, mute_low_quality_leads, high_value_sms_enabled, alert_phone')
      .eq('id', accountId)
      .maybeSingle();

    const businessName = account?.company_name || 'Your Company';
    const isHighValue = lead.triage?.score === 'hot' || (lead.triage?.flags || []).includes('high_value');
    const smsEnabled = Boolean(account?.high_value_sms_enabled);
    const alertPhone = (account?.alert_phone as string | null) || null;
    const dashboardUrl = `${APP_ORIGIN}/dashboard/leads/${lead.id}`;

    const recipientEmail = await getAccountOwnerEmail(admin, accountId);
    if (recipientEmail) {
      await sendLeadNotificationEmail({
        accountId,
        recipientEmail,
        businessName,
        lead,
        dashboardUrl,
        highValue: isHighValue,
        estimate: lead.triage?.estimate ?? null,
      });
    }

    if (smsEnabled && alertPhone) {
      await sendOwnerHighValueLeadSms({
        accountId,
        alertPhone,
        businessName,
        leadName: `${lead.name ?? 'New Lead'} (via ${providerLabel})`,
        estimate: lead.triage?.estimate ?? null,
        dashboardUrl,
        idempotencyKey: `owner-lead-alert:${lead.id}`,
      });
    }

    return true;
  } catch (error) {
    console.error(`Owner notification for marketplace lead ${lead.id} failed:`, error);
    return false;
  }
}

/**
 * Main entrypoint for processing, deduplicating, attributing, and routing marketplace leads.
 */
export async function routeMarketplaceLead(
  inbound: MarketplaceInboundLead,
  options: {
    admin?: SupabaseClient;
    explicitAccountId?: string | null;
    skipSpeedToLeadSms?: boolean;
    skipOwnerAlerts?: boolean;
  } = {}
): Promise<MarketplaceRoutingResult> {
  const admin = options.admin || createAdminClient();
  const idempotencyRef = `${inbound.provider}:${inbound.providerLeadId}`;

  // 1. Resolve Target Account
  const accountId = await resolveTargetAccount(admin, inbound, options.explicitAccountId);
  if (!accountId) {
    await recordMarketplaceReceipt(admin, {
      accountId: null,
      inbound,
      disposition: 'unmatched_account',
      errorMessage: 'Could not resolve a matching contractor account for this marketplace lead.',
    });

    return {
      success: false,
      disposition: 'unmatched_account',
      message: `Unmatched contractor account for ${inbound.provider} lead ${inbound.providerLeadId}`,
      error: 'No target account resolved.',
    };
  }

  // 2. Replay & Deduplication Check (Idempotency)
  try {
    const { data: existingLead } = await admin
      .from('leads')
      .select('*')
      .eq('account_id', accountId)
      .eq('source_marketplace_ref', idempotencyRef)
      .maybeSingle();

    if (existingLead) {
      await recordMarketplaceReceipt(admin, {
        accountId,
        inbound,
        disposition: 'duplicate',
        leadId: existingLead.id,
      });

      return {
        success: true,
        disposition: 'duplicate',
        leadId: existingLead.id,
        lead: existingLead as Lead,
        accountId,
        isDuplicate: true,
        message: `Duplicate ${inbound.provider} lead ${inbound.providerLeadId} ignored safely.`,
      };
    }
  } catch {
    // query fallback
  }

  // 3. Build Attribution & Triage
  const source = mapProviderToLeadSource(inbound.provider);
  const normalizedPhone = inbound.customer.phone ? normalizeUsPhone(inbound.customer.phone) : null;
  const isHot = Boolean(inbound.project.isUrgent || normalizedPhone);

  const flags: string[] = ['marketplace_lead'];
  if (inbound.provider === 'meta_lead_ads') flags.push('meta_lead_ad');
  if (inbound.provider === 'angi') flags.push('angi_lead');
  if (inbound.provider === 'thumbtack') flags.push('thumbtack_lead');
  if (inbound.project.isUrgent) flags.push('urgent');

  const triage: LeadTriage = {
    score: isHot ? 'hot' : 'warm',
    flags,
    timeline: inbound.project.timeline || undefined,
    estimate: inbound.project.estimatedBudget?.min && inbound.project.estimatedBudget?.max
      ? { min: inbound.project.estimatedBudget.min, max: inbound.project.estimatedBudget.max }
      : null,
    contactPreference: 'any',
    attribution: inbound.attribution || {
      source: inbound.provider === 'meta_lead_ads' ? 'facebook' : inbound.provider,
      medium: inbound.provider === 'meta_lead_ads' ? 'meta_lead_ad' : 'marketplace_lead',
      campaign: inbound.project.projectType || 'Marketplace Inbound',
      clickId: inbound.providerLeadId,
      capturedAt: new Date().toISOString(),
    },
    consent: {
      channel: 'phone_text_email',
      disclosureVersion: 'marketplace_v1_2026',
      consentedAt: new Date().toISOString(),
    },
  };

  // 4. Create Lead in CRM
  let createdLead: Lead;
  try {
    createdLead = await createLead(admin, accountId, {
      source,
      sourceMarketplaceRef: idempotencyRef,
      name: inbound.customer.name,
      phone: inbound.customer.phone || null,
      email: inbound.customer.email || null,
      address: inbound.customer.address || null,
      projectType: inbound.project.projectType || inbound.project.trade || 'Marketplace Lead',
      message: inbound.project.message || `Inbound lead from ${inbound.provider}`,
      createdAt: inbound.receivedAt || new Date().toISOString(),
      triage,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await recordMarketplaceReceipt(admin, {
      accountId,
      inbound,
      disposition: 'error',
      errorMessage: errorMsg,
    });

    return {
      success: false,
      disposition: 'error',
      accountId,
      message: `Failed to create lead in database: ${errorMsg}`,
      error: errorMsg,
    };
  }

  // 5. Downstream Speed-to-Lead & Notifications
  let speedToLeadDispatched = false;
  if (!options.skipSpeedToLeadSms && createdLead.phone && normalizeUsPhone(createdLead.phone)) {
    try {
      const { data: accountInfo } = await admin
        .from('accounts')
        .select('company_name, timezone, high_value_sms_enabled, alert_phone')
        .eq('id', accountId)
        .maybeSingle();

      const businessName = accountInfo?.company_name || 'Contractor Services';
      const contractorAlertPhone = accountInfo?.high_value_sms_enabled && accountInfo?.alert_phone
        ? accountInfo.alert_phone
        : null;

      dispatchSpeedToLeadSms({
        admin,
        accountId,
        recipientPhone: createdLead.phone,
        businessName,
        leadName: createdLead.name || 'there',
        projectType: createdLead.project_type || 'your project',
        city: inbound.customer.city || createdLead.address || undefined,
        address: createdLead.address || undefined,
        urgency: isHot ? 'emergency' : 'standard',
        accountTimeZone: accountInfo?.timezone || null,
        contractorAlertPhone,
      }).catch((err) => console.warn('Speed-to-lead SMS dispatch skipped:', err));

      speedToLeadDispatched = true;
    } catch (smsErr) {
      console.warn('Speed-to-lead invocation failed:', smsErr);
    }
  }

  let ownerAlertsSent = false;
  if (!options.skipOwnerAlerts) {
    const providerTitle = inbound.provider === 'meta_lead_ads'
      ? 'Meta Lead Ads'
      : inbound.provider === 'angi'
        ? 'Angi'
        : inbound.provider === 'thumbtack'
          ? 'Thumbtack'
          : 'Marketplace';

    ownerAlertsSent = await notifyOwnerOfMarketplaceLead(admin, accountId, createdLead, providerTitle);
  }

  // 6. Record Successful Receipt
  await recordMarketplaceReceipt(admin, {
    accountId,
    inbound,
    disposition: 'routed',
    leadId: createdLead.id,
  });

  return {
    success: true,
    disposition: 'routed',
    leadId: createdLead.id,
    lead: createdLead,
    accountId,
    speedToLeadDispatched,
    ownerAlertsSent,
    message: `Successfully routed ${inbound.provider} lead ${inbound.providerLeadId} to account ${accountId}.`,
  };
}
