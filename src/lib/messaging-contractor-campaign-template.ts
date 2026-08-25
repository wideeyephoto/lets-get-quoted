/**
 * Standard non-marketing contractor Customer Operations 10DLC campaign template.
 *
 * This module defines the canonical, carrier-vetted Campaign Registry (TCR)
 * template for local trade contractors operating on Let's Get Quoted.
 *
 * All contractor campaigns are strictly operational and non-marketing:
 * - Customer care and quote delivery
 * - Appointment scheduling, dispatch, and arrival notices
 * - Inbound homeowner inquiry replies
 * - Job completion and invoice delivery
 * - 2FA verification (where applicable)
 *
 * No promotional blasts, marketing campaigns, or purchased list messaging are
 * allowed or registered under this template.
 */

export type ContractorCampaignTemplateInput = Readonly<{
  legalBusinessName: string;
  dbaName?: string | null;
  websiteUrl: string;
  supportEmail: string;
  supportPhone: string;
}>;

export type StandardContractorCampaignPayload = Readonly<{
  useCase: 'CUSTOMER_CARE' | 'ACCOUNT_NOTIFICATION' | '2FA' | 'MIXED';
  vertical: 'CONSTRUCTION' | 'HOME_SERVICES' | 'REAL_ESTATE' | 'PROFESSIONAL';
  description: string;
  optInDescription: string;
  optInMessage: string;
  optOutMessage: string;
  helpMessage: string;
  sampleMessages: readonly string[];
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhone: boolean;
  ageGated: boolean;
  directLending: boolean;
  subscriberOptIn: boolean;
  subscriberOptOut: boolean;
  subscriberHelp: boolean;
}>;

/** Get the effective customer-facing brand name. */
export function effectiveBrandName(input: Pick<ContractorCampaignTemplateInput, 'legalBusinessName' | 'dbaName'>): string {
  const dba = (input.dbaName ?? '').trim();
  if (dba.length > 0) return dba;
  return input.legalBusinessName.trim();
}

/**
 * Generate the standard, carrier-compliant TCR Campaign description.
 */
export function generateContractorCampaignDescription(input: ContractorCampaignTemplateInput): string {
  const brand = effectiveBrandName(input);
  const website = input.websiteUrl.trim();

  return (
    `This campaign is used by ${brand} (${website}) to send transactional and conversational `
    + `customer-care messages to homeowners and commercial clients who have requested quotes, estimates, `
    + `or trade services. Message types include quote confirmations and links, estimate scheduling reminders, `
    + `technician dispatch and arrival updates, two-way replies to customer project inquiries, and invoice notifications. `
    + `Messages are sent strictly to consented customers; no marketing, advertising, or unsolicited promotional messages are sent.`
  );
}

/**
 * Generate the standard TCR Opt-In description explaining the consent flow.
 */
export function generateContractorOptInDescription(input: ContractorCampaignTemplateInput): string {
  const brand = effectiveBrandName(input);
  const website = input.websiteUrl.trim();

  return (
    `Customers opt in to receive SMS messages from ${brand} by submitting an online quote or service request `
    + `form on the business website (${website}), by signing a service agreement, or by initiating direct contact. `
    + `The web form displays a clear disclosure above the submit button stating: "By providing your phone number, `
    + `you agree to receive text messages from ${brand} regarding your quote, appointment, and service updates. `
    + `Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help." `
    + `Phone numbers and consent are collected directly and are never sold or shared with third parties.`
  );
}

/**
 * Generate the standard carrier-compliant sample messages (5 representative operational examples).
 */
export function generateStandardContractorSampleMessages(input: ContractorCampaignTemplateInput): readonly string[] {
  const brand = effectiveBrandName(input);

  return Object.freeze([
    // Sample 1: Quote Delivery / Estimate Link
    `${brand}: Hi [Customer], here is the estimate you requested for your project: https://quote.example.com/q/12345. Reply STOP to opt out, HELP for help.`,
    // Sample 2: Appointment / Schedule Confirmation
    `${brand}: Hi [Customer], your appointment is confirmed for Tuesday at 10:00 AM. Reply STOP to cancel or opt out.`,
    // Sample 3: Technician Dispatch & Arrival Notice
    `${brand}: Hi [Customer], our technician is on the way to your location and expects to arrive in 25 minutes. Reply STOP to opt out.`,
    // Sample 4: Direct 2-Way Conversational Reply
    `${brand}: Hi [Customer], thanks for reaching out. We received your note about the project specifications and can stop by tomorrow to review. Reply STOP to opt out.`,
    // Sample 5: Job Completion & Invoice Delivery
    `${brand}: Hi [Customer], your service has been completed! You can review your invoice here: https://quote.example.com/inv/12345. Reply STOP to opt out.`,
  ]);
}

/**
 * Generate standard HELP message.
 */
export function generateContractorHelpMessage(input: ContractorCampaignTemplateInput): string {
  const brand = effectiveBrandName(input);
  const email = input.supportEmail.trim();
  const phone = input.supportPhone.trim();

  return `${brand} Support: For help, email ${email} or call ${phone}. Msg&data rates may apply. Msg freq varies. Reply STOP to opt out.`;
}

/**
 * Generate standard STOP opt-out acknowledgement message.
 */
export function generateContractorOptOutMessage(input: ContractorCampaignTemplateInput): string {
  const brand = effectiveBrandName(input);
  return `${brand}: You have successfully unsubscribed and will receive no further text messages. Reply UNSTOP to resume.`;
}

/**
 * Assemble the complete standard campaign registration payload for a contractor.
 */
export function buildStandardContractorCampaignPayload(
  input: ContractorCampaignTemplateInput,
): StandardContractorCampaignPayload {
  const description = generateContractorCampaignDescription(input);
  const optInDescription = generateContractorOptInDescription(input);
  const sampleMessages = generateStandardContractorSampleMessages(input);
  const helpMessage = generateContractorHelpMessage(input);
  const optOutMessage = generateContractorOptOutMessage(input);
  const brand = effectiveBrandName(input);

  const optInMessage = (
    `${brand}: Welcome! You are now subscribed to service and quote updates. `
    + `Msg&data rates may apply. Reply HELP for help, STOP to cancel.`
  );

  return {
    useCase: 'CUSTOMER_CARE',
    vertical: 'HOME_SERVICES',
    description,
    optInDescription,
    optInMessage,
    optOutMessage,
    helpMessage,
    sampleMessages,
    hasEmbeddedLinks: true,
    hasEmbeddedPhone: false,
    ageGated: false,
    directLending: false,
    subscriberOptIn: true,
    subscriberOptOut: true,
    subscriberHelp: true,
  };
}
