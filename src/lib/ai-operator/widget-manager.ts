export interface CockpitWidgetConfig {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  status: 'good' | 'warn' | 'alert' | 'neutral';
  deepLink: string;
  isPinned: boolean;
  category: 'revenue' | 'growth' | 'sre' | 'support';
}

export const DEFAULT_COCKPIT_WIDGETS: CockpitWidgetConfig[] = [
  { id: 'mrr_tracker', label: 'Estimated MRR', value: '$168/mo', subValue: '2 Paid Accounts', status: 'good', deepLink: '/admin/money', isPinned: true, category: 'revenue' },
  { id: 'active_contractors', label: 'Contractors', value: '11 Total', subValue: '7 Stripe Connected', status: 'good', deepLink: '/admin/contractors', isPinned: true, category: 'growth' },
  { id: 'unactivated_signups', label: 'Pending Activation', value: '4 Signups', subValue: '0 Quotes Sent', status: 'warn', deepLink: '/admin/campaigns', isPinned: true, category: 'growth' },
  { id: 'webhook_sre', label: 'Webhooks', value: '2 Failures', subValue: 'Idempotent Replay Ready', status: 'warn', deepLink: '/admin/failures', isPinned: true, category: 'sre' },
  { id: 'sms_deliverability', label: 'SMS Carrier Health', value: '100%', subValue: '0 Dropped Sends', status: 'good', deepLink: '/admin/messaging', isPinned: true, category: 'sre' },
  { id: 'support_disputes', label: 'Support & Disputes', value: '100% SLA', subValue: '0 Open Disputes', status: 'good', deepLink: '/admin/cases', isPinned: true, category: 'support' },
];

/**
 * Returns customized or default pinned KPI widgets for the Operator Cockpit
 */
export function getPinnedCockpitWidgets(customOverrides?: CockpitWidgetConfig[]): CockpitWidgetConfig[] {
  if (customOverrides && customOverrides.length > 0) {
    return customOverrides.filter((w) => w.isPinned);
  }
  return DEFAULT_COCKPIT_WIDGETS.filter((w) => w.isPinned);
}
