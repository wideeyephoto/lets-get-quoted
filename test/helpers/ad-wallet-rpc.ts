// Stateful RPC double for adapter tests. Actual SQL locking, permissions and
// rollback behavior are exercised in marketing-flow-database.test.ts.
export function walletRpcFor(getAdmin: () => any) {
  const processed = new Set<string>();
  return async (name: string, args: any) => {
    if (name !== 'atomic_ad_wallet_credit_v2' && name !== 'set_meta_delivery_state' && name !== 'set_ad_lifecycle_state') return { data: null, error: { message: 'Unsupported RPC in fixture' } };
    const admin = getAdmin();
    const { data: site } = await admin.from('sites').select('id,content').eq('account_id', args.p_account_id).maybeSingle();
    if (!site) return { data: null, error: { message: 'Missing site' } };
    const state = { ...site.content?.adCampaign };
    if (name === 'set_ad_lifecycle_state') {
      const write = await admin.from('sites').update({ content: { ...site.content, adCampaign: { ...state, status: args.p_status, provisioningStatus: args.p_status } } }).eq('id', site.id);
      return { data: !write.error, error: write.error };
    }
    if (name === 'set_meta_delivery_state') {
      const write = await admin.from('sites').update({ content: { ...site.content, adCampaign: { ...state,
        metaProvisioningStatus: args.p_active ? 'active' : 'paused', status: args.p_active ? 'active' : 'pending_provisioning' } } }).eq('id', site.id);
      return { data: !write.error, error: write.error };
    }
    const previous = state.walletBalanceCents || 0;
    const replay = processed.has(args.p_payment_intent_id) || (state.processedRefillPaymentIntentIds || []).includes(args.p_payment_intent_id);
    if (replay) return { data: { success: true, already_credited: true, previous_balance_cents: previous, new_balance_cents: previous } };
    const next = { ...state, walletBalanceCents: previous + args.p_credit_cents, status: args.p_status,
      fundingModel: args.p_funding_model || state.fundingModel, monthlyBudgetCents: args.p_monthly_budget_cents || state.monthlyBudgetCents,
      weeklyBudgetCents: args.p_funding_model === 'weekly_drip' ? args.p_credit_cents : state.weeklyBudgetCents,
      landingPageUrl: args.p_landing_page_url || state.landingPageUrl, googleCampaignId: args.p_google_campaign_id || state.googleCampaignId,
      googleCampaignResource: args.p_google_campaign_resource || state.googleCampaignResource,
      provisioningStatus: args.p_provisioning_status || state.provisioningStatus, provisioningMessage: args.p_provisioning_message,
      lastRefillPaymentIntentId: args.p_payment_intent_id, pendingRefillIdempotencyKey: null,
      processedRefillPaymentIntentIds: [...(state.processedRefillPaymentIntentIds || []), args.p_payment_intent_id],
      totalDepositedCents: (state.totalDepositedCents || 0) + args.p_credit_cents,
      totalFeesCollectedCents: (state.totalFeesCollectedCents || 0) + args.p_fee_cents,
      ...Object.fromEntries(Object.entries(args.p_metadata || {}).filter(([, value]) => value !== undefined)),
    };
    const write = await admin.from('sites').update({ content: { ...site.content, adCampaign: next } }).eq('id', site.id);
    if (write.error) return { data: null, error: write.error };
    processed.add(args.p_payment_intent_id);
    return { data: { success: true, already_credited: false, previous_balance_cents: previous, new_balance_cents: next.walletBalanceCents }, error: null };
  };
}
