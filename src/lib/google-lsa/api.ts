import type {
  DiscoverGoogleLsaCustomersRequest,
  FetchLegacyLsaAccountReportRequest,
  FetchPmaxLsaDailySpendRequest,
  GoogleAdsAuth,
  GoogleLsaCalendarDate,
  GoogleLsaConversationRow,
  GoogleLsaCustomerCandidate,
  GoogleLsaDailySpendRow,
  GoogleLsaDissatisfiedReason,
  GoogleLsaFeedback,
  GoogleLsaFeedbackResponse,
  GoogleLsaFetch,
  GoogleLsaLeadRow,
  GoogleLsaSatisfiedReason,
  LegacyLsaAccountReport,
  ListGoogleLsaConversationsRequest,
  ListGoogleLsaLeadsRequest,
  ProvideGoogleLsaFeedbackRequest,
} from './types';

export const GOOGLE_ADS_API_VERSION = 'v25';
const GOOGLE_ADS_API_ORIGIN = 'https://googleads.googleapis.com';
const LOCAL_SERVICES_API_ORIGIN = 'https://localservices.googleapis.com';

/** Exact selectable v25 fields; notably absent are appointment and lead-price fields. */
export const GOOGLE_LSA_LEADS_QUERY = `SELECT
  local_services_lead.resource_name,
  local_services_lead.id,
  local_services_lead.category_id,
  local_services_lead.service_id,
  local_services_lead.contact_details,
  local_services_lead.lead_type,
  local_services_lead.lead_status,
  local_services_lead.creation_date_time,
  local_services_lead.locale,
  local_services_lead.lead_charged,
  local_services_lead.credit_details.credit_state,
  local_services_lead.credit_details.credit_state_last_update_date_time,
  local_services_lead.lead_feedback_submitted,
  local_services_lead.note.description,
  local_services_lead.note.edit_date_time
FROM local_services_lead`;

export const GOOGLE_LSA_CONVERSATIONS_QUERY = `SELECT
  local_services_lead_conversation.resource_name,
  local_services_lead_conversation.id,
  local_services_lead_conversation.lead,
  local_services_lead_conversation.conversation_channel,
  local_services_lead_conversation.participant_type,
  local_services_lead_conversation.event_date_time,
  local_services_lead_conversation.phone_call_details.call_duration_millis,
  local_services_lead_conversation.phone_call_details.call_recording_url,
  local_services_lead_conversation.message_details.text,
  local_services_lead_conversation.message_details.attachment_urls
FROM local_services_lead_conversation`;

const CUSTOMER_QUERY = `SELECT
  customer.id,
  customer.descriptive_name,
  customer.currency_code,
  customer.time_zone,
  customer.manager,
  customer.status
FROM customer
LIMIT 1`;

const CUSTOMER_CLIENT_QUERY = `SELECT
  customer_client.client_customer,
  customer_client.id,
  customer_client.descriptive_name,
  customer_client.currency_code,
  customer_client.time_zone,
  customer_client.manager,
  customer_client.hidden,
  customer_client.level,
  customer_client.status
FROM customer_client
WHERE customer_client.status = 'ENABLED'`;

const ELIGIBLE_CAMPAIGNS_QUERY = `SELECT
  campaign.resource_name,
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.pmax_campaign_settings.local_services_enabled
FROM campaign
WHERE campaign.status != 'REMOVED'
  AND campaign.advertising_channel_type IN ('LOCAL_SERVICES', 'PERFORMANCE_MAX')`;

type JsonObject = Record<string, unknown>;

export class GoogleLsaApiError extends Error {
  readonly status: number;
  readonly googleStatus: string | null;
  readonly requestId: string | null;

  constructor(message: string, status: number, googleStatus: string | null, requestId: string | null) {
    super(message);
    this.name = 'GoogleLsaApiError';
    this.status = status;
    this.googleStatus = googleStatus;
    this.requestId = requestId;
  }
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : value === 0 ? '0' : null;
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringOrNull(value);
  if (!parsed) throw new Error(`Google Ads response omitted ${field}.`);
  return parsed;
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function googleErrorDetails(payload: JsonObject): { message: string; status: string | null; requestId: string | null } {
  const error = object(payload.error);
  const details = Array.isArray(error.details) ? error.details.map(object) : [];
  const failure = details.find((detail) => Array.isArray(detail.errors));
  const firstError = failure && Array.isArray(failure.errors) ? object(failure.errors[0]) : {};
  return {
    message: stringOrNull(firstError.message) || stringOrNull(error.message) || 'Google rejected the request.',
    status: stringOrNull(error.status),
    requestId: stringOrNull(failure?.requestId),
  };
}

/** Exported for focused transport tests and consistent error parsing. */
export async function parseGoogleLsaApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: JsonObject = {};
  if (text) {
    try {
      payload = object(JSON.parse(text));
    } catch {
      if (!response.ok) {
        throw new GoogleLsaApiError(text.slice(0, 300), response.status, null, null);
      }
      throw new GoogleLsaApiError('Google returned malformed JSON.', response.status, null, null);
    }
  }

  if (!response.ok || payload.error) {
    const detail = googleErrorDetails(payload);
    throw new GoogleLsaApiError(detail.message, response.status, detail.status, detail.requestId);
  }
  return payload as T;
}

/** Accept Google's dashed display form while refusing other path/header input. */
export function normalizeGoogleCustomerId(value: string, label = 'customer ID'): string {
  const normalized = String(value ?? '').trim().replace(/[\s-]/g, '');
  if (!/^\d{1,20}$/.test(normalized)) throw new Error(`Invalid Google Ads ${label}.`);
  return normalized;
}

function googleAdsHeaders(auth: GoogleAdsAuth, json = true): HeadersInit {
  const developerToken = (auth.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not configured.');
  if (!auth.accessToken) throw new Error('A Google OAuth access token is required.');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: 'application/json',
    'developer-token': developerToken,
  };
  if (json) headers['Content-Type'] = 'application/json';
  if (auth.loginCustomerId) {
    headers['login-customer-id'] = normalizeGoogleCustomerId(auth.loginCustomerId, 'login customer ID');
  }
  return headers;
}

type GoogleAdsSearchResponse = {
  results?: JsonObject[];
  nextPageToken?: string;
};

async function googleAdsSearch(
  request: GoogleAdsAuth & { customerId: string },
  query: string,
  fetchImpl: GoogleLsaFetch,
): Promise<JsonObject[]> {
  const customerId = normalizeGoogleCustomerId(request.customerId);
  const url = `${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: JsonObject[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const body: { query: string; pageToken?: string } = { query };
    if (pageToken) body.pageToken = pageToken;
    // Search v25 has a fixed 10,000-row page and rejects pageSize.
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: googleAdsHeaders(request),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await parseGoogleLsaApiResponse<GoogleAdsSearchResponse>(response);
    if (Array.isArray(payload.results)) rows.push(...payload.results.map(object));
    pageToken = stringOrNull(payload.nextPageToken) ?? undefined;
    if (pageToken) {
      if (seenTokens.has(pageToken)) throw new Error('Google Ads pagination returned a repeated page token.');
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  return rows;
}

export function parseGoogleLsaLeadRow(row: JsonObject): GoogleLsaLeadRow {
  const lead = object(row.localServicesLead);
  const contact = lead.contactDetails == null ? null : object(lead.contactDetails);
  const credit = object(lead.creditDetails);
  const note = object(lead.note);
  return {
    resourceName: requiredString(lead.resourceName, 'localServicesLead.resourceName'),
    id: requiredString(lead.id, 'localServicesLead.id'),
    categoryId: stringOrNull(lead.categoryId),
    serviceId: stringOrNull(lead.serviceId),
    contactDetails: contact == null ? null : {
      ...(stringOrNull(contact.consumerName) ? { consumerName: stringOrNull(contact.consumerName)! } : {}),
      ...(stringOrNull(contact.phoneNumber) ? { phoneNumber: stringOrNull(contact.phoneNumber)! } : {}),
      ...(stringOrNull(contact.phoneNumberExtension)
        ? { phoneNumberExtension: stringOrNull(contact.phoneNumberExtension)! }
        : {}),
    },
    leadType: requiredString(lead.leadType, 'localServicesLead.leadType') as GoogleLsaLeadRow['leadType'],
    leadStatus: requiredString(lead.leadStatus, 'localServicesLead.leadStatus') as GoogleLsaLeadRow['leadStatus'],
    creationDateTime: requiredString(lead.creationDateTime, 'localServicesLead.creationDateTime'),
    locale: stringOrNull(lead.locale),
    leadCharged: lead.leadCharged === true,
    creditState: stringOrNull(credit.creditState) as GoogleLsaLeadRow['creditState'],
    creditStateLastUpdateDateTime: stringOrNull(credit.creditStateLastUpdateDateTime),
    leadFeedbackSubmitted: lead.leadFeedbackSubmitted === true,
    noteDescription: stringOrNull(note.description),
    noteEditDateTime: stringOrNull(note.editDateTime),
  };
}

export async function listGoogleLsaLeads(
  request: ListGoogleLsaLeadsRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleLsaLeadRow[]> {
  const query = withInclusiveDateWindow(
    GOOGLE_LSA_LEADS_QUERY,
    'local_services_lead.creation_date_time',
    request.startDate,
    request.endDate,
  );
  const rows = await googleAdsSearch(request, query, fetchImpl);
  return rows.map(parseGoogleLsaLeadRow);
}

export function parseGoogleLsaConversationRow(row: JsonObject): GoogleLsaConversationRow {
  const conversation = object(row.localServicesLeadConversation);
  const phone = object(conversation.phoneCallDetails);
  const message = object(conversation.messageDetails);
  return {
    resourceName: requiredString(conversation.resourceName, 'localServicesLeadConversation.resourceName'),
    id: requiredString(conversation.id, 'localServicesLeadConversation.id'),
    leadResourceName: requiredString(conversation.lead, 'localServicesLeadConversation.lead'),
    conversationChannel: requiredString(
      conversation.conversationChannel,
      'localServicesLeadConversation.conversationChannel',
    ) as GoogleLsaConversationRow['conversationChannel'],
    participantType: requiredString(
      conversation.participantType,
      'localServicesLeadConversation.participantType',
    ) as GoogleLsaConversationRow['participantType'],
    eventDateTime: requiredString(conversation.eventDateTime, 'localServicesLeadConversation.eventDateTime'),
    callDurationMillis: stringOrNull(phone.callDurationMillis),
    callRecordingUrl: stringOrNull(phone.callRecordingUrl),
    messageText: stringOrNull(message.text),
    attachmentUrls: Array.isArray(message.attachmentUrls)
      ? message.attachmentUrls.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function validateLeadResourceName(resourceName: string, expectedCustomerId: string): string {
  const normalized = String(resourceName ?? '').trim();
  const match = /^customers\/(\d+)\/localServicesLeads\/(\d+)$/.exec(normalized);
  if (!match || match[1] !== normalizeGoogleCustomerId(expectedCustomerId)) {
    throw new Error('The Local Services lead resource does not belong to this Google Ads customer.');
  }
  return normalized;
}

function gaqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export async function listGoogleLsaConversations(
  request: ListGoogleLsaConversationsRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleLsaConversationRow[]> {
  const conditions: string[] = [];
  if (request.leadResourceName) {
    const resourceName = validateLeadResourceName(request.leadResourceName, request.customerId);
    conditions.push(`local_services_lead_conversation.lead = ${gaqlString(resourceName)}`);
  }
  conditions.push(...dateWindowConditions(
    'local_services_lead_conversation.event_date_time',
    request.startDate,
    request.endDate,
  ));
  const query = conditions.length
    ? `${GOOGLE_LSA_CONVERSATIONS_QUERY}\nWHERE ${conditions.join('\n  AND ')}`
    : GOOGLE_LSA_CONVERSATIONS_QUERY;
  const rows = await googleAdsSearch(request, query, fetchImpl);
  return rows.map(parseGoogleLsaConversationRow);
}

type AccountInfo = {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  loginCustomerId: string | null;
  manager: boolean;
  hidden: boolean;
  level: number;
};

function parseCustomerRow(row: JsonObject, rootId: string): AccountInfo {
  const customer = object(row.customer);
  return {
    customerId: normalizeGoogleCustomerId(requiredString(customer.id, 'customer.id')),
    descriptiveName: stringOrNull(customer.descriptiveName) || `Google Ads ${rootId}`,
    currencyCode: stringOrNull(customer.currencyCode) || '',
    timeZone: stringOrNull(customer.timeZone) || 'UTC',
    loginCustomerId: null,
    manager: customer.manager === true,
    hidden: false,
    level: 0,
  };
}

function parseCustomerClientRow(row: JsonObject, rootId: string): AccountInfo {
  const client = object(row.customerClient);
  const customerId = normalizeGoogleCustomerId(requiredString(client.id, 'customerClient.id'));
  return {
    customerId,
    descriptiveName: stringOrNull(client.descriptiveName) || `Google Ads ${customerId}`,
    currencyCode: stringOrNull(client.currencyCode) || '',
    timeZone: stringOrNull(client.timeZone) || 'UTC',
    loginCustomerId: customerId === rootId ? null : rootId,
    manager: client.manager === true,
    hidden: client.hidden === true,
    level: numberOrZero(client.level),
  };
}

async function listAccessibleCustomerIds(
  request: DiscoverGoogleLsaCustomersRequest,
  fetchImpl: GoogleLsaFetch,
): Promise<string[]> {
  const response = await fetchImpl(`${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, {
    headers: googleAdsHeaders(request, false),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseGoogleLsaApiResponse<{ resourceNames?: string[] }>(response);
  return (payload.resourceNames ?? []).map((resourceName) => {
    const match = /^customers\/(\d+)$/.exec(resourceName);
    if (!match) throw new Error('Google returned a malformed accessible customer resource name.');
    return match[1];
  });
}

/**
 * Enumerate directly accessible roots, walk each manager's customer_client
 * hierarchy, and return one candidate per eligible Local Services campaign.
 */
export async function discoverGoogleLsaCustomers(
  request: DiscoverGoogleLsaCustomersRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleLsaCustomerCandidate[]> {
  const rootIds = await listAccessibleCustomerIds(request, fetchImpl);
  const accounts = new Map<string, AccountInfo>();

  for (const rootId of rootIds) {
    const directRows = await googleAdsSearch({ ...request, customerId: rootId }, CUSTOMER_QUERY, fetchImpl);
    if (directRows.length === 0) continue;
    const root = parseCustomerRow(directRows[0], rootId);

    // Prefer a direct OAuth path over an overlapping manager hierarchy.
    const existingRoot = accounts.get(root.customerId);
    if (!existingRoot || existingRoot.loginCustomerId) accounts.set(root.customerId, root);

    if (!root.manager) continue;
    const hierarchyRows = await googleAdsSearch({
      ...request,
      customerId: rootId,
      loginCustomerId: rootId,
    }, CUSTOMER_CLIENT_QUERY, fetchImpl);
    for (const row of hierarchyRows) {
      const account = parseCustomerClientRow(row, rootId);
      const existing = accounts.get(account.customerId);
      if (!existing || account.level < existing.level || (existing.loginCustomerId && !account.loginCustomerId)) {
        accounts.set(account.customerId, account);
      }
    }
  }

  const candidates = new Map<string, GoogleLsaCustomerCandidate>();
  for (const account of accounts.values()) {
    if (account.manager || account.hidden) continue;
    const campaignRows = await googleAdsSearch({
      ...request,
      customerId: account.customerId,
      loginCustomerId: account.loginCustomerId,
    }, ELIGIBLE_CAMPAIGNS_QUERY, fetchImpl);

    for (const row of campaignRows) {
      const campaign = object(row.campaign);
      const channel = stringOrNull(campaign.advertisingChannelType);
      const pmax = object(campaign.pmaxCampaignSettings);
      const legacy = channel === 'LOCAL_SERVICES';
      const migrated = channel === 'PERFORMANCE_MAX' && pmax.localServicesEnabled === true;
      if (!legacy && !migrated) continue;

      const campaignId = requiredString(campaign.id, 'campaign.id');
      const candidate: GoogleLsaCustomerCandidate = {
        customerId: account.customerId,
        descriptiveName: account.descriptiveName,
        customerName: account.descriptiveName,
        currencyCode: account.currencyCode,
        timeZone: account.timeZone,
        loginCustomerId: account.loginCustomerId,
        campaignKind: legacy ? 'legacy' : 'pmax',
        campaignMode: legacy ? 'legacy' : 'pmax',
        campaignId,
        campaign: {
          id: campaignId,
          resourceName: stringOrNull(campaign.resourceName),
          name: stringOrNull(campaign.name) || `Campaign ${campaignId}`,
          status: stringOrNull(campaign.status) || 'UNKNOWN',
          advertisingChannelType: legacy ? 'LOCAL_SERVICES' : 'PERFORMANCE_MAX',
          localServicesEnabled: migrated,
        },
      };
      candidates.set(`${candidate.customerId}:${campaignId}`, candidate);
    }
  }

  return [...candidates.values()].sort((a, b) =>
    a.descriptiveName.localeCompare(b.descriptiveName) || a.campaign.name.localeCompare(b.campaign.name));
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseGoogleLsaCalendarDate(value: string | GoogleLsaCalendarDate): GoogleLsaCalendarDate {
  let date: GoogleLsaCalendarDate;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('Google LSA report dates must use YYYY-MM-DD.');
    date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  } else {
    date = { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
  }
  if (!Number.isInteger(date.year) || date.year < 1 || date.year > 9_999
      || !Number.isInteger(date.month) || date.month < 1 || date.month > 12
      || !Number.isInteger(date.day) || date.day < 1 || date.day > daysInMonth(date.year, date.month)) {
    throw new Error('Invalid Google LSA report calendar date.');
  }
  return date;
}

function comparableDate(date: GoogleLsaCalendarDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

function dateWindowConditions(field: string, startDate?: string, endDate?: string): string[] {
  const start = startDate ? parseGoogleLsaCalendarDate(startDate) : null;
  const end = endDate ? parseGoogleLsaCalendarDate(endDate) : null;
  if (start && end && comparableDate(start) > comparableDate(end)) {
    throw new Error('Google LSA query startDate must not follow endDate.');
  }
  return [
    ...(startDate ? [`${field} >= '${startDate} 00:00:00'`] : []),
    ...(endDate ? [`${field} <= '${endDate} 23:59:59'`] : []),
  ];
}

function withInclusiveDateWindow(baseQuery: string, field: string, startDate?: string, endDate?: string): string {
  const conditions = dateWindowConditions(field, startDate, endDate);
  return conditions.length ? `${baseQuery}\nWHERE ${conditions.join('\n  AND ')}` : baseQuery;
}

export async function fetchLegacyLsaAccountReport(
  request: FetchLegacyLsaAccountReportRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<LegacyLsaAccountReport[]> {
  const managerId = normalizeGoogleCustomerId(request.managerCustomerId, 'manager customer ID');
  const customerId = request.customerId ? normalizeGoogleCustomerId(request.customerId) : null;
  const start = parseGoogleLsaCalendarDate(request.startDate);
  const end = parseGoogleLsaCalendarDate(request.endDate);
  if (comparableDate(start) > comparableDate(end)) throw new Error('Google LSA report startDate must not follow endDate.');
  if (!request.accessToken) throw new Error('A Google OAuth access token is required.');

  const reports: LegacyLsaAccountReport[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      query: `manager_customer_id:${managerId}${customerId ? `;customer_id:${customerId}` : ''}`,
      'startDate.year': String(start.year),
      'startDate.month': String(start.month),
      'startDate.day': String(start.day),
      'endDate.year': String(end.year),
      'endDate.month': String(end.month),
      'endDate.day': String(end.day),
      pageSize: '10000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetchImpl(`${LOCAL_SERVICES_API_ORIGIN}/v1/accountReports:search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${request.accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await parseGoogleLsaApiResponse<{
      accountReports?: LegacyLsaAccountReport[];
      nextPageToken?: string;
    }>(response);
    if (Array.isArray(payload.accountReports)) reports.push(...payload.accountReports);
    pageToken = stringOrNull(payload.nextPageToken) ?? undefined;
    if (pageToken) {
      if (seenTokens.has(pageToken)) throw new Error('Local Services pagination returned a repeated page token.');
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  return reports;
}

export async function fetchPmaxLsaDailySpend(
  request: FetchPmaxLsaDailySpendRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleLsaDailySpendRow[]> {
  const start = parseGoogleLsaCalendarDate(request.startDate);
  const end = parseGoogleLsaCalendarDate(request.endDate);
  if (comparableDate(start) > comparableDate(end)) throw new Error('Google Ads spend startDate must not follow endDate.');
  const startDate = request.startDate;
  const endDate = request.endDate;
  const campaignFilter = request.campaignId
    ? `\n  AND campaign.id = ${normalizeGoogleCustomerId(request.campaignId, 'campaign ID')}`
    : '';
  const query = `SELECT
  customer.id,
  customer.currency_code,
  customer.time_zone,
  campaign.id,
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.conversions,
  metrics.cost_per_conversion
FROM campaign
WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
  AND campaign.pmax_campaign_settings.local_services_enabled = TRUE${campaignFilter}`;
  const rows = await googleAdsSearch(request, query, fetchImpl);
  return rows.map((row) => {
    const customer = object(row.customer);
    const campaign = object(row.campaign);
    const segments = object(row.segments);
    const metrics = object(row.metrics);
    return {
      customerId: stringOrNull(customer.id) || normalizeGoogleCustomerId(request.customerId),
      currencyCode: stringOrNull(customer.currencyCode) || '',
      timeZone: stringOrNull(customer.timeZone) || 'UTC',
      campaignId: requiredString(campaign.id, 'campaign.id'),
      campaignName: stringOrNull(campaign.name) || '',
      date: requiredString(segments.date, 'segments.date'),
      costMicros: stringOrNull(metrics.costMicros) || '0',
      conversions: numberOrZero(metrics.conversions),
      costPerConversion: numberOrZero(metrics.costPerConversion),
    };
  });
}

const SATISFIED_REASONS = new Set<GoogleLsaSatisfiedReason>([
  'BOOKED_CUSTOMER',
  'HIGH_VALUE_SERVICE',
  'LIKELY_BOOKED_CUSTOMER',
  'SERVICE_RELATED',
  'OTHER_SATISFIED_REASON',
]);

const DISSATISFIED_REASONS = new Set<GoogleLsaDissatisfiedReason>([
  'DUPLICATE',
  'GEO_MISMATCH',
  'JOB_TYPE_MISMATCH',
  'NOT_READY_TO_BOOK',
  'SOLICITATION',
  'SPAM',
  'OTHER_DISSATISFIED_REASON',
]);

export function buildGoogleLsaFeedbackBody(feedback: GoogleLsaFeedback): JsonObject {
  const answer = feedback.surveyAnswer;
  const comment = String(feedback.otherReasonComment ?? '').trim();
  if (!['VERY_DISSATISFIED', 'DISSATISFIED', 'NEUTRAL', 'SATISFIED', 'VERY_SATISFIED'].includes(answer)) {
    throw new Error('Invalid Local Services lead survey answer.');
  }

  if (answer === 'NEUTRAL') {
    if (feedback.reason || comment) throw new Error('Neutral Local Services feedback cannot include a reason or comment.');
    return { surveyAnswer: answer };
  }

  const satisfied = answer === 'SATISFIED' || answer === 'VERY_SATISFIED';
  if (!feedback.reason) throw new Error('A Local Services lead survey reason is required.');
  if (satisfied && !SATISFIED_REASONS.has(feedback.reason as GoogleLsaSatisfiedReason)) {
    throw new Error('This reason is not valid for satisfied Local Services feedback.');
  }
  if (!satisfied && !DISSATISFIED_REASONS.has(feedback.reason as GoogleLsaDissatisfiedReason)) {
    throw new Error('This reason is not valid for dissatisfied Local Services feedback.');
  }

  const other = feedback.reason === 'OTHER_SATISFIED_REASON' || feedback.reason === 'OTHER_DISSATISFIED_REASON';
  if (other && !comment) throw new Error('A comment is required when the Local Services feedback reason is Other.');

  if (satisfied) {
    return {
      surveyAnswer: answer,
      surveySatisfied: {
        surveySatisfiedReason: feedback.reason,
        ...(comment ? { otherReasonComment: comment } : {}),
      },
    };
  }
  return {
    surveyAnswer: answer,
    surveyDissatisfied: {
      surveyDissatisfiedReason: feedback.reason,
      ...(comment ? { otherReasonComment: comment } : {}),
    },
  };
}

export async function provideGoogleLsaFeedback(
  request: ProvideGoogleLsaFeedbackRequest,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleLsaFeedbackResponse> {
  const resourceName = validateLeadResourceName(request.resourceName, request.customerId);
  const response = await fetchImpl(`${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}/${resourceName}:provideLeadFeedback`, {
    method: 'POST',
    headers: googleAdsHeaders(request),
    body: JSON.stringify(buildGoogleLsaFeedbackBody(request.feedback)),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseGoogleLsaApiResponse<GoogleLsaFeedbackResponse>(response);
  return {
    creditIssuanceDecision: requiredString(
      payload.creditIssuanceDecision,
      'creditIssuanceDecision',
    ) as GoogleLsaFeedbackResponse['creditIssuanceDecision'],
  };
}
