/** Pure normalization between Google REST rows and the service-only tables. */

export type RawGoogleLsaLead = {
  resourceName?: string;
  id?: string | number;
  categoryId?: string;
  serviceId?: string;
  contactDetails?: {
    phoneNumber?: string;
    consumerName?: string;
    phoneNumberExtension?: string;
  } | null;
  leadType?: string;
  leadStatus?: string;
  creationDateTime?: string;
  locale?: string;
  leadCharged?: boolean;
  creditDetails?: {
    creditState?: string;
    creditStateLastUpdateDateTime?: string;
  } | null;
  creditState?: string | null;
  creditStateLastUpdateDateTime?: string | null;
  leadFeedbackSubmitted?: boolean;
  note?: { description?: string; editDateTime?: string } | null;
  noteDescription?: string | null;
  noteEditDateTime?: string | null;
};

export type RawGoogleLsaConversation = {
  resourceName?: string;
  id?: string | number;
  localServicesLead?: string;
  lead?: string;
  leadResourceName?: string;
  conversationChannel?: string;
  participantType?: string;
  eventDateTime?: string;
  phoneCallDetails?: { callDurationMillis?: string | number; callRecordingUrl?: string } | null;
  messageDetails?: { text?: string; attachmentUrls?: string[] } | null;
  callDurationMillis?: string | number | null;
  callRecordingUrl?: string | null;
  messageText?: string | null;
  attachmentUrls?: string[];
};

export function normalizeGoogleAdsId(value: unknown): string | null {
  const normalized = String(value ?? '').replace(/\D/g, '');
  return normalized || null;
}

function numericParts(date: Date, timeZone: string): number[] | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (kind: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === kind)?.value);
    const result = [value('year'), value('month'), value('day'), value('hour'), value('minute'), value('second')];
    return result.every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Google returns lead timestamps in the Google Ads account timezone without an
 * offset. Convert that wall-clock value to an instant before storing it as
 * timestamptz; parsing it in the server timezone would move leads by hours.
 */
export function googleLocalDateTimeToIso(value: unknown, timeZone: string): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(' ', 'T');
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(normalized);
  if (!match) return null;
  const wall = match.slice(1).map(Number);
  const wallUtc = Date.UTC(wall[0], wall[1] - 1, wall[2], wall[3], wall[4], wall[5]);

  // Two passes account for crossing a daylight-saving boundary while applying
  // the first offset estimate. Ambiguous fall-back minutes resolve to one real
  // instant consistently; Google does not expose a fold marker.
  let instant = wallUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const shown = numericParts(new Date(instant), timeZone);
    if (!shown) return null;
    const shownAsUtc = Date.UTC(shown[0], shown[1] - 1, shown[2], shown[3], shown[4], shown[5]);
    const next = wallUtc - (shownAsUtc - instant);
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant).toISOString();
}

function clean(value: unknown, max = 500): string | null {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return text ? text.slice(0, max) : null;
}

function idFromResource(resourceName: string | null, collection: string): string | null {
  if (!resourceName) return null;
  const match = new RegExp(`/${collection}/([^/]+)$`).exec(resourceName);
  return match?.[1] ?? null;
}

export function googleLsaLeadRow(input: {
  accountId: string;
  customerId: string;
  customerTimeZone: string;
  lead: RawGoogleLsaLead;
  crmLeadId?: string | null;
  now?: string;
}) {
  const resourceName = clean(input.lead.resourceName, 300);
  const googleLeadId = clean(input.lead.id, 120) || idFromResource(resourceName, 'localServicesLeads');
  if (!resourceName || !googleLeadId) throw new Error('Google returned a Local Services lead without an identity.');
  const now = input.now ?? new Date().toISOString();
  return {
    account_id: input.accountId,
    customer_id: input.customerId,
    google_lead_id: googleLeadId,
    resource_name: resourceName,
    ...(input.crmLeadId ? { crm_lead_id: input.crmLeadId } : {}),
    category_id: clean(input.lead.categoryId, 120),
    service_id: clean(input.lead.serviceId, 120),
    lead_type: clean(input.lead.leadType, 80),
    lead_status: clean(input.lead.leadStatus, 80),
    consumer_name: clean(input.lead.contactDetails?.consumerName, 200),
    consumer_phone: clean(input.lead.contactDetails?.phoneNumber, 80),
    consumer_phone_extension: clean(input.lead.contactDetails?.phoneNumberExtension, 40),
    locale: clean(input.lead.locale, 40),
    lead_charged: input.lead.leadCharged === true,
    credit_state: clean(input.lead.creditState ?? input.lead.creditDetails?.creditState, 80),
    credit_state_updated_at: googleLocalDateTimeToIso(
      input.lead.creditStateLastUpdateDateTime ?? input.lead.creditDetails?.creditStateLastUpdateDateTime,
      input.customerTimeZone,
    ),
    feedback_submitted: input.lead.leadFeedbackSubmitted === true,
    note: clean(input.lead.noteDescription ?? input.lead.note?.description, 4_000),
    note_updated_at: googleLocalDateTimeToIso(input.lead.noteEditDateTime ?? input.lead.note?.editDateTime, input.customerTimeZone),
    google_created_at: googleLocalDateTimeToIso(input.lead.creationDateTime, input.customerTimeZone),
    last_synced_at: now,
  };
}

export function googleLsaConversationRow(input: {
  accountId: string;
  customerId: string;
  customerTimeZone: string;
  conversation: RawGoogleLsaConversation;
  now?: string;
}) {
  const resourceName = clean(input.conversation.resourceName, 300);
  const googleConversationId = clean(input.conversation.id, 120)
    || idFromResource(resourceName, 'localServicesLeadConversations');
  const leadResource = clean(
    input.conversation.leadResourceName || input.conversation.localServicesLead || input.conversation.lead,
    300,
  );
  const googleLeadId = idFromResource(leadResource, 'localServicesLeads');
  if (!resourceName || !googleConversationId || !googleLeadId) {
    throw new Error('Google returned a Local Services conversation without an identity.');
  }
  const duration = Number(input.conversation.callDurationMillis ?? input.conversation.phoneCallDetails?.callDurationMillis);
  const attachmentUrls = input.conversation.attachmentUrls ?? input.conversation.messageDetails?.attachmentUrls;
  const now = input.now ?? new Date().toISOString();
  return {
    account_id: input.accountId,
    customer_id: input.customerId,
    google_conversation_id: googleConversationId,
    resource_name: resourceName,
    google_lead_id: googleLeadId,
    channel: clean(input.conversation.conversationChannel, 80) || 'UNKNOWN',
    participant: clean(input.conversation.participantType, 80),
    event_at: googleLocalDateTimeToIso(input.conversation.eventDateTime, input.customerTimeZone),
    message_text: clean(input.conversation.messageText ?? input.conversation.messageDetails?.text, 8_000),
    attachments: Array.isArray(attachmentUrls)
      ? attachmentUrls.filter((url): url is string => typeof url === 'string').slice(0, 50)
      : [],
    call_duration_seconds: Number.isFinite(duration) && duration >= 0 ? Math.round(duration / 1_000) : null,
    recording_url: clean(input.conversation.callRecordingUrl ?? input.conversation.phoneCallDetails?.callRecordingUrl, 2_000),
    last_synced_at: now,
  };
}

export function googleLsaCrmLeadInput(lead: RawGoogleLsaLead, resourceName: string, createdAt: string | null) {
  const leadType = clean(lead.leadType, 80) || 'LEAD';
  const service = clean(lead.serviceId, 120) || clean(lead.categoryId, 120);
  const note = clean(lead.noteDescription ?? lead.note?.description, 2_000);
  const detail = [
    `Imported ${leadType.toLowerCase().replace(/_/g, ' ')} from Google Local Services Ads.`,
    note,
  ].filter(Boolean).join('\n\n');
  return {
    source: 'google_lsa' as const,
    name: clean(lead.contactDetails?.consumerName, 200) || 'Google Local Services lead',
    phone: clean(lead.contactDetails?.phoneNumber, 80),
    projectType: service || leadType.toLowerCase().replace(/_/g, ' '),
    message: detail,
    sourcePage: 'google-local-services-ads',
    sourceGoogleLsaResource: resourceName,
    createdAt,
    // No consent is inferred from a provider import, so this intentionally has
    // no consent object and no automatic speed-to-lead send is triggered.
    triage: {
      score: 'warm' as const,
      flags: [],
      attribution: {
        source: 'google_local_services',
        medium: 'paid',
        capturedAt: createdAt || new Date().toISOString(),
      },
    },
  };
}
