import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoneyExact } from '@/lib/jobs';
import { todayDateKey } from '@/lib/recurring';
import { shortDate } from '@/lib/recurring-display';
import { buildRecurringView } from '@/lib/recurring-view';
import { RECURRING_VIEW_COOKIE, normalizeRecurringView } from '@/lib/dashboard-views';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import RecurringComposer from './RecurringComposer';
import RecurringViewGear from './RecurringViewGear';
import RecurringScreen, { type PlanActionsRenderer } from './RecurringScreen';
import EditPlanPanel from './EditPlanPanel';
import PlanActionsMenu from './PlanActionsMenu';
import {
  setPlanActiveAction,
  deletePlanAction,
  remindNextVisitAction,
  resendCardLinkAction,
  runPlanNowAction,
  setPlanAutopayAction,
  skipNextVisitAction,
  updatePlanAction,
} from './actions';

export const metadata = { title: 'Recurring' };

const FLASH_MESSAGES: Record<string, { tone: 'success' | 'info' | 'warn'; text: string }> = {
  created: { tone: 'success', text: 'Recurring plan created — the next visits are on your calendar already. Each one is invoiced on the day it happens, not before.' },
  'card-sent': { tone: 'success', text: 'Plan saved, the next visits are on your calendar, and a secure card-setup link was sent to your customer.' },
  'card-failed': { tone: 'warn', text: 'Plan saved and the visits are on your calendar, but the card link couldn’t be sent. Add an email or opted-in phone, then resend it.' },
  deleted: { tone: 'info', text: 'Recurring plan cancelled. Its upcoming visits were taken off the calendar; anything already worked or billed stays.' },
  'ran-paid': { tone: 'success', text: 'Visit created and the saved card was charged. Check the job and its payment to confirm.' },
  'ran-skipped': { tone: 'info', text: 'Visit created and the schedule advanced. Nothing was charged (auto-charge off or no card on file).' },
  'ran-failed': { tone: 'warn', text: 'Visit created, but the card charge didn’t go through — the customer was sent a pay link. See the job’s payment.' },
  'autopay-on': { tone: 'success', text: 'Autopay is on. The card already on file is charged on the day of each visit — nothing was charged now.' },
  'autopay-card-sent': { tone: 'success', text: 'Autopay is on and a secure card-setup link was sent to your customer. Visits bill nobody until they add a card, so the plan stays flagged until then.' },
  'autopay-card-failed': { tone: 'warn', text: 'Autopay is on, but the card link couldn’t be sent. Add an email or opted-in phone to the plan, then resend it — until a card lands these visits bill nobody.' },
  'autopay-off': { tone: 'info', text: 'Switched to manual billing. Visits still happen and still invoice; no card is charged automatically. Any card on file was kept.' },
  skipped: { tone: 'info', text: 'Visit skipped and taken off the calendar. The plan carries on from the next one, and a fixed term didn’t lose a visit.' },
  reminded: { tone: 'success', text: 'Reminder texted. Tonight’s automatic reminder for this visit won’t also go out.' },
  'reminded-email': { tone: 'success', text: 'Reminder emailed — they’re not opted in to texts. Tonight’s automatic reminder for this visit won’t also go out.' },
  'remind-nochannel': { tone: 'warn', text: 'No way to reach them: the visit has no email, and the phone on it isn’t opted in to texts. Add one to the job and try again.' },
  'remind-failed': { tone: 'warn', text: 'The reminder couldn’t be sent. Nothing reached the customer — check the job’s contact details and try again.' },
};

/**
 * Repeating jobs and auto-billing, for a signed-in owner.
 *
 * The read, the flash messages and the bound server actions. Everything drawn
 * from the book lives in RecurringScreen, which the demo renders too — see the
 * note there on why the per-plan actions are a render prop rather than shared.
 */
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: { flash?: string; job?: string; on?: string; then?: string; plan?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const mode = normalizeRecurringView(cookies().get(RECURRING_VIEW_COOKIE)?.value);
  const today = todayDateKey();

  const view = await buildRecurringView(supabase, accountId, today);

  const baseFlash = searchParams.flash ? FLASH_MESSAGES[searchParams.flash] : null;
  // A skip is about two specific days, and naming them is the difference between
  // "a visit was skipped" and knowing which one, and when they're next due.
  const flash =
    baseFlash && searchParams.flash === 'skipped' && searchParams.on && searchParams.then
      ? {
          ...baseFlash,
          text: `${shortDate(searchParams.on)} skipped and taken off the calendar — the next visit is ${shortDate(searchParams.then)}. A fixed term didn’t lose a visit.`,
        }
      : baseFlash;
  // Creating a visit early passes the created job id so we can link straight to it.
  const flashJobId = flash && searchParams.flash?.startsWith('ran-') ? searchParams.job ?? null : null;

  const planActions: PlanActionsRenderer = (plan, context) => ({
    resendLink: (
      <form action={resendCardLinkAction.bind(null, plan.id)}>
        <button type="submit" className="linklike">Resend link</button>
      </form>
    ),
    /* Hidden at $0 rather than offered and refused: the server rejects autopay
       without a price, and a button whose only outcome is an error is worse
       than no button. */
    autopayToggle: plan.auto_charge ? (
      <form action={setPlanAutopayAction.bind(null, plan.id, false)}>
        <button type="submit" className="linklike">Switch to manual billing</button>
      </form>
    ) : plan.amount > 0 ? (
      <ConfirmActionButton
        action={setPlanAutopayAction.bind(null, plan.id, true)}
        confirmMessage={
          plan.card_last4
            ? `Turn on autopay for ${plan.client_name}? The card already on file (•••• ${plan.card_last4}) is charged ${formatMoneyExact(plan.amount)} on the day of each visit from here on. Nothing is charged right now.`
            : `Turn on autopay for ${plan.client_name}? They get a secure link to add a card, and each visit then charges ${formatMoneyExact(plan.amount)} on the day it happens. Nothing is charged right now.`
        }
        className="linklike"
        pendingLabel="Turning on…"
        savedLabel="Autopay on ✓"
      >
        Turn on autopay
      </ConfirmActionButton>
    ) : null,
    controls: (
      <>
        {plan.active ? (
          <ConfirmActionButton
            action={runPlanNowAction.bind(null, plan.id)}
            confirmMessage={
              plan.auto_charge && plan.card_last4
                ? `Create this visit today instead of ${shortDate(plan.next_run_date)}, and charge the card on file (•••• ${plan.card_last4}) ${plan.amount > 0 ? formatMoneyExact(plan.amount) : ''}? The customer is billed immediately and the plan moves on to the visit after this one.`
                : `Create this visit today instead of ${shortDate(plan.next_run_date)}? The plan then moves on to the visit after this one.`
            }
            className="btn secondary"
            pendingLabel="Creating…"
            savedLabel="Created ✓"
          >
            {/* "Run next visit now" was engineer's language — a plan "runs" in a
                scheduler, not in a yard. What actually happens is a visit gets
                created early and the plan points at the one after, so the button
                says that, in the same words the confirmation dialog uses one
                click later. */}
            Create the next visit early
          </ConfirmActionButton>
        ) : null}
        <EditPlanPanel plan={plan} today={today} action={updatePlanAction.bind(null, plan.id)} />
        <form action={setPlanActiveAction.bind(null, plan.id, !plan.active)}>
          <button type="submit" className="btn secondary">{plan.active ? 'Pause' : 'Resume'}</button>
        </form>
        <PlanActionsMenu
          clientName={plan.client_name}
          nextVisitLabel={shortDate(plan.next_run_date)}
          nextVisitJobId={context?.nextVisitJobId ?? null}
          visitScheduledFor={context?.nextVisitScheduledFor ?? null}
          crew={view.roster}
          assignedCrewIds={context?.crewIds ?? []}
          active={plan.active}
          skipAction={skipNextVisitAction.bind(null, plan.id)}
          remindAction={remindNextVisitAction.bind(null, plan.id)}
        />
        <form action={deletePlanAction.bind(null, plan.id)} className="danger">
          <button type="submit" className="linklike danger">Cancel plan</button>
        </form>
      </>
    ),
  });

  return (
    <RecurringScreen
      view={view}
      mode={mode}
      planActions={planActions}
      composer={<RecurringComposer today={today} services={view.services} clients={view.clients} />}
      gear={<RecurringViewGear view={mode} />}
      attentionAction={
        view.noCardPlans.length === 1 ? (
          <form action={resendCardLinkAction.bind(null, view.noCardPlans[0]!.id)}>
            <button type="submit" className="btn secondary">Resend payment link</button>
          </form>
        ) : null
      }
      flash={flash}
      flashJobId={flashJobId}
      focusPlanId={searchParams.plan ?? null}
    />
  );
}
