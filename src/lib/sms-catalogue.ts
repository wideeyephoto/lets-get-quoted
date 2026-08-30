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
  crewPhoneVerificationCodeText,
  crewScheduleSelectedText,
  crewWelcomeText,
  inboxReplyText,
  jobUpdateText,
  leadDeclineText,
  leadQuoteVisitOptionsText,
  leadQuoteVisitText,
  missedCallTextBack,
  ownerHighValueLeadText,
  ownerVerificationCodeText,
  ownerVoiceEmergencyAlertText,
  callerVoiceBookingLinkText,
  callerVoiceBookingConfirmationText,
  callerVoicePostCallFollowupText,
  paymentText,
  portalLinkText,
  quickStopConfirmedText,
  quickStopOfferText,
  quoteFollowupText,
  quoteUpdatedText,
  rebookInviteText,
  reviewRequestText,
  schedulingOptionsText,
  selectionRequestText,
  subcontractorCancelledText,
  subcontractorCoveredText,
  subcontractorWonText,
  verificationCodeText,
  withOptOut,
} from '@/lib/sms-templates';
// The offer's own builder lives with the dispatch rules rather than in
// sms-templates, for the same reason buildArrivalMessage does: its words depend
// on the request it belongs to. Imported here so this page shows the real
// string and not a retyped one.
import { LINK_PLACEHOLDER, draftOfferMessage } from '@/lib/subcontractor-dispatch';
import { generateSpeedToLeadSms } from '@/lib/ad-speed-to-lead';

/**
 * Every text message this app can send, in one list, with the real words.
 *
 * WHAT THIS IS FOR. These messages leave through three deliberately separate
 * sender lanes, and until now there was nowhere to read them together. You
 * could find out what an automation says only by turning it on and waiting.
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

export type SmsSenderLane = 'contractor_dedicated' | 'lgq_shared' | 'lgq_dispatch';

export function senderLaneForAudience(audience: SmsAudience): SmsSenderLane {
  if (audience === 'owner') return 'lgq_shared';
  if (audience === 'crew') return 'lgq_dispatch';
  return 'contractor_dedicated';
}

export const SENDER_LANE_LABEL: Record<SmsSenderLane, string> = {
  contractor_dedicated: 'Your dedicated number',
  lgq_shared: 'LGQ account-alert number',
  lgq_dispatch: 'LGQ dispatch number',
};

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
    id: 'owner-phone-verification',
    title: 'Owner mobile verification code',
    trigger: 'You set or change your mobile number in Texting Setup',
    audience: 'owner',
    control: always('One-time code to confirm your phone for alerts'),
    body: ownerVerificationCodeText({ code: '481920' }),
  },
  {
    id: 'crew-phone-verification',
    title: 'Crew member verification code',
    trigger: 'A crew member signs in or verifies their mobile for voice/field dispatch',
    audience: 'crew',
    control: always('One-time code to verify crew mobile access'),
    body: crewPhoneVerificationCodeText({ businessName: SAMPLE.business, code: '481920' }),
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
    id: 'portal-link',
    title: 'Your customer portal link',
    trigger: 'The customer asks for it by number on your website',
    audience: 'customer',
    control: always('Sent only when a customer requests it'),
    body: portalLinkText({ businessName: SAMPLE.business, link: SAMPLE.link }),
  },
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
    id: 'quote-updated',
    title: 'Updated quote',
    trigger: 'You change a quote the customer already has, and press Save & text',
    audience: 'customer',
    control: manual('Only when you press Save & text — plain Save sends nothing'),
    body: quoteUpdatedText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      link: SAMPLE.link,
      total: '$3,300.00',
      direction: 'up',
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
    id: 'crew-welcome',
    title: 'Crew member onboarding & field intake welcome',
    trigger: 'A new crew member or subcontractor is invited to the workspace',
    audience: 'crew',
    control: always('Triggered on crew onboarding'),
    body: crewWelcomeText({
      crewName: 'Mike',
      businessName: SAMPLE.business,
    }),
  },
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

  // -- subcontractor dispatch --------------------------------------------------
  //
  // Four messages, and only the first is the owner's own words. That is worth
  // reading here rather than discovering later: the OFFER is composed in the
  // request composer and previewed before it goes, so what an owner approves is
  // what a subcontractor receives verbatim. The other three are ours, and they
  // send themselves the moment somebody accepts — which is exactly why they
  // belong on this page, where an owner can read what goes out under their name
  // without having to run a dispatch to find out.
  {
    id: 'sub-offer',
    title: 'Subcontract job offer',
    trigger: 'You press send on a job request',
    audience: 'crew',
    control: manual('You choose the recipients and press send'),
    ownerAuthored: true,
    body: draftOfferMessage({
      businessName: SAMPLE.business,
      workDescription: 'Water heater replacement',
      generalLocation: 'Royal Oak',
      whenLabel: 'Friday 9–11 AM',
      payAmount: 650,
      expiresLabel: '6 PM',
    }).replace(LINK_PLACEHOLDER, SAMPLE.link),
  },
  {
    id: 'sub-offer-won',
    title: 'Subcontractor confirmed',
    trigger: 'A subcontractor accepts and the job is theirs',
    audience: 'crew',
    control: always('Part of accepting — it carries the address'),
    body: subcontractorWonText({
      businessName: SAMPLE.business,
      workDescription: 'water heater replacement',
      whenLabel: 'Friday 9–11 AM',
      link: SAMPLE.link,
    }),
  },
  {
    id: 'sub-offer-covered',
    title: 'Job covered by someone else',
    trigger: 'Another subcontractor accepted first',
    audience: 'crew',
    control: always('Sent to everyone who did not get it'),
    body: subcontractorCoveredText({
      businessName: SAMPLE.business,
      workDescription: 'water heater replacement',
      location: 'Royal Oak',
    }),
  },
  {
    id: 'sub-offer-cancelled',
    title: 'Subcontract offer withdrawn',
    trigger: 'You cancel a job request that is still open',
    audience: 'crew',
    control: manual('Only when you cancel the request'),
    body: subcontractorCancelledText({
      businessName: SAMPLE.business,
      workDescription: 'water heater replacement',
    }),
  },

  // -- Quick Stop ------------------------------------------------------------
  {
    id: 'quick-stop-offer',
    title: 'Quick Stop offer',
    trigger: 'You offer an arrival window and set the fee',
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
  {
    id: 'owner-voice-emergency-alert',
    title: 'Voice emergency alert',
    trigger: 'A caller reports an urgent hazard during an AI voice call',
    audience: 'owner',
    control: always('Urgent safety notification'),
    body: ownerVoiceEmergencyAlertText({
      businessName: SAMPLE.business,
      callerNumber: '(248) 555-0117',
      hazardSummary: 'Water main rupture in basement',
      dashboardUrl: SAMPLE.link,
    }),
  },
  {
    id: 'caller-voice-booking-link',
    title: 'Voice call booking link',
    trigger: 'Caller requests a booking or quote link during an AI voice call',
    audience: 'customer',
    control: always('Requested by caller'),
    body: callerVoiceBookingLinkText({
      businessName: SAMPLE.business,
      bookingUrl: SAMPLE.link,
    }),
  },
  {
    id: 'caller-voice-booking-confirmation',
    title: 'Voice call appointment confirmation',
    trigger: 'Caller schedules and reserves an appointment slot during an AI voice call',
    audience: 'customer',
    control: always('Triggered on live call reservation'),
    body: callerVoiceBookingConfirmationText({
      businessName: SAMPLE.business,
      whenLabel: 'Thursday, Aug 27 (Morning: 8 AM – 12 PM)',
      serviceAddress: '123 Main St, Royal Oak, MI',
    }),
  },
  {
    id: 'caller-voice-post-call-followup',
    title: 'Voice call follow-up summary',
    trigger: 'Automated post-call summary and next steps sent after an AI voice call completes',
    audience: 'customer',
    control: always('Triggered on voice call completion'),
    body: callerVoicePostCallFollowupText({
      businessName: SAMPLE.business,
      callerName: SAMPLE.first,
      scheduledTime: 'Thursday, Aug 27 at 9:00 AM',
      portalUrl: SAMPLE.link,
      issueSummary: 'Water heater maintenance and inspection',
    }),
  },
  {
    id: 'speed-to-lead',
    title: 'Ad lead instant response',
    trigger: 'Instant SMS response sent to paid advertising leads within 60 seconds of form submission',
    audience: 'lead',
    control: always('Triggered on paid ad lead intake'),
    body: generateSpeedToLeadSms({
      businessName: SAMPLE.business,
      leadName: SAMPLE.first,
      projectType: 'project request',
      city: 'Austin',
    }),
  },
];

/** Every sender this catalogue claims to cover, checked against lib/sms by test. */
export const CATALOGUE_SENDERS = [
  'sendAppointmentReminderSms',
  'sendArrivalSms',
  'sendArrivalTimeChangedSms',
  'sendBookingDecisionSms',
  'sendCallerVoiceBookingConfirmationSms',
  'sendCallerVoiceBookingLinkSms',
  'sendCallerVoicePostCallFollowupSms',
  'sendCampaignSms',
  'sendCardSetupSms',
  'sendCardUpdateSms',
  'sendClientJobDashboardSms',
  'sendClientPortalLinkSms',
  'sendCrewAssignmentSms',
  'sendCrewPhoneVerificationCodeSms',
  'sendCrewScheduleSelectedSms',
  'sendCrewWelcomeSms',
  'sendEstimateOfferSms',
  'sendInboxReplySms',
  'sendJobUpdateSms',
  'sendLeadDeclineSms',
  'sendLeadQuoteVisitOptionsSms',
  'sendLeadQuoteVisitSms',
  'sendMissedCallTextBack',
  'sendOwnerEstimateAcceptedSms',
  'sendOwnerHighValueLeadSms',
  'sendOwnerPhoneVerificationSms',
  'sendOwnerVoiceEmergencyAlertSms',
  'sendPaymentSmsEvent',
  'sendQuickStopConfirmedSms',
  'sendQuickStopOfferSms',
  'sendQuickStopStatusSms',
  'sendQuoteFollowupSms',
  'sendSpeedToLeadSms',
  // One sender, four messages: the offer, the confirmation, the covered notice
  // and the withdrawal. They differ by event_type in the sms_events ledger, and
  // all four are listed above.
  'sendSubcontractorSms',
  'sendQuoteUpdatedSms',
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
