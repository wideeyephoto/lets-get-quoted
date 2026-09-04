import 'server-only';

import { normalizeSignalWireSpaceOrigin } from '@/lib/sms-provider';

/**
 * Narrow SignalWire REST adapter for dedicated contractor numbers.
 *
 * Credentials are read only by `fromEnvironment`; callers persist provider
 * object IDs and normalized states, never the credential object or headers.
 * A Fetch implementation is injectable solely so the test suite can prove the
 * exact request contract without touching the network.
 */

const E164 = /^\+[1-9][0-9]{7,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENT_PAGE_SIZE = 1_000;
const MAX_ASSIGNMENT_PAGES = 100;
const PHONE_PAGE_SIZE = 1_000;
const MAX_PHONE_PAGES = 100;
const REGISTRY_PAGE_SIZE = 1_000;
const MAX_REGISTRY_PAGES = 100;

export type SignalWireNumberCandidate = Readonly<{
  number: string;
  region: string | null;
  city: string | null;
  capabilities: Readonly<{ voice: boolean; sms: boolean; mms: boolean; fax: boolean }>;
}>;

export type SignalWirePhoneNumber = Readonly<{
  id: string;
  number: string;
  name: string | null;
  capabilities: readonly string[];
  callHandler: string | null;
  callRelayScriptUrl?: string | null;
  callRequestUrl: string | null;
  callRequestMethod: string | null;
  callStatusCallbackUrl: string | null;
  callStatusCallbackMethod: string | null;
  messageHandler: string | null;
  messageRequestUrl: string | null;
  messageRequestMethod: string | null;
}>;

export type SignalWireReleasedPhoneNumber = Readonly<{
  id: string;
  number: string;
  released: true;
}>;

export type SignalWireBrand = Readonly<{
  id: string;
  state: string;
  name: string;
  companyName: string;
  ein: string;
  companyWebsite: string;
  entityType?: string | null;
}>;

export type SignalWireCampaign = Readonly<{
  id: string;
  state: string;
  name: string;
  smsUseCase: string;
}>;

export type SignalWireAssignmentOrder = Readonly<{
  id: string;
  state: string;
  statusCallbackUrl: string | null;
}>;

export type SignalWireNumberAssignment = Readonly<{
  id: string;
  state: string;
  campaignId: string;
  number: string;
  providerNumberId: string | null;
}>;

export type SignalWireProvisioningConfig = Readonly<{
  spaceUrl: string;
  projectId: string;
  apiToken: string;
}>;

type ErrorOptions = Readonly<{
  status: number | null;
  code: string;
  requiredScopes: readonly ('Numbers' | 'Messaging' | 'Voice')[];
  responseReceived: boolean;
  outcomeKnownAbsent: boolean;
}>;

export class SignalWireProvisioningError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly requiredScopes: readonly ('Numbers' | 'Messaging' | 'Voice')[];
  readonly responseReceived: boolean;
  /** True only when SignalWire explicitly rejected the mutation. */
  readonly outcomeKnownAbsent: boolean;

  constructor(message: string, options: ErrorOptions) {
    super(message);
    this.name = 'SignalWireProvisioningError';
    this.status = options.status;
    this.code = options.code;
    this.requiredScopes = options.requiredScopes;
    this.responseReceived = options.responseReceived;
    this.outcomeKnownAbsent = options.outcomeKnownAbsent;
  }

  get operatorMessage(): string {
    if (this.status === 401) {
      return 'SignalWire rejected the project ID or API token. Verify the server-only credentials.';
    }
    if (this.status === 403) {
      const scopes = this.requiredScopes.length ? ` Required API scopes: ${this.requiredScopes.join(' + ')}.` : '';
      return `SignalWire denied this request. Confirm the project has CSP access and the API token has the required permissions.${scopes} Provider detail: ${this.message}`;
    }
    if (this.code === 'not_configured') {
      return 'SignalWire provisioning credentials are not fully configured.';
    }
    return this.message;
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw malformed(`${label} is missing from the SignalWire response.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw malformed(`${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function candidateCapabilities(value: unknown): SignalWireNumberCandidate['capabilities'] {
  if (Array.isArray(value)) {
    if (value.some((capability) => typeof capability !== 'string')) {
      throw malformed('Candidate capabilities array contains a non-string value.');
    }
    const capabilities = new Set(value.map((capability) => capability.trim().toLowerCase()));
    return {
      voice: capabilities.has('voice'),
      sms: capabilities.has('sms'),
      mms: capabilities.has('mms'),
      fax: capabilities.has('fax'),
    };
  }

  const capabilities = record(value ?? {}, 'Candidate capabilities');
  return {
    voice: capabilities.voice === true,
    sms: capabilities.sms === true,
    mms: capabilities.mms === true,
    fax: capabilities.fax === true,
  };
}

function malformed(message: string): SignalWireProvisioningError {
  return new SignalWireProvisioningError(message, {
    status: null,
    code: 'malformed_response',
    requiredScopes: [],
    responseReceived: true,
    outcomeKnownAbsent: false,
  });
}

function normalizeSpaceUrl(raw: string): string {
  const entered = raw.trim();
  if (!entered) {
    throw new SignalWireProvisioningError('SignalWire Space URL is missing.', {
      status: null,
      code: 'not_configured',
      requiredScopes: [],
      responseReceived: false,
      outcomeKnownAbsent: true,
    });
  }
  const origin = normalizeSignalWireSpaceOrigin(entered);
  if (!origin) {
    throw new SignalWireProvisioningError('SignalWire Space URL must be a provider-hosted Space subdomain as a plain HTTPS origin without a path.', {
      status: null,
      code: 'invalid_space_url',
      requiredScopes: [],
      responseReceived: false,
      outcomeKnownAbsent: true,
    });
  }
  return origin;
}

function secureCallbackUrl(raw: string, label: string): string {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
    ) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} must be an HTTPS URL without credentials, a query string, or a fragment.`);
  }
}

function errorDetail(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 500);
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error', 'title']) {
      if (typeof row[key] === 'string' && row[key]) return String(row[key]).slice(0, 500);
    }
  }
  return 'SignalWire rejected the request.';
}

export class SignalWireNumberProvisioningClient {
  private readonly origin: string;
  private readonly authorization: string;
  private readonly providerDetailRedactions: readonly string[];

  constructor(
    config: SignalWireProvisioningConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.origin = normalizeSpaceUrl(config.spaceUrl);
    if (!UUID.test(config.projectId) || !config.apiToken.trim()) {
      throw new SignalWireProvisioningError('SignalWire project ID or API token is missing.', {
        status: null,
        code: 'not_configured',
        requiredScopes: [],
        responseReceived: false,
        outcomeKnownAbsent: true,
      });
    }
    this.authorization = `Basic ${Buffer.from(`${config.projectId}:${config.apiToken}`, 'utf8').toString('base64')}`;
    // The 10DLC callback token travels in an outbound request body (the
    // assignment's status_callback_url), so a provider error that echoes the
    // request back would otherwise put it in error_detail -- which IS rendered
    // on the admin registrations page, to an operator who by design cannot read
    // the Sensitive Vercel variable. The loop below skips values under 4 chars,
    // so an unset variable is a no-op.
    this.providerDetailRedactions = [
      config.apiToken,
      this.authorization,
      (process.env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN ?? '').trim(),
    ];
  }

  static fromEnvironment(fetchImpl: typeof fetch = fetch): SignalWireNumberProvisioningClient {
    return new SignalWireNumberProvisioningClient({
      spaceUrl: process.env.SIGNALWIRE_SPACE_URL ?? '',
      projectId: process.env.SIGNALWIRE_PROJECT_ID ?? '',
      apiToken: process.env.SIGNALWIRE_API_TOKEN ?? '',
    }, fetchImpl);
  }

  private async request(
    path: string,
    init: RequestInit,
    requiredScopes: readonly ('Numbers' | 'Messaging' | 'Voice')[],
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.origin}${path}`, {
        ...init,
        // Provider mutations run under short database leases. Bound every
        // network attempt so a timed-out worker cannot remain in flight past
        // its exclusive carrier-mutation authority and overlap a reclaimer.
        signal: init.signal ?? AbortSignal.timeout(15_000),
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: this.authorization,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (cause) {
      throw new SignalWireProvisioningError(
        `SignalWire request did not return a response: ${cause instanceof Error ? cause.message : 'network failure'}`,
        {
          status: null,
          code: 'network_error',
          requiredScopes,
          responseReceived: false,
          outcomeKnownAbsent: false,
        },
      );
    }

    const raw = await response.text();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        if (response.ok) throw malformed('SignalWire returned non-JSON success data.');
        body = raw;
      }
    }
    if (!response.ok) {
      const code = response.status === 401
        ? 'unauthorized'
        : response.status === 403
          ? 'missing_scope'
          : `http_${response.status}`;
      let detail = errorDetail(body).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
      for (const secret of this.providerDetailRedactions) {
        if (secret.length >= 4) detail = detail.split(secret).join('[redacted]');
      }
      throw new SignalWireProvisioningError(detail || 'SignalWire rejected the request.', {
        status: response.status,
        code,
        requiredScopes,
        responseReceived: true,
        // Most 4xx responses explicitly reject the mutation. Timeout,
        // conflict, too-early and rate-limit responses can follow ambiguous
        // processing, while every 5xx may have happened after a provider-side
        // commit. Those uncertain classes must be reconciled, never retried.
        outcomeKnownAbsent: response.status >= 400
          && response.status < 500
          && ![408, 409, 425, 429].includes(response.status),
      });
    }
    return body;
  }

  private async searchAvailableNumberInventory(input: Readonly<{
    areaCode: string;
    region?: string | null;
    maxResults?: number;
  }>): Promise<readonly SignalWireNumberCandidate[]> {
    if (!/^[2-9][0-9]{2}$/.test(input.areaCode)) throw new Error('Area code must be three US digits.');
    if (input.region && !/^[A-Z]{2}$/.test(input.region)) throw new Error('Region must be a two-letter state code.');
    const maxResults = Math.max(1, Math.min(20, Math.trunc(input.maxResults ?? 10)));
    const query = new URLSearchParams({
      areacode: input.areaCode,
      number_type: 'local',
      max_results: String(maxResults),
    });
    if (input.region) query.set('region', input.region);
    const body = record(await this.request(
      `/api/relay/rest/phone_numbers/search?${query}`,
      { method: 'GET' },
      ['Numbers'],
    ), 'SignalWire search response');
    if (!Array.isArray(body.data)) throw malformed('SignalWire search response has no data array.');
    return body.data.map((value) => {
      const row = record(value, 'SignalWire number candidate');
      const legacyNumber = optionalText(row.number);
      const e164Number = optionalText(row.e164);
      if (legacyNumber && e164Number && legacyNumber !== e164Number) {
        throw malformed('Candidate number identifiers do not match.');
      }
      const number = requireText(legacyNumber ?? e164Number, 'Candidate number');
      if (!E164.test(number)) throw malformed('Candidate number is not E.164.');
      return {
        number,
        region: optionalText(row.region),
        city: optionalText(row.city) ?? optionalText(row.rate_center),
        capabilities: candidateCapabilities(row.capabilities),
      };
    });
  }

  /** Messaging inventory must never offer a voice-only number for purchase. */
  async searchAvailableNumbers(input: Readonly<{
    areaCode: string;
    region?: string | null;
    maxResults?: number;
  }>): Promise<readonly SignalWireNumberCandidate[]> {
    const candidates = await this.searchAvailableNumberInventory(input);
    return candidates.filter((candidate) => candidate.capabilities.sms);
  }

  /** Dedicated AI Voice inventory is intentionally independent of SMS/10DLC. */
  async searchAvailableVoiceNumbers(input: Readonly<{
    areaCode: string;
    region?: string | null;
    maxResults?: number;
  }>): Promise<readonly SignalWireNumberCandidate[]> {
    const candidates = await this.searchAvailableNumberInventory(input);
    return candidates.filter((candidate) => candidate.capabilities.voice);
  }

  async purchaseNumber(number: string): Promise<SignalWirePhoneNumber> {
    if (!E164.test(number)) throw new Error('Purchase number must be E.164.');
    return this.parsePhone(await this.request(
      '/api/relay/rest/phone_numbers',
      { method: 'POST', body: JSON.stringify({ number }) },
      ['Numbers'],
    ));
  }

  async getPhoneNumber(
    providerNumberId: string,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<SignalWirePhoneNumber> {
    if (!UUID.test(providerNumberId)) throw new Error('SignalWire phone number ID is invalid.');
    const phone = this.parsePhone(await this.request(
      `/api/relay/rest/phone_numbers/${encodeURIComponent(providerNumberId)}`,
      { method: 'GET', signal: options.signal },
      ['Numbers'],
    ));
    if (phone.id !== providerNumberId) throw malformed('SignalWire returned a different phone number resource than requested.');
    return phone;
  }

  async releasePhoneNumber(input: Readonly<{
    providerNumberId: string;
    number: string;
    signal?: AbortSignal;
    reconcileNotFound?: boolean;
  }>): Promise<SignalWireReleasedPhoneNumber> {
    if (!UUID.test(input.providerNumberId)) throw new Error('SignalWire phone number ID is invalid.');
    if (!E164.test(input.number)) throw new Error('Released number must be E.164.');
    try {
      await this.request(
        `/api/relay/rest/phone_numbers/${encodeURIComponent(input.providerNumberId)}`,
        { method: 'DELETE', signal: input.signal },
        ['Numbers'],
      );
    } catch (error) {
      if (!(error instanceof SignalWireProvisioningError
          && error.status === 404
          && error.outcomeKnownAbsent)) throw error;
      if (input.reconcileNotFound === false) throw error;

      // DELETE 404 is not a failed release. It can be an idempotent replay
      // after the provider already removed the resource, or an identity typo.
      // Prove that this project no longer owns the exact E.164 before treating
      // the desired absent state as success. A lookup failure or a surviving
      // resource remains indeterminate and must not disappear from accounting.
      const surviving = await this.findOwnedPhoneNumber(input.number, { signal: input.signal });
      if (surviving) {
        throw malformed(
          surviving.id === input.providerNumberId
            ? 'SignalWire returned 404 for release but still lists the exact phone resource.'
            : 'SignalWire returned 404 for release but still owns the exact number under a different resource.',
        );
      }
    }
    // The documented successful response is 204 with no representation. The
    // exact identity therefore comes from the claimed immutable request. A
    // 404 reaches this point only after the exact E.164 absence check above.
    return Object.freeze({
      id: input.providerNumberId,
      number: input.number,
      released: true as const,
    });
  }

  /**
   * Prove whether an ambiguous purchase already created the exact E.164 in this
   * project. SignalWire's filter is substring-based, so every returned page is
   * parsed and filtered for exact equality before absence is accepted.
   */
  async findOwnedPhoneNumber(
    number: string,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<SignalWirePhoneNumber | null> {
    if (!E164.test(number)) throw new Error('Owned phone number lookup must be E.164.');
    const listPath = '/api/relay/rest/phone_numbers';
    const query = new URLSearchParams({ filter_number: number, page_size: String(PHONE_PAGE_SIZE) });
    let pagePath = `${listPath}?${query}`;
    const visited = new Set<string>();
    let match: SignalWirePhoneNumber | null = null;

    for (let page = 0; page < MAX_PHONE_PAGES; page += 1) {
      if (visited.has(pagePath)) throw malformed('SignalWire phone pagination contains a cycle.');
      visited.add(pagePath);
      const body = record(await this.request(
        pagePath,
        { method: 'GET', signal: options.signal },
        ['Numbers'],
      ), 'SignalWire phone list');
      if (!Array.isArray(body.data)) throw malformed('SignalWire phone list has no data array.');

      for (const value of body.data) {
        const phone = this.parsePhone(value);
        if (phone.number !== number) continue;
        if (match) throw malformed('SignalWire returned duplicate owned resources for one phone number.');
        match = phone;
      }

      const links = record(body.links, 'SignalWire phone pagination links');
      const next = optionalText(links.next);
      if (!next) return match;
      pagePath = this.safePagePath(next, listPath, 'phone');
    }
    throw malformed(`SignalWire phone pagination exceeded ${MAX_PHONE_PAGES} pages.`);
  }

  async createBrand(input: Readonly<{
    name: string;
    companyName: string;
    ein: string;
    einIssuingCountry?: string;
    entityType?: string;
    vertical?: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    email: string;
    phone: string;
    website: string;
    brandType?: string;
  }>): Promise<SignalWireBrand> {
    const payload = {
      name: input.name.trim(),
      company_name: input.companyName.trim(),
      ein: input.ein.trim(),
      ein_issuing_country: (input.einIssuingCountry ?? 'USA').trim(),
      entity_type: (input.entityType ?? 'PRIVATE_PROFIT').trim(),
      vertical: (input.vertical ?? 'HOME_SERVICES').trim(),
      street: input.street.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      postal_code: input.postalCode.trim(),
      country: (input.country ?? 'US').trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      website: input.website.trim(),
      brand_type: (input.brandType ?? 'STANDARD').trim(),
    };
    return this.parseBrand(await this.request(
      '/api/relay/rest/registry/beta/brands',
      { method: 'POST', body: JSON.stringify(payload) },
      ['Messaging', 'Numbers'],
    ));
  }

  async getBrand(brandId: string): Promise<SignalWireBrand> {
    if (!UUID.test(brandId)) throw new Error('SignalWire brand ID is invalid.');
    return this.parseBrand(await this.request(
      `/api/relay/rest/registry/beta/brands/${encodeURIComponent(brandId)}`,
      { method: 'GET' },
      ['Messaging', 'Numbers'],
    ), brandId);
  }

  async createCampaign(input: Readonly<{
    brandId: string;
    name: string;
    useCase: string;
    vertical?: string;
    description: string;
    messageFlow: string;
    sampleMessages: readonly string[];
    helpMessage?: string;
    optOutMessage?: string;
    optInMessage?: string;
    hasEmbeddedLinks?: boolean;
    hasEmbeddedPhone?: boolean;
    ageGated?: boolean;
    directLending?: boolean;
    subscriberOptIn?: boolean;
    subscriberOptOut?: boolean;
    subscriberHelp?: boolean;
    affiliateMarketing?: boolean;
  }>): Promise<SignalWireCampaign> {
    if (!UUID.test(input.brandId)) throw new Error('SignalWire brand ID is invalid.');
    const payload: Record<string, unknown> = {
      brand_id: input.brandId,
      name: input.name.trim(),
      usecase: input.useCase.trim(),
      vertical: (input.vertical ?? 'HOME_SERVICES').trim(),
      description: input.description.trim(),
      message_flow: input.messageFlow.trim(),
      embedded_link: input.hasEmbeddedLinks ?? true,
      embedded_phone: input.hasEmbeddedPhone ?? false,
      age_gated: input.ageGated ?? false,
      direct_lending: input.directLending ?? false,
      subscriber_optin: input.subscriberOptIn ?? true,
      subscriber_optout: input.subscriberOptOut ?? true,
      subscriber_help: input.subscriberHelp ?? true,
      affiliate_marketing: input.affiliateMarketing ?? false,
    };
    if (input.helpMessage) payload.help_message = input.helpMessage.trim();
    if (input.optOutMessage) payload.optout_message = input.optOutMessage.trim();
    if (input.optInMessage) payload.optin_message = input.optInMessage.trim();
    for (let i = 0; i < input.sampleMessages.length && i < 5; i += 1) {
      payload[`sample${i + 1}`] = input.sampleMessages[i].trim();
    }
    return this.parseCampaign(await this.request(
      '/api/relay/rest/registry/beta/campaigns',
      { method: 'POST', body: JSON.stringify(payload) },
      ['Messaging', 'Numbers'],
    ));
  }

  async getCampaign(campaignId: string): Promise<SignalWireCampaign> {
    if (!UUID.test(campaignId)) throw new Error('SignalWire campaign ID is invalid.');
    return this.parseCampaign(await this.request(
      `/api/relay/rest/registry/beta/campaigns/${encodeURIComponent(campaignId)}`,
      { method: 'GET' },
      ['Messaging', 'Numbers'],
    ), campaignId);
  }

  /**
   * Campaign GET does not expose its brand. Prove ownership by finding the
   * campaign under the exact brand-scoped list resource, following only
   * same-Space pagination links for that resource.
   */
  async campaignBelongsToBrand(input: Readonly<{ brandId: string; campaignId: string }>): Promise<boolean> {
    if (!UUID.test(input.brandId)) throw new Error('SignalWire brand ID is invalid.');
    if (!UUID.test(input.campaignId)) throw new Error('SignalWire campaign ID is invalid.');
    const listPath = `/api/relay/rest/registry/beta/brands/${encodeURIComponent(input.brandId)}/campaigns`;
    let pagePath = `${listPath}?page_size=${REGISTRY_PAGE_SIZE}`;
    const visited = new Set<string>();
    let found = false;

    for (let page = 0; page < MAX_REGISTRY_PAGES; page += 1) {
      if (visited.has(pagePath)) throw malformed('SignalWire campaign pagination contains a cycle.');
      visited.add(pagePath);
      const body = record(await this.request(
        pagePath,
        { method: 'GET' },
        ['Messaging', 'Numbers'],
      ), 'SignalWire brand campaign list');
      if (!Array.isArray(body.data)) throw malformed('SignalWire brand campaign list has no data array.');
      const ids = body.data.map((value) => requireText(record(value, 'SignalWire campaign').id, 'Campaign ID'));
      const matches = ids.filter((id) => id === input.campaignId).length;
      if (matches > 1 || (matches === 1 && found)) {
        throw malformed('SignalWire returned a duplicate campaign under one brand.');
      }
      if (matches === 1) found = true;

      const links = record(body.links, 'SignalWire campaign pagination links');
      const next = optionalText(links.next);
      if (!next) return found;
      pagePath = this.safePagePath(next, listPath, 'campaign');
    }
    throw malformed(`SignalWire campaign pagination exceeded ${MAX_REGISTRY_PAGES} pages.`);
  }

  async updatePhoneNumber(input: Readonly<{
    providerNumberId: string;
    number: string;
    friendlyName: string;
    inboundWebhookUrl: string;
  }>): Promise<SignalWirePhoneNumber> {
    if (!UUID.test(input.providerNumberId)) throw new Error('SignalWire phone number ID is invalid.');
    if (!E164.test(input.number)) throw new Error('Configured number must be E.164.');
    const inbound = secureCallbackUrl(input.inboundWebhookUrl, 'Inbound webhook');
    const updated = this.parsePhone(await this.request(
      `/api/relay/rest/phone_numbers/${encodeURIComponent(input.providerNumberId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: input.friendlyName.slice(0, 120),
          message_handler: 'laml_webhooks',
          message_request_url: inbound,
          message_request_method: 'POST',
        }),
      },
      ['Numbers'],
    ));
    if (updated.id !== input.providerNumberId || updated.number !== input.number) {
      throw malformed('SignalWire updated a different phone number than requested.');
    }
    if (
      updated.messageRequestUrl !== inbound
      || updated.messageHandler?.toLowerCase() !== 'laml_webhooks'
      || updated.messageRequestMethod?.toUpperCase() !== 'POST'
    ) {
      throw malformed('SignalWire did not confirm the requested inbound webhook configuration with POST.');
    }
    return updated;
  }

  async updateVoicePhoneNumber(input: Readonly<{
    providerNumberId: string;
    number: string;
    friendlyName: string;
    inboundWebhookUrl: string;
    statusCallbackUrl: string;
  }>): Promise<SignalWirePhoneNumber> {
    if (!UUID.test(input.providerNumberId)) throw new Error('SignalWire phone number ID is invalid.');
    if (!E164.test(input.number)) throw new Error('Configured number must be E.164.');
    const friendlyName = input.friendlyName.trim();
    if (!friendlyName) throw new Error('Voice phone number friendly name is required.');
    const inbound = secureCallbackUrl(input.inboundWebhookUrl, 'AI Voice inbound webhook');
    const status = secureCallbackUrl(input.statusCallbackUrl, 'AI Voice provider status callback');
    const updated = this.parsePhone(await this.request(
      `/api/relay/rest/phone_numbers/${encodeURIComponent(input.providerNumberId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: friendlyName.slice(0, 120),
          call_handler: 'relay_script',
          call_relay_script_url: inbound,
          call_request_url: inbound,
          call_request_method: 'POST',
          call_status_callback_url: status,
          call_status_callback_method: 'POST',
        }),
      },
      ['Numbers', 'Voice'],
    ));
    if (updated.id !== input.providerNumberId || updated.number !== input.number) {
      throw malformed('SignalWire updated a different phone number than requested.');
    }
    if (
      !updated.capabilities.includes('voice')
      || (updated.callHandler?.toLowerCase() !== 'laml_webhooks' && updated.callHandler?.toLowerCase() !== 'relay_script')
      || updated.callRequestUrl !== inbound
      || updated.callRequestMethod?.toUpperCase() !== 'POST'
      || updated.callStatusCallbackUrl !== status
      || updated.callStatusCallbackMethod?.toUpperCase() !== 'POST'
    ) {
      throw malformed('SignalWire did not confirm voice capability and the exact AI Voice inbound and provider-status POST configuration.');
    }
    return updated;
  }

  async assignNumberToCampaign(input: Readonly<{
    campaignId: string;
    number: string;
    statusCallbackUrl?: string | null;
  }>): Promise<SignalWireAssignmentOrder> {
    if (!UUID.test(input.campaignId)) throw new Error('SignalWire campaign ID is invalid.');
    if (!E164.test(input.number)) throw new Error('Assigned number must be E.164.');
    const payload: Record<string, unknown> = { phone_numbers: [input.number] };
    if (input.statusCallbackUrl) {
      payload.status_callback_url = secureCallbackUrl(input.statusCallbackUrl, 'Assignment callback');
    }
    return this.parseOrder(await this.request(
      `/api/relay/rest/registry/beta/campaigns/${encodeURIComponent(input.campaignId)}/orders`,
      { method: 'POST', body: JSON.stringify(payload) },
      ['Messaging', 'Numbers'],
    ));
  }

  async getAssignmentOrder(orderId: string): Promise<SignalWireAssignmentOrder> {
    if (!UUID.test(orderId)) throw new Error('SignalWire assignment order ID is invalid.');
    const order = this.parseOrder(await this.request(
      `/api/relay/rest/registry/beta/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET' },
      ['Messaging', 'Numbers'],
    ));
    if (order.id !== orderId) {
      throw malformed('SignalWire returned a different assignment order than requested.');
    }
    return order;
  }

  async getNumberAssignment(input: Readonly<{
    campaignId: string;
    number: string;
  }>): Promise<SignalWireNumberAssignment | null> {
    if (!UUID.test(input.campaignId)) throw new Error('SignalWire campaign ID is invalid.');
    if (!E164.test(input.number)) throw new Error('Assigned number must be E.164.');
    const assignmentPath = `/api/relay/rest/registry/beta/campaigns/${encodeURIComponent(input.campaignId)}/numbers`;
    let pagePath = `${assignmentPath}?page_size=${ASSIGNMENT_PAGE_SIZE}`;
    const visited = new Set<string>();
    let match: SignalWireNumberAssignment | null = null;

    for (let page = 0; page < MAX_ASSIGNMENT_PAGES; page += 1) {
      if (visited.has(pagePath)) throw malformed('SignalWire assignment pagination contains a cycle.');
      visited.add(pagePath);
      const body = record(await this.request(
        pagePath,
        { method: 'GET' },
        ['Messaging', 'Numbers'],
      ), 'SignalWire assignment list');
      if (!Array.isArray(body.data)) throw malformed('SignalWire assignment list has no data array.');

      const matches = body.data.map((value) => {
        const row = record(value, 'SignalWire assignment');
        const phone = record(row.phone_number, 'SignalWire assigned phone number');
        return {
          id: requireText(row.id, 'Assignment ID'),
          state: requireText(row.state, 'Assignment state').toLowerCase(),
          campaignId: requireText(row.campaign_id, 'Assignment campaign ID'),
          number: requireText(phone.number, 'Assigned phone number'),
          providerNumberId: optionalText(phone.id),
        } satisfies SignalWireNumberAssignment;
      }).filter((assignment) => assignment.number === input.number);
      if (matches.length > 1) throw malformed('SignalWire returned duplicate assignments for one number.');
      const pageMatch = matches[0] ?? null;
      if (pageMatch) {
        if (match) throw malformed('SignalWire returned duplicate assignments for one number.');
        if (pageMatch.campaignId !== input.campaignId) {
          throw malformed('SignalWire returned the number under a different campaign.');
        }
        match = pageMatch;
      }

      const links = record(body.links, 'SignalWire assignment pagination links');
      const next = optionalText(links.next);
      if (!next) return match;
      pagePath = this.safePagePath(next, assignmentPath, 'assignment');
    }
    throw malformed(`SignalWire assignment pagination exceeded ${MAX_ASSIGNMENT_PAGES} pages.`);
  }

  /** Keep Basic credentials on this Space and this one list resource only. */
  private safePagePath(next: string, expectedPathname: string, label: 'assignment' | 'campaign' | 'phone'): string {
    let page: URL;
    try {
      page = new URL(next, `${this.origin}/`);
    } catch {
      throw malformed(`SignalWire ${label} pagination link is not a URL.`);
    }
    if (
      page.origin !== this.origin
      || page.username
      || page.password
      || page.hash
      || page.pathname !== expectedPathname
    ) {
      const resource = label === 'assignment' ? 'campaign' : label === 'campaign' ? 'brand' : 'phone';
      throw malformed(`SignalWire ${label} pagination link left the requested ${resource} resource.`);
    }
    return `${page.pathname}${page.search}`;
  }

  private parsePhone(value: unknown): SignalWirePhoneNumber {
    const row = record(value, 'SignalWire phone number response');
    const id = requireText(row.id, 'Phone number ID');
    const number = requireText(row.number, 'Phone number');
    if (!UUID.test(id) || !E164.test(number)) throw malformed('SignalWire phone number identity is invalid.');
    return {
      id,
      number,
      name: optionalText(row.name),
      capabilities: Array.isArray(row.capabilities)
        ? row.capabilities
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
        : [],
      callHandler: optionalText(row.call_handler),
      callRelayScriptUrl: optionalText(row.call_relay_script_url),
      callRequestUrl: optionalText(row.call_relay_script_url) ?? optionalText(row.call_request_url),
      callRequestMethod: optionalText(row.call_request_method),
      callStatusCallbackUrl: optionalText(row.call_status_callback_url),
      callStatusCallbackMethod: optionalText(row.call_status_callback_method),
      messageHandler: optionalText(row.message_handler),
      messageRequestUrl: optionalText(row.message_request_url),
      messageRequestMethod: optionalText(row.message_request_method),
    };
  }

  private parseBrand(value: unknown, expectedId?: string): SignalWireBrand {
    const row = record(value, 'SignalWire brand response');
    const id = requireText(row.id, 'Brand ID');
    if (!UUID.test(id) || (expectedId && id !== expectedId)) {
      throw malformed('SignalWire brand identity is invalid.');
    }
    return {
      id,
      state: requireText(row.state, 'Brand state').toLowerCase(),
      name: requireText(row.name, 'Brand name'),
      companyName: requireText(row.company_name, 'Brand legal company name'),
      ein: requireText(row.ein, 'Brand EIN'),
      companyWebsite: requireText(row.company_website, 'Brand website'),
      entityType: optionalText(row.entity_type),
    };
  }

  private parseCampaign(value: unknown, expectedId?: string): SignalWireCampaign {
    const row = record(value, 'SignalWire campaign response');
    const id = requireText(row.id, 'Campaign ID');
    if (!UUID.test(id) || (expectedId && id !== expectedId)) {
      throw malformed('SignalWire campaign identity is invalid.');
    }
    return {
      id,
      state: requireText(row.state, 'Campaign state').toLowerCase(),
      name: requireText(row.name, 'Campaign name'),
      smsUseCase: requireText(row.sms_use_case, 'Campaign SMS use case'),
    };
  }

  private parseOrder(value: unknown): SignalWireAssignmentOrder {
    const row = record(value, 'SignalWire assignment order response');
    const id = requireText(row.id, 'Assignment order ID');
    if (!UUID.test(id)) throw malformed('SignalWire assignment order ID is invalid.');
    return {
      id,
      state: requireText(row.state, 'Assignment order state').toLowerCase(),
      statusCallbackUrl: optionalText(row.status_callback_url),
    };
  }
}
