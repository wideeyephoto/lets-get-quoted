import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminGoogleLsaOverview = Readonly<{
  totalSpendDollars: number;
  totalLeadsCount: number;
  activeConnectionsCount: number;
  activeWalletsCount: number;
  totalWalletBalanceDollars: number;
  connections: readonly {
    accountId: string;
    businessName: string | null;
    customerId: string | null;
    customerName: string | null;
    campaignMode: string | null;
    lastSyncAt: string | null;
  }[];
  recentSpend: readonly {
    accountId: string;
    periodStart: string;
    periodEnd: string;
    costDollars: number;
    spendSource: string | null;
  }[];
  recentLeads: readonly {
    accountId: string;
    googleLeadId: string;
    leadType: string | null;
    chargeStatus: string | null;
    createdAt: string;
  }[];
  wallets: readonly {
    accountId: string;
    businessName: string | null;
    status: string;
    balanceDollars: number;
    thresholdDollars: number;
    refillDollars: number;
  }[];
}>;

export async function loadAdminGoogleLsaOverview(
  admin: SupabaseClient,
): Promise<AdminGoogleLsaOverview> {
  const [connectionsRes, spendRes, leadsRes, sitesRes, accountsRes] = await Promise.all([
    admin
      .from('google_lsa_connections')
      .select('account_id, customer_id, customer_name, campaign_mode, last_sync_at')
      .order('last_sync_at', { ascending: false })
      .limit(50),
    admin
      .from('google_lsa_spend')
      .select('account_id, period_start, period_end, cost_dollars, spend_source')
      .order('period_start', { ascending: false })
      .limit(50),
    admin
      .from('google_lsa_leads')
      .select('account_id, google_lead_id, lead_type, charge_status, google_created_at')
      .order('google_created_at', { ascending: false })
      .limit(50),
    admin
      .from('sites')
      .select('account_id, content')
      .not('content->adCampaign', 'is', null),
    admin
      .from('accounts')
      .select('id, business_name'),
  ]);

  const nameMap = new Map<string, string>();
  for (const a of accountsRes.data ?? []) {
    const row = a as { id?: unknown; business_name?: unknown };
    if (row.id) nameMap.set(String(row.id), String(row.business_name || ''));
  }

  const connections = (connectionsRes.data ?? []).map((r: Record<string, unknown>) => ({
    accountId: String(r.account_id),
    businessName: nameMap.get(String(r.account_id)) ?? null,
    customerId: r.customer_id ? String(r.customer_id) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    campaignMode: r.campaign_mode ? String(r.campaign_mode) : null,
    lastSyncAt: r.last_sync_at ? String(r.last_sync_at) : null,
  }));

  const recentSpend = (spendRes.data ?? []).map((r: Record<string, unknown>) => ({
    accountId: String(r.account_id),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    costDollars: Number(r.cost_dollars ?? 0),
    spendSource: r.spend_source ? String(r.spend_source) : null,
  }));

  const recentLeads = (leadsRes.data ?? []).map((r: Record<string, unknown>) => ({
    accountId: String(r.account_id),
    googleLeadId: String(r.google_lead_id),
    leadType: r.lead_type ? String(r.lead_type) : null,
    chargeStatus: r.charge_status ? String(r.charge_status) : null,
    createdAt: String(r.google_created_at),
  }));

  const wallets: AdminGoogleLsaOverview['wallets'][number][] = [];
  let totalWalletBalanceCents = 0;

  for (const s of sitesRes.data ?? []) {
    const content = (s.content as Record<string, unknown>) || {};
    const adState = (content.adCampaign as Record<string, unknown>) || {};
    if (adState.fundingModel === 'auto_refill_wallet') {
      const balance = Number(adState.walletBalanceCents ?? 0);
      totalWalletBalanceCents += balance;
      wallets.push({
        accountId: String(s.account_id),
        businessName: nameMap.get(String(s.account_id)) ?? null,
        status: String(adState.status ?? 'active'),
        balanceDollars: balance / 100,
        thresholdDollars: Number(adState.refillThresholdCents ?? 0) / 100,
        refillDollars: Number(adState.refillAmountCents ?? 0) / 100,
      });
    }
  }

  const totalSpendDollars = recentSpend.reduce((acc, row) => acc + row.costDollars, 0);

  return {
    totalSpendDollars,
    totalLeadsCount: recentLeads.length,
    activeConnectionsCount: connections.length,
    activeWalletsCount: wallets.length,
    totalWalletBalanceDollars: totalWalletBalanceCents / 100,
    connections,
    recentSpend,
    recentLeads,
    wallets,
  };
}

export async function loadAccountGoogleLsa(
  admin: SupabaseClient,
  accountId: string,
): Promise<{
  connection: { customerId: string | null; customerName: string | null; lastSyncAt: string | null } | null;
  totalSpendDollars: number;
  leadsCount: number;
  wallet: { balanceDollars: number; thresholdDollars: number; refillDollars: number; status: string } | null;
}> {
  const [connRes, spendRes, leadsRes, siteRes] = await Promise.all([
    admin
      .from('google_lsa_connections')
      .select('customer_id, customer_name, last_sync_at')
      .eq('account_id', accountId)
      .maybeSingle(),
    admin
      .from('google_lsa_spend')
      .select('cost_dollars')
      .eq('account_id', accountId),
    admin
      .from('google_lsa_leads')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    admin
      .from('sites')
      .select('content')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const connData = connRes.data as Record<string, unknown> | null;
  const connection = connData
    ? {
        customerId: connData.customer_id ? String(connData.customer_id) : null,
        customerName: connData.customer_name ? String(connData.customer_name) : null,
        lastSyncAt: connData.last_sync_at ? String(connData.last_sync_at) : null,
      }
    : null;

  const totalSpendDollars = (spendRes.data ?? []).reduce(
    (sum, row: Record<string, unknown>) => sum + Number(row.cost_dollars ?? 0),
    0,
  );

  let wallet: { balanceDollars: number; thresholdDollars: number; refillDollars: number; status: string } | null = null;
  if (siteRes.data) {
    const content = (siteRes.data.content as Record<string, unknown>) || {};
    const adState = (content.adCampaign as Record<string, unknown>) || {};
    if (adState.fundingModel === 'auto_refill_wallet') {
      wallet = {
        balanceDollars: Number(adState.walletBalanceCents ?? 0) / 100,
        thresholdDollars: Number(adState.refillThresholdCents ?? 0) / 100,
        refillDollars: Number(adState.refillAmountCents ?? 0) / 100,
        status: String(adState.status ?? 'active'),
      };
    }
  }

  return {
    connection,
    totalSpendDollars,
    leadsCount: Number(leadsRes.count ?? 0),
    wallet,
  };
}
