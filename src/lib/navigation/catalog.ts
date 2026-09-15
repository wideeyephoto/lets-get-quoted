import { NavGroupDef, NavItemDef } from './types';
import { OFFICE_ROUTES } from '@/lib/office-access';

export const CATALOG_GROUPS: NavGroupDef[] = [
  { id: 'work', label: 'Work', accent: 'work' },
  { id: 'communication', label: 'Communication', accent: 'communication' },
  { id: 'business', label: 'Business', accent: 'business' },
  { id: 'growth', label: 'Growth', accent: 'growth' },
];

function canAccess(href: string) {
  return (context: { isOwner: boolean; capabilities: Set<string> }) => {
    if (context.isOwner) return true;
    const route = OFFICE_ROUTES.find(r => href === r.href || href.startsWith(r.href + '/'));
    if (!route) return false;
    return route.requires.every(cap => context.capabilities.has(cap));
  };
}

export const CATALOG_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: '/dashboard' },

  // WORK
  { id: 'leads', label: 'Leads', href: '/dashboard/leads', defaultGroupId: 'work', icon: '/dashboard/leads', hint: 'New & website leads', badgeSource: 'leads', isEligible: canAccess('/dashboard/leads') },
  { id: 'jobs', label: 'Jobs', href: '/dashboard/jobs', defaultGroupId: 'work', icon: '/dashboard/jobs', hint: 'Quotes · Invoices · Payments', badgeSource: 'jobs', isEligible: canAccess('/dashboard/jobs') },
  { id: 'jobs.priceBook', label: 'Price Book', href: '/dashboard/services', parentId: 'jobs', icon: '/dashboard/services', isEligible: canAccess('/dashboard/services') },
  { id: 'jobs.forms', label: 'Forms', href: '/dashboard/forms', parentId: 'jobs', icon: '/dashboard/forms', isEligible: canAccess('/dashboard/jobs') },
  { id: 'jobs.claims', label: 'Claims', href: '/dashboard/claims', parentId: 'jobs', icon: '/dashboard/claims', hint: 'Adjuster scopes, supplements & depreciation', isEligible: canAccess('/dashboard/jobs') },
  { id: 'jobs.memos', label: 'Voice / SMS memos', href: '/dashboard/text-to-job', parentId: 'jobs', icon: '/dashboard/text-to-job', badgeSource: 'text-to-job', isEligible: canAccess('/dashboard/text-to-job') },
  { id: 'schedule', label: 'Schedule', href: '/dashboard/schedule', defaultGroupId: 'work', icon: '/dashboard/schedule', hint: 'Calendar & unscheduled work', badgeSource: 'schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.calendar', label: 'Calendar', href: '/dashboard/schedule/calendar', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.planDay', label: 'Plan Day', href: '/dashboard/schedule/plan', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.dispatch', label: 'Dispatch', href: '/dashboard/schedule/dispatch', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.recurring', label: 'Recurring jobs', href: '/dashboard/recurring', parentId: 'schedule', icon: '/dashboard/recurring', hint: 'Repeating jobs & auto-billing', isEligible: canAccess('/dashboard/recurring') },
  { id: 'schedule.quickStops', label: 'Quick Stops', href: '/dashboard/quick-stops', parentId: 'schedule', icon: '/dashboard/quick-stops', badgeSource: 'quick-stops', isEligible: canAccess('/dashboard/quick-stops') },
  { id: 'schedule.booking', label: 'Online Booking', href: '/dashboard/schedule/booking', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.requests', label: 'Requests', href: '/dashboard/schedule/requests', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.waitlist', label: 'Waitlist', href: '/dashboard/schedule/waitlist', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.intake', label: 'Intake Channels', href: '/dashboard/schedule/intake', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'schedule.settings', label: 'Schedule settings', href: '/dashboard/schedule/settings', parentId: 'schedule', icon: '/dashboard/schedule', isEligible: canAccess('/dashboard/schedule') },
  { id: 'clients', label: 'Clients', href: '/dashboard/clients', defaultGroupId: 'work', icon: '/dashboard/clients', hint: 'Customer profiles & history', isEligible: canAccess('/dashboard/clients') },
  { id: 'clients.rebook', label: 'Rebook customers', href: '/dashboard/rebook', parentId: 'clients', icon: '/dashboard/rebook', isEligible: canAccess('/dashboard/rebook') },

  // COMMUNICATION
  { id: 'messages', label: 'Messages', href: '/dashboard/messages', defaultGroupId: 'communication', icon: '/dashboard/messages', hint: 'Two-way customer texts', badgeSource: 'messages', isEligible: canAccess('/dashboard/messages') },
  { id: 'voice', label: 'AI Voice Receptionist', href: '/dashboard/voice-calls', defaultGroupId: 'communication', icon: '/dashboard/voice-calls', isEligible: canAccess('/dashboard/voice-calls') },
  { id: 'voice.history', label: 'Call history', href: '/dashboard/voice-calls/history', parentId: 'voice', icon: '/dashboard/voice-calls', isEligible: canAccess('/dashboard/voice-calls') },
  { id: 'voice.settings', label: 'Receptionist settings', href: '/dashboard/voice-calls/settings', parentId: 'voice', icon: '/dashboard/voice-calls', isEligible: canAccess('/dashboard/voice-calls') },
  { id: 'automations', label: 'Automations', href: '/dashboard/automations', defaultGroupId: 'communication', icon: '/dashboard/automations', hint: 'The follow-ups, reminders and review asks that run without you', isEligible: canAccess('/dashboard/automations') },

  // BUSINESS
  { id: 'crew', label: 'Crew & Labor', href: '/dashboard/crew', defaultGroupId: 'business', icon: '/dashboard/crew', hint: 'Team roster, timecards & payroll export', isEligible: canAccess('/dashboard/crew') },
  { id: 'crew.team', label: 'Team', href: '/dashboard/crew?tab=people', parentId: 'crew', icon: '/dashboard/crew', isEligible: canAccess('/dashboard/crew') },
  { id: 'crew.timecards', label: 'Timecards & pay', href: '/dashboard/payroll', aliases: ['/dashboard/crew?tab=timecards'], parentId: 'crew', icon: '/dashboard/payroll', hint: 'Crew hours, pay calculation & payroll export', isEligible: canAccess('/dashboard/crew') },
  { id: 'crew.labor', label: 'Job labor', href: '/dashboard/crew/labor', parentId: 'crew', icon: '/dashboard/crew', isEligible: canAccess('/dashboard/crew') },
  { id: 'money', label: 'Money', href: '/dashboard/payments', defaultGroupId: 'business', icon: '/dashboard/payments', hint: 'Collected revenue, invoices, cash flow & expenses', isEligible: canAccess('/dashboard/payments') },
  { id: 'money.payments', label: 'Payments', href: '/dashboard/payments/transactions', parentId: 'money', icon: '/dashboard/payments', isEligible: canAccess('/dashboard/payments') },
  { id: 'money.cashFlow', label: 'Cash Flow', href: '/dashboard/cash-flow', parentId: 'money', icon: '/dashboard/cash-flow', isEligible: canAccess('/dashboard/cash-flow') },
  { id: 'money.expenses', label: 'Expenses', href: '/dashboard/expenses', parentId: 'money', icon: '/dashboard/expenses', isEligible: canAccess('/dashboard/expenses') },
  { id: 'money.insights', label: 'Insights', href: '/dashboard/insights', parentId: 'money', icon: '/dashboard/insights', isEligible: canAccess('/dashboard/insights') },
  { id: 'money.reports', label: 'Financial Reports', href: '/dashboard/reports', parentId: 'money', icon: '/dashboard/reports', hint: 'P&L, Schedule C & 1099 tax summaries', isEligible: canAccess('/dashboard/reports') },
  { id: 'inventory', label: 'Inventory', href: '/dashboard/inventory', defaultGroupId: 'business', icon: '/dashboard/inventory', hint: 'Truck tools, equipment & warehouse stock', isEligible: canAccess('/dashboard/inventory') },

  // GROWTH
  { id: 'website', label: 'Website', href: '/dashboard/sites', defaultGroupId: 'growth', icon: '/dashboard/sites', hint: 'Contractor website & online presence', isEligible: canAccess('/dashboard/sites') },
  { id: 'marketing', label: 'Marketing', href: '/dashboard/marketing', defaultGroupId: 'growth', icon: '/dashboard/marketing', hint: 'Overview, campaigns, paid ads, SEO & tracking', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.overview', label: 'Overview', href: '/dashboard/marketing/overview', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.emailText', label: 'Email & Text', href: '/dashboard/marketing/campaigns', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.paidAds', label: 'Paid Ads', href: '/dashboard/marketing/ads', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.blogSeo', label: 'Blog & SEO', href: '/dashboard/marketing/seo', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.tracking', label: 'Tracking', href: '/dashboard/marketing/tracking', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.results', label: 'Results', href: '/dashboard/marketing/results', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.merch', label: 'Merch Studio', href: '/dashboard/marketing/merch', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'marketing.referrals', label: 'Referrals', href: '/dashboard/marketing/referrals', parentId: 'marketing', icon: '/dashboard/marketing', isEligible: canAccess('/dashboard/marketing') },
  { id: 'reviews', label: 'Reviews', href: '/dashboard/reviews', defaultGroupId: 'growth', icon: '/dashboard/reviews', hint: 'Ratings & private feedback', isEligible: canAccess('/dashboard/reviews') },

  // UNGROUPED/UTILITIES
  { id: 'account', label: 'Account', href: '/dashboard/settings', icon: '/dashboard/settings', isEligible: canAccess('/dashboard/settings') },
  { id: 'help', label: 'Help', href: '/dashboard/help', icon: '/dashboard/help', hint: 'Ask us a question and track the answer', isEligible: canAccess('/dashboard/help') },
];
