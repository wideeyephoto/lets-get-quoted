/**
 * Transport and wire types for the Google Local Services Ads integration.
 *
 * Local Services lead rows deliberately do not contain a booking appointment,
 * campaign attribution, or a monetary lead cost. Google Ads API v25 does not
 * expose those values on `local_services_lead`; account/campaign spend is
 * fetched separately and remains aggregate data.
 */

export type GoogleLsaFetch = typeof fetch;

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  /** Seconds from the token response, normally 3,600. */
  accessExpiresIn: number;
  scope: string | null;
  tokenType: string;
};

export type GoogleAdsAuth = {
  accessToken: string;
  /** Manager account used to reach a client account. Omit for direct access. */
  loginCustomerId?: string | null;
  /** Defaults to GOOGLE_ADS_DEVELOPER_TOKEN. */
  developerToken?: string;
};

export type GoogleAdsCustomerRequest = GoogleAdsAuth & {
  customerId: string;
};

export type GoogleLsaLeadType =
  | 'BOOKING'
  | 'MESSAGE'
  | 'PHONE_CALL'
  | 'UNKNOWN'
  | 'UNSPECIFIED';

export type GoogleLsaLeadStatus =
  | 'ACTIVE'
  | 'BOOKED'
  | 'CONSUMER_DECLINED'
  | 'DECLINED'
  | 'DISABLED'
  | 'EXPIRED'
  | 'NEW'
  | 'WIPED_OUT'
  | 'UNKNOWN'
  | 'UNSPECIFIED';

export type GoogleLsaCreditState = 'CREDITED' | 'PENDING' | 'UNKNOWN' | 'UNSPECIFIED';

export type GoogleLsaContactDetails = {
  consumerName?: string;
  /** E.164; Google may return a tracking number instead of the consumer's number. */
  phoneNumber?: string;
  /** Present when a tracking number needs an extension to reach this consumer. */
  phoneNumberExtension?: string;
};

export type GoogleLsaLeadRow = {
  resourceName: string;
  id: string;
  categoryId: string | null;
  serviceId: string | null;
  contactDetails: GoogleLsaContactDetails | null;
  leadType: GoogleLsaLeadType;
  leadStatus: GoogleLsaLeadStatus;
  /** `YYYY-MM-DD HH:MM:SS` in the Google Ads customer's time zone. */
  creationDateTime: string;
  locale: string | null;
  leadCharged: boolean;
  creditState: GoogleLsaCreditState | null;
  /** Account-local `YYYY-MM-DD HH:MM:SS`, when a credit state has changed. */
  creditStateLastUpdateDateTime: string | null;
  leadFeedbackSubmitted: boolean;
  noteDescription: string | null;
  noteEditDateTime: string | null;
};

export type GoogleLsaConversationChannel =
  | 'ADS_API'
  | 'BOOKING'
  | 'EMAIL'
  | 'MESSAGE'
  | 'PHONE_CALL'
  | 'SMS'
  | 'WHATSAPP'
  | 'UNKNOWN'
  | 'UNSPECIFIED';

export type GoogleLsaParticipantType = 'ADVERTISER' | 'CONSUMER' | 'UNKNOWN' | 'UNSPECIFIED';

export type GoogleLsaConversationRow = {
  resourceName: string;
  id: string;
  leadResourceName: string;
  conversationChannel: GoogleLsaConversationChannel;
  participantType: GoogleLsaParticipantType;
  /** `YYYY-MM-DD HH:MM:SS` in the Google Ads customer's time zone. */
  eventDateTime: string;
  callDurationMillis: string | null;
  callRecordingUrl: string | null;
  messageText: string | null;
  attachmentUrls: string[];
};

export type GoogleLsaCampaignKind = 'legacy' | 'pmax';

export type GoogleLsaCampaign = {
  id: string;
  resourceName: string | null;
  name: string;
  status: string;
  advertisingChannelType: 'LOCAL_SERVICES' | 'PERFORMANCE_MAX';
  localServicesEnabled: boolean;
};

export type GoogleLsaCustomerCandidate = {
  customerId: string;
  descriptiveName: string;
  /** Alias used by the connection persistence layer. */
  customerName: string;
  currencyCode: string;
  timeZone: string;
  /** Directly accessible manager used in the login-customer-id header. */
  loginCustomerId: string | null;
  campaignKind: GoogleLsaCampaignKind;
  /** Alias used by the connection persistence layer. */
  campaignMode: GoogleLsaCampaignKind;
  /** Alias used by the connection persistence layer. */
  campaignId: string;
  campaign: GoogleLsaCampaign;
};

export type DiscoverGoogleLsaCustomersRequest = Pick<GoogleAdsAuth, 'accessToken' | 'developerToken'>;

export type ListGoogleLsaLeadsRequest = GoogleAdsCustomerRequest & {
  /** Inclusive account-local calendar bounds used for overlap/rescan windows. */
  startDate?: string;
  endDate?: string;
};

export type ListGoogleLsaConversationsRequest = GoogleAdsCustomerRequest & {
  /** Strongly recommended by Google because an unfiltered conversation query can be slow. */
  leadResourceName?: string;
  /** Inclusive account-local calendar bounds; permits one bounded bulk query instead of N+1 calls. */
  startDate?: string;
  endDate?: string;
};

export type GoogleLsaCalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type FetchLegacyLsaAccountReportRequest = {
  accessToken: string;
  managerCustomerId: string;
  customerId?: string;
  /** Inclusive calendar-date bounds sent verbatim to Local Services API. */
  startDate: string | GoogleLsaCalendarDate;
  endDate: string | GoogleLsaCalendarDate;
};

export type LegacyLsaAccountReport = {
  accountId: string;
  businessName?: string;
  averageWeeklyBudget?: number | string;
  averageFiveStarRating?: number;
  totalReview?: number | string;
  impressionsLastTwoDays?: number | string;
  phoneLeadResponsiveness?: number;
  currentPeriodChargedLeads?: number | string;
  previousPeriodChargedLeads?: number | string;
  /** Aggregate cost for the requested period, never a per-lead amount. */
  currentPeriodTotalCost?: number | string;
  previousPeriodTotalCost?: number | string;
  currencyCode?: string;
  currentPeriodPhoneCalls?: number | string;
  previousPeriodPhoneCalls?: number | string;
  currentPeriodConnectedPhoneCalls?: number | string;
  previousPeriodConnectedPhoneCalls?: number | string;
};

export type FetchPmaxLsaDailySpendRequest = GoogleAdsCustomerRequest & {
  /** Inclusive YYYY-MM-DD bounds interpreted in the Google Ads customer's time zone. */
  startDate: string;
  endDate: string;
  campaignId?: string;
};

export type GoogleLsaDailySpendRow = {
  customerId: string;
  currencyCode: string;
  timeZone: string;
  campaignId: string;
  campaignName: string;
  date: string;
  costMicros: string;
  conversions: number;
  costPerConversion: number;
};

export type GoogleLsaSurveyAnswer =
  | 'VERY_DISSATISFIED'
  | 'DISSATISFIED'
  | 'NEUTRAL'
  | 'SATISFIED'
  | 'VERY_SATISFIED';

export type GoogleLsaSatisfiedReason =
  | 'BOOKED_CUSTOMER'
  | 'HIGH_VALUE_SERVICE'
  | 'LIKELY_BOOKED_CUSTOMER'
  | 'SERVICE_RELATED'
  | 'OTHER_SATISFIED_REASON';

export type GoogleLsaDissatisfiedReason =
  | 'DUPLICATE'
  | 'GEO_MISMATCH'
  | 'JOB_TYPE_MISMATCH'
  | 'NOT_READY_TO_BOOK'
  | 'SOLICITATION'
  | 'SPAM'
  | 'OTHER_DISSATISFIED_REASON';

export type GoogleLsaFeedback = {
  surveyAnswer: GoogleLsaSurveyAnswer;
  reason?: GoogleLsaSatisfiedReason | GoogleLsaDissatisfiedReason;
  otherReasonComment?: string;
};

export type ProvideGoogleLsaFeedbackRequest = GoogleAdsCustomerRequest & {
  /** customers/{customerId}/localServicesLeads/{leadId} */
  resourceName: string;
  feedback: GoogleLsaFeedback;
};

export type GoogleLsaCreditIssuanceDecision =
  | 'FAIL_NOT_ELIGIBLE'
  | 'FAIL_OVER_THRESHOLD'
  | 'SUCCESS_NOT_REACHED_THRESHOLD'
  | 'SUCCESS_REACHED_THRESHOLD'
  | 'UNKNOWN'
  | 'UNSPECIFIED';

export type GoogleLsaFeedbackResponse = {
  /** This is Google's bonus-credit decision, not the lead's ordinary credit state. */
  creditIssuanceDecision: GoogleLsaCreditIssuanceDecision;
};
