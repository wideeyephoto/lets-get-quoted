import type { AutomationKey } from '@/lib/automations';
import {
  appointmentReminderText,
  arrivalTimeChangedText,
  buildArrivalMessage,
  campaignText,
  cardSetupText,
  choiceReminderText,
  cardUpdateText,
  clientJobDashboardText,
  composeOfferMessage,
  crewAssignmentText,
  crewScheduleSelectedText,
  inboxReplyText,
  jobUpdateText,
  leadDeclineText,
  leadQuoteVisitOptionsText,
  leadQuoteVisitText,
  missedCallTextBack,
  ownerHighValueLeadText,
  paymentText,
  quickStopConfirmedText,
  quickStopOfferText,
  quoteFollowupText,
  rebookInviteText,
  reviewRequestText,
  schedulingOptionsText,
  selectionRequestText,
  verificationCodeText,
  withOptOut,
} from '@/lib/sms-templates';

/**
 * Every text message this app can send, in one list, with the real words.
 *
 * WHAT THIS IS FOR. A contractor's phone number sends all of these under their
 * name, and until now there was nowhere to read them. You could find out what
 * an automation says by turning it on and waiting for it to fire at a customer.
 *
 * WHY THE BODIES ARE BUILT AND NOT TYPED. Every `body` below is the output of
 * the same builder the sender calls, given sample data. Nothing here is a
 * transcription, because transcriptions of these messages have drifted twice
 * already — see the note at the top of sms-templates.ts. Change a message and
 * this page changes with it; there is no second copy to forget.
 *
 * The sample data is deliberately one business and one customer throughout, so
 * reading down the list feels like reading one thread rather than thirty
 * unrelated examples.
 */

const SAMPLE = {
  business: 'Evergreen Lawn & Landscape',
  client: 'Karen Whitfield',
  first: 'Karen',
  crew: 'Mike Torres',
  jobRef: 'J-1009',
  address: '1418 Maplewood Ave, Royal Oak, MI',
  link: 'lgq.co/x7Kp2',
} as const;

/** Who the phone belongs to. Not everything here goes to a customer. */
export type SmsAudience = 'customer' | 'lead' | 'owner' | 'crew';

/**
 * Whether the owner can switch it off, and where.
 *
 * `automation` rows are the ones on the Automations tab. `manual` means it only
 * ever sends because somebody pressed something. `always` means it is part of a
 * flow the customer started — a payment receipt, a verification code — and
 * there is nothing to turn off without breaking the thing they asked for.
 */
export type SmsControl =
  | { kind: 'automation'; key: AutomationKey; label: string }
  | { kind: 'manual'; label: string }
  | { kind: 'always'; label: string };

export type SmsCatalogueEntry = {
  id: string;
  /** What this message is, in the owner's words. */
  title: string;
  /** The moment it sends. Written as a trigger, not a description. */
  trigger: string;
  audience: SmsAudience;
  control: SmsControl;
  /**
   * True when the words are the owner's and this app only supplies the
   * envelope — the sender's name and the opt-out line. Worth showing: "we wrote
   * this" and "we addressed this" are different promises.
   */
  ownerAuthored?: boolean;
  /** The real string, from the real builder. */
  body: string;
};

const automation = (key: AutomationKey, label: string): SmsControl => ({ kind: 'automation', key, label });
const manual = (label: string): SmsControl => ({ kind: 'manual', label });
const always = (label: string): SmsControl => ({ kind: 'always', label });

export const SMS_CATALOGUE: SmsCatalogueEntry[] = [
  // -- a lead arrives --------------------------------------------------------
  {
    id: 'verification-code',
    title: 'Phone verification code',
    trigger: 'A visitor enters their number on your intake form',
    audience: 'lead',
    control: always('Part of intake — no code, no lead'),
    body: verificationCodeText({ businessName: SAMPLE.business, code: '481920' }),
  },
  {
    id: 'missed-call',
    title: 'Missed-call text-back',
    trigger: 'Someone rings your tracked number and you do not pick up',
    audience: 'lead',
    control: automation('missed-call', 'Missed-call text-back'),
    body: missedCallTextBack(SAMPLE.business),
  },
  {
    id: 'owner-high-value-lead',
    title: 'High-value lead alert',
    trigger: 'A lead lands that the AI estimator scores as big',
    audience: 'owner',
    control: always('Goes to your own mobile'),
    body: ownerHighValueLeadText({
      businessName: SAMPLE.business,
      leadName: SAMPLE.client,
      estimate: { min: 2200, max: 3800 },
      dashboardUrl: SAMPLE.link,
    }),
  },
  {
    id: 'lead-decline',
    title: 'Polite decline',
    trigger: 'You turn a lead down from the lead page',
    audience: 'lead',
    control: manual('One tap on the lead'),
    body: leadDeclineText({
      leadName: SAMPLE.first,
      businessName: SAMPLE.business,
      reason: 'that job is outside the area we cover',
    }),
  },

  // -- booking the estimate --------------------------------------------------
  {
    id: 'lead-quote-visit-options',
    title: 'Three estimate times',
    trigger: 'You send times from the lead page calendar',
    audience: 'lead',
    control: manual('You pick the times and send'),
    body: leadQuoteVisitOptionsText({
      businessName: SAMPLE.business,
      leadName: SAMPLE.first,
      address: SAMPLE.address,
      options: [
        { date: '2026-08-12', time: '09:00' },
        { date: '2026-08-13', time: '14:00' },
        { date: '2026-08-14', time: '11:00' },
      ],
    }),
  },
  {
    id: 'lead-quote-visit',
    title: 'Estimate booked',
    trigger: 'You book the estimate visit outright',
    audience: 'lead',
    control: manual('Sent when you book the visit'),
    body: leadQuoteVisitText({
      businessName: SAMPLE.business,
      leadName: SAMPLE.first,
      address: SAMPLE.address,
      scheduledFor: '2026-08-12',
      scheduledTime: '09:00',
    }),
  },
  {
    id: 'booking-decision',
    title: 'Booking confirmed or declined',
    trigger: 'You answer a request from your public booking page',
    audience: 'customer',
    control: automation('booking', 'Online booking'),
    ownerAuthored: true,
    body: withOptOut(`${SAMPLE.business} confirmed your appointment for Wed, Aug 12 at 9:00 AM.`),
  },

  // -- the quote -------------------------------------------------------------
  {
    id: 'client-job-dashboard',
    title: 'Your job link',
    trigger: 'You send the customer their own job page',
    audience: 'customer',
    control: manual('Sent with the quote'),
    body: clientJobDashboardText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      link: SAMPLE.link,
      includesScheduleOptions: true,
    }),
  },
  {
    id: 'quote-followup',
    title: 'Quote follow-up',
    trigger: 'A quote has sat unapproved for your follow-up window',
    audience: 'customer',
    control: automation('followups', 'Quote follow-ups'),
    body: quoteFollowupText({ businessName: SAMPLE.business, clientName: SAMPLE.first, url: SAMPLE.link }),
  },
  {
    id: 'scheduling-options',
    title: 'Three start dates',
    trigger: 'You text start dates from the job page',
    audience: 'customer',
    control: manual('You pick the dates and send'),
    body: schedulingOptionsText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      clientName: SAMPLE.first,
      link: SAMPLE.link,
    }),
  },
  {
    id: 'selection-request',
    title: 'Choices waiting',
    trigger: 'You share the choice board from the job',
    audience: 'customer',
    // Manual, not the automation. This is the contractor pressing "Send these
    // to them" — the scheduled chasing is the separate entry below, and listing
    // them as one thing was how the catalogue came to describe a text nobody
    // could turn off as though a switch controlled it.
    control: manual('You decide when the board is ready'),
    body: selectionRequestText({
      businessName: SAMPLE.business,
      clientName: SAMPLE.client,
      count: 3,
      overdue: false,
      url: SAMPLE.link,
    }),
  },
  {
    id: 'choice-reminder',
    title: 'Choice reminder',
    trigger: 'The needed-by date on a choice arrives, then again two days later',
    audience: 'customer',
    control: automation('selections', 'Choice reminders'),
    body: choiceReminderText({
      businessName: SAMPLE.business,
      clientName: SAMPLE.client,
      jobName: 'Back garden re-turf',
      titles: ['Patio tile', 'Kitchen faucet'],
      daysPastNeededBy: 0,
      url: SAMPLE.link,
    }),
  },

  // -- the day of the work ---------------------------------------------------
  {
    id: 'appointment-reminder',
    title: 'Day-before reminder',
    trigger: 'The evening before a scheduled job',
    audience: 'customer',
    control: automation('reminders', 'Appointment reminders'),
    body: appointmentReminderText({
      businessName: SAMPLE.business,
      clientName: SAMPLE.first,
      whenLabel: 'tomorrow at 9:00 AM',
      address: SAMPLE.address,
    }),
  },
  {
    id: 'arrival',
    title: 'On my way',
    trigger: 'A crew member starts the drive from the field app',
    audience: 'customer',
    control: automation('arrival', 'Arrival updates'),
    ownerAuthored: true,
    body: buildArrivalMessage({
      business: SAMPLE.business,
      template: null,
      crewName: SAMPLE.crew,
      customerName: SAMPLE.client,
      times: null,
      trackingUrl: SAMPLE.link,
      timeZone: 'America/Detroit',
    }),
  },
  {
    id: 'arrival-time-changed',
    title: 'New arrival window',
    trigger: 'You re-plan the day and choose to tell them',
    audience: 'customer',
    control: manual('Never automatic — you decide'),
    body: arrivalTimeChangedText({
      businessName: SAMPLE.business,
      clientName: SAMPLE.first,
      windowLabel: '7:10 AM to 9:10 AM',
    }),
  },
  {
    id: 'job-update',
    title: 'Job update',
    trigger: 'You post an update on the job',
    audience: 'customer',
    control: manual('Sent when you post'),
    ownerAuthored: true,
    body: jobUpdateText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      title: 'Drainage rough-in done',
      body: 'Sod goes down tomorrow morning.',
    }),
  },

  // -- the crew --------------------------------------------------------------
  {
    id: 'crew-assignment',
    title: 'Crew assigned',
    trigger: 'You put someone on a job',
    audience: 'crew',
    control: always('Sent to the crew member you assign'),
    body: crewAssignmentText({
      crewName: 'Mike',
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      clientName: SAMPLE.client,
      address: SAMPLE.address,
      scheduledFor: '2026-08-12',
      scheduledTime: '09:00',
    }),
  },
  {
    id: 'crew-scheduled',
    title: 'Crew job scheduled',
    trigger: 'A job a crew member is on gets a date',
    audience: 'crew',
    control: always('Sent to everyone on the job'),
    body: crewScheduleSelectedText({
      crewName: 'Mike',
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      clientName: SAMPLE.client,
      address: SAMPLE.address,
      scheduledFor: '2026-08-12',
      scheduledTime: '09:00',
    }),
  },

  // -- Quick Stop ------------------------------------------------------------
  {
    id: 'quick-stop-offer',
    title: 'Quick Stop offer',
    trigger: 'You offer a same-day slot and set the fee',
    audience: 'customer',
    control: automation('extra-stop', 'Quick Stop'),
    body: quickStopOfferText({
      businessName: SAMPLE.business,
      whenLabel: 'today between 2 and 4 PM',
      feeLabel: '$85',
      payUrl: SAMPLE.link,
      minutes: 15,
    }),
  },
  {
    id: 'quick-stop-confirmed',
    title: 'Quick Stop confirmed',
    trigger: 'Their payment clears',
    audience: 'customer',
    control: automation('extra-stop', 'Quick Stop'),
    body: quickStopConfirmedText({
      businessName: SAMPLE.business,
      whenLabel: 'today between 2 and 4 PM',
      statusUrl: SAMPLE.link,
    }),
  },
  {
    id: 'quick-stop-status',
    title: 'Quick Stop status',
    trigger: 'En route, arrived, cancelled or refunded',
    audience: 'customer',
    control: automation('extra-stop', 'Quick Stop'),
    body: withOptOut(`${SAMPLE.business} is on the way to you now.`),
  },
  {
    id: 'estimate-offer',
    title: 'Gap in today’s route',
    trigger: 'You offer an unfilled slot to a waiting lead',
    audience: 'lead',
    control: manual('You write it and approve it'),
    ownerAuthored: true,
    body: composeOfferMessage(SAMPLE.business, 'We had a cancellation and could look at your patio today.'),
  },
  {
    id: 'owner-estimate-accepted',
    title: 'They said yes',
    trigger: 'A lead replies YES to an offer',
    audience: 'owner',
    control: always('Goes to your own mobile'),
    body: withOptOut(`${SAMPLE.client} accepted your 2-4 PM offer.`),
  },

  // -- money -----------------------------------------------------------------
  {
    id: 'payment-requested',
    title: 'Payment request',
    trigger: 'You request a deposit, a stage payment or the balance',
    audience: 'customer',
    control: manual('Sent when you request it'),
    body: paymentText({ contractor: SAMPLE.business, label: 'deposit', amount: 1200, link: SAMPLE.link, eventType: 'payment_requested' }),
  },
  {
    id: 'payment-paid',
    title: 'Payment received',
    trigger: 'Their payment clears',
    audience: 'customer',
    control: always('Receipt for a payment they made'),
    body: paymentText({ contractor: SAMPLE.business, label: 'deposit', amount: 1200, link: SAMPLE.link, eventType: 'payment_paid' }),
  },
  {
    id: 'payment-failed',
    title: 'Payment failed',
    trigger: 'Their payment is declined',
    audience: 'customer',
    control: always('They need to know it did not go through'),
    body: paymentText({ contractor: SAMPLE.business, label: 'deposit', amount: 1200, link: SAMPLE.link, eventType: 'payment_failed' }),
  },
  {
    id: 'payment-refunded',
    title: 'Refund processed',
    trigger: 'You refund them',
    audience: 'customer',
    control: always('Receipt for a refund you sent'),
    body: paymentText({ contractor: SAMPLE.business, label: 'deposit', amount: 1200, link: SAMPLE.link, eventType: 'payment_refunded' }),
  },
  {
    id: 'card-setup',
    title: 'Save a card',
    trigger: 'You put a customer on a recurring plan',
    audience: 'customer',
    control: manual('Sent when you set the plan up'),
    body: cardSetupText({ businessName: SAMPLE.business, url: SAMPLE.link }),
  },
  {
    id: 'card-update',
    title: 'Card declined',
    trigger: 'A saved card fails on a recurring charge',
    audience: 'customer',
    control: always('Their service stops without it'),
    body: cardUpdateText({ businessName: SAMPLE.business, url: SAMPLE.link }),
  },

  // -- after the work --------------------------------------------------------
  {
    id: 'review-request',
    title: 'Review request',
    trigger: 'You mark a job complete with the review pill on',
    audience: 'customer',
    control: automation('reviews', 'Review requests'),
    body: reviewRequestText({ businessName: SAMPLE.business, clientName: SAMPLE.first, reviewUrl: SAMPLE.link }),
  },
  {
    id: 'rebook-invite',
    title: 'Book again',
    trigger: 'You send a past customer a nudge from Rebook',
    audience: 'customer',
    control: manual('You choose who and when'),
    body: rebookInviteText({ businessName: SAMPLE.business, clientName: SAMPLE.first, url: SAMPLE.link }),
  },
  {
    id: 'campaign',
    title: 'Campaign blast',
    trigger: 'You send a one-off offer to a list',
    audience: 'customer',
    control: manual('You write it and choose the list'),
    ownerAuthored: true,
    body: campaignText({ businessName: SAMPLE.business, body: 'Booking fall cleanups now — reply for a spot.' }),
  },
  {
    id: 'inbox-reply',
    title: 'Your reply',
    trigger: 'You reply to a customer from the inbox',
    audience: 'customer',
    control: manual('You type it'),
    ownerAuthored: true,
    body: inboxReplyText({ businessName: SAMPLE.business, body: 'Yes — Thursday morning works, see you at 9.' }),
  },
];

/** Every sender this catalogue claims to cover, checked against lib/sms by test. */
export const CATALOGUE_SENDERS = [
  'sendAppointmentReminderSms',
  'sendArrivalSms',
  'sendArrivalTimeChangedSms',
  'sendBookingDecisionSms',
  'sendCampaignSms',
  'sendCardSetupSms',
  'sendCardUpdateSms',
  'sendClientJobDashboardSms',
  'sendCrewAssignmentSms',
  'sendCrewScheduleSelectedSms',
  'sendEstimateOfferSms',
  'sendInboxReplySms',
  'sendJobUpdateSms',
  'sendLeadDeclineSms',
  'sendLeadQuoteVisitOptionsSms',
  'sendLeadQuoteVisitSms',
  'sendMissedCallTextBack',
  'sendOwnerEstimateAcceptedSms',
  'sendOwnerHighValueLeadSms',
  'sendPaymentSmsEvent',
  'sendQuickStopConfirmedSms',
  'sendQuickStopOfferSms',
  'sendQuickStopStatusSms',
  'sendQuoteFollowupSms',
  'sendRebookInviteSms',
  'sendReviewRequestSms',
  'sendSchedulingOptionsSms',
  'sendSelectionRequestSms',
  'sendVerificationCodeSms',
] as const;

export const AUDIENCE_LABEL: Record<SmsAudience, string> = {
  customer: 'Customer',
  lead: 'Lead',
  owner: 'You',
  crew: 'Crew',
};
