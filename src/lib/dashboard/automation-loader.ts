import type { getAutomationActivity } from '@/lib/automation-activity';
import { ready, type AutomationItemHealth, type AutomationSummary, type Loadable } from '@/lib/dashboard-types';

export function buildAutomationSummary(input: {
  automation: Awaited<ReturnType<typeof getAutomationActivity>>;
  reviewsOn: boolean;
  followupsOn: boolean;
  remindersOn: boolean;
  dailyDigestOn: boolean;
  basePath?: string;
}): Loadable<AutomationSummary> {
  const { automation, reviewsOn, followupsOn, remindersOn, dailyDigestOn } = input;

  const items: AutomationItemHealth[] = [
    {
      id: 'reviews',
      name: 'Google review requests',
      enabled: reviewsOn,
      status: reviewsOn ? 'healthy' : 'off',
      lastRunAt: automation.recent.find((r) => r.kind === 'review_requested')?.at ?? null,
      recentCount30d: automation.reviewCount,
    },
    {
      id: 'followups',
      name: 'Quote follow-ups',
      enabled: followupsOn,
      status: followupsOn ? 'healthy' : 'off',
      lastRunAt: automation.recent.find((r) => r.kind === 'quote_followup')?.at ?? null,
      recentCount30d: automation.followupCount,
    },
    {
      id: 'reminders',
      name: 'Appointment reminders',
      enabled: remindersOn,
      status: remindersOn ? 'healthy' : 'off',
      lastRunAt: automation.recent.find((r) => r.kind === 'appointment_reminder')?.at ?? null,
      recentCount30d: automation.reminderCount,
    },
    {
      id: 'digest',
      name: 'Daily morning digest',
      enabled: dailyDigestOn,
      status: dailyDigestOn ? 'healthy' : 'off',
      lastRunAt: null,
      recentCount30d: 0,
    },
  ];

  const activeCount = items.filter((i) => i.enabled).length;

  return ready({
    items,
    activeCount,
    totalConfigured: items.length,
    actionableFailures: [],
    totalActions30d: automation.total,
  });
}
