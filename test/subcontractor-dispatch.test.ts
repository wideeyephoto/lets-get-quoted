import { describe, it, expect } from 'vitest';
import {
  ALREADY_CLAIMED_MESSAGE,
  LINK_PLACEHOLDER,
  createOfferToken,
  draftOfferMessage,
  expiryLabel,
  formatPay,
  formatTimeRemaining,
  formatWindow,
  hashOfferToken,
  isValidOfferToken,
  offerLink,
  offerMessageProblem,
  offerOutcome,
  offerTokenSecret,
  personalizeOfferMessage,
  rankCandidates,
  requestDisplayStatus,
  requestDraftProblem,
  requestProgress,
  generalLocationFrom,
  requirementLines,
  scheduleLabel,
  type DispatchOffer,
  type DispatchRequest,
  type MatchCandidate,
} from '@/lib/subcontractor-dispatch';
import {
  complianceFor,
  formatResponseTime,
  medianMinutes,
  normalizeWorkerType,
  shapeSubcontractorProfile,
  subDisplayName,
  subMetrics,
  type SubcontractorProfile,
} from '@/lib/subcontractors';
import { readSubcontractorForm, subcontractorColumns, subcontractorProblem } from '@/lib/subcontractor-form';
import { summarizeRequests } from '@/app/dashboard/crew/JobRequests';

const TODAY = '2026-08-13';
const NOW = new Date('2026-08-13T10:00:00.000Z');

/**
 * Overrides are RAW COLUMN NAMES, not the shaped type's camelCase.
 *
 * shapeSubcontractorProfile reads a database row, so a helper that took
 * `insuranceExpiresOn` would hand it a key it does not look at — every override
 * silently ignored and every compliance assertion passing against the default.
 * Which is exactly what happened the first time this file was written.
 */
function profile(overrides: Record<string, unknown> = {}): SubcontractorProfile {
  return shapeSubcontractorProfile({
    worker_type: 'subcontractor',
    company_name: 'Apex Plumbing',
    trades: ['Plumbing', 'Gas fitting'],
    skills: ['Tankless'],
    license_number: 'MI-71-02345',
    license_expires_on: '2027-01-01',
    insurance_carrier: 'Hartford',
    insurance_expires_on: '2027-01-01',
    w9_status: 'on_file',
    agreement_status: 'signed',
    sub_status: 'active',
    ...overrides,
  });
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  const shaped = overrides.compliance ? null : profile();
  return {
    crewId: 'c1',
    name: 'AJ Rivera',
    companyName: 'Apex Plumbing',
    trades: ['Plumbing', 'Gas fitting'],
    skills: ['Tankless'],
    subStatus: 'active',
    active: true,
    emergencyAvailable: false,
    availabilityNote: null,
    travelRadiusMiles: 25,
    coord: { lat: 42.49, lng: -83.14 },
    compliance: shaped ? complianceFor(shaped, TODAY) : overrides.compliance!,
    metrics: subMetrics({ offers: [], reviews: [], completedJobs: 0 }),
    conflicts: [],
    hasPhone: true,
    ...overrides,
  };
}

function request(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    id: 'r1',
    jobId: 'j1',
    status: 'sent',
    workDescription: 'Gas water heater replacement',
    serviceDate: '2026-08-15',
    windowStart: '09:00',
    windowEnd: '11:00',
    generalLocation: 'Royal Oak, MI',
    payAmount: 650,
    payKind: 'fixed',
    requiredTrade: 'Gas fitting',
    requiredSkills: [],
    requiresLicense: true,
    requiresInsurance: true,
    expiresAt: '2026-08-13T22:00:00.000Z',
    selectionMode: 'first_accept',
    documentPaths: [],
    messageBody: '',
    claimedOfferId: null,
    claimedCrewId: null,
    claimedAt: null,
    sentAt: '2026-08-13T09:00:00.000Z',
    createdAt: '2026-08-13T09:00:00.000Z',
    ...overrides,
  };
}

function offer(overrides: Partial<DispatchOffer> = {}): DispatchOffer {
  return {
    id: 'o1',
    requestId: 'r1',
    crewId: 'c1',
    status: 'sent',
    phone: '+13135550123',
    body: '',
    distanceMiles: 8,
    matchReason: null,
    sentAt: '2026-08-13T09:00:00.000Z',
    deliveredAt: null,
    viewedAt: null,
    respondedAt: null,
    declineReason: null,
    question: null,
    backup: false,
    ...overrides,
  };
}

// ============================================================================
// Worker type — the field that decides which half of the directory somebody is
// in, and the one that must never guess wrong on an un-migrated row.
// ============================================================================

describe('worker type', () => {
  it('treats anything that is not the literal subcontractor string as an employee', () => {
    expect(normalizeWorkerType('subcontractor')).toBe('subcontractor');
    expect(normalizeWorkerType('employee')).toBe('employee');
    // The case that matters: a row read before the migration has no column at
    // all. Resolving that to 'subcontractor' would reclassify a payroll
    // employee, which is a tax question rather than a display bug.
    expect(normalizeWorkerType(undefined)).toBe('employee');
    expect(normalizeWorkerType(null)).toBe('employee');
    expect(normalizeWorkerType('SUBCONTRACTOR')).toBe('employee');
  });

  it('names a firm by its company, and a sole trader by their own name', () => {
    expect(subDisplayName('AJ Rivera', 'Apex Plumbing')).toBe('Apex Plumbing');
    expect(subDisplayName('AJ Rivera', null)).toBe('AJ Rivera');
    expect(subDisplayName('AJ Rivera', '   ')).toBe('AJ Rivera');
  });
});

describe('creating a subcontractor', () => {
  function form(values: Record<string, string | string[]>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (Array.isArray(value)) value.forEach((entry) => data.append(key, entry));
      else data.set(key, value);
    }
    return data;
  }

  it('reads the whole profile off the form', () => {
    const values = readSubcontractorForm(
      form({
        name: 'AJ Rivera',
        companyName: 'Apex Plumbing',
        phone: '(248) 555-0117',
        email: 'AJ@ApexPlumbing.com',
        trades: ['Plumbing', 'Gas fitting'],
        skills: 'Tankless, Permit pulling',
        serviceArea: 'Oakland County',
        travelRadiusMiles: '25',
        availabilityNote: 'Weekdays',
        emergencyAvailable: 'on',
        ratePreference: 'fixed',
        minimumCharge: '150',
        licenseNumber: 'MI-71-02345',
        licenseExpiresOn: '2027-01-01',
        insuranceCarrier: 'Hartford',
        insuranceExpiresOn: '2027-03-01',
        w9Status: 'on_file',
        agreementStatus: 'signed',
        paymentTerms: 'Net 15',
        subStatus: 'preferred',
      }),
    );

    expect(values.companyName).toBe('Apex Plumbing');
    expect(values.trades).toEqual(['Plumbing', 'Gas fitting']);
    expect(values.skills).toEqual(['Tankless', 'Permit pulling']);
    expect(values.travelRadiusMiles).toBe(25);
    expect(values.emergencyAvailable).toBe(true);
    expect(values.subStatus).toBe('preferred');
    // Lower-cased on the way in, so a lookup never has two spellings of one
    // address to choose between.
    expect(values.email).toBe('aj@apexplumbing.com');
  });

  it('merges the trade checkboxes with the free-text field, case-insensitively', () => {
    // Both controls post to `trades`. Somebody who ticks HVAC and also types
    // "hvac, Septic" must end up with two trades, not three.
    const values = readSubcontractorForm(form({ name: 'A', phone: '2485550117', trades: ['HVAC', 'hvac, Septic'] }));
    expect(values.trades).toEqual(['HVAC', 'Septic']);
  });

  it('refuses a subcontractor with no phone, because an offer is a text', () => {
    const values = readSubcontractorForm(form({ name: 'AJ', phone: '', trades: ['Plumbing'] }));
    expect(subcontractorProblem(values)).toMatch(/mobile number/i);
  });

  it('refuses one with no trade, because the trade is what decides who gets offered work', () => {
    const values = readSubcontractorForm(form({ name: 'AJ', phone: '2485550117' }));
    expect(subcontractorProblem(values)).toMatch(/trade/i);
  });

  it('refuses a number too short to text', () => {
    const values = readSubcontractorForm(form({ name: 'AJ', phone: '248555', trades: ['Plumbing'] }));
    expect(subcontractorProblem(values)).toMatch(/ten digits/i);
  });

  it('always writes worker_type, so a subcontractor cannot be saved as an employee', () => {
    const values = readSubcontractorForm(form({ name: 'AJ', phone: '2485550117', trades: ['Plumbing'] }));
    expect(subcontractorColumns(values).worker_type).toBe('subcontractor');
  });
});

// ============================================================================
// Compliance
// ============================================================================

describe('compliance', () => {
  it('is fine when everything is current', () => {
    const result = complianceFor(profile(), TODAY);
    expect(result.overall).toBe('ok');
    expect(result.licenseOk).toBe(true);
    expect(result.insuranceOk).toBe(true);
  });

  it('calls insurance that lapsed yesterday expired, not expiring', () => {
    const result = complianceFor(profile({ insurance_expires_on: '2026-08-12' }), TODAY);
    expect(result.overall).toBe('expired');
    expect(result.insuranceOk).toBe(false);
  });

  it('warns inside thirty days but still counts it as cover', () => {
    // A certificate that runs out mid-job is the expensive version of this
    // problem, so it is flagged — but it is in force today, and refusing to let
    // an owner use a firm whose renewal is three weeks out would be wrong.
    const result = complianceFor(profile({ insurance_expires_on: '2026-09-01' }), TODAY);
    expect(result.overall).toBe('expiring');
    expect(result.insuranceOk).toBe(true);
  });

  it('treats missing paperwork as incomplete without blocking a job that does not ask for it', () => {
    const result = complianceFor(profile({ w9_status: 'missing', agreement_status: 'missing' }), TODAY);
    expect(result.overall).toBe('missing');
    expect(result.licenseOk).toBe(true);
    expect(result.insuranceOk).toBe(true);
  });

  it('reports the worst of the three, not the first', () => {
    const result = complianceFor(
      profile({ license_expires_on: '2026-09-01', insurance_expires_on: '2020-01-01' }),
      TODAY,
    );
    expect(result.overall).toBe('expired');
  });
});

// ============================================================================
// Metrics
// ============================================================================

describe('subcontractor metrics', () => {
  it('does not count a queued offer against an acceptance rate', () => {
    const metrics = subMetrics({
      offers: [
        { status: 'queued', sentAt: null, respondedAt: null },
        { status: 'accepted', sentAt: '2026-08-01T10:00:00Z', respondedAt: '2026-08-01T10:06:00Z' },
        { status: 'declined', sentAt: '2026-08-02T10:00:00Z', respondedAt: '2026-08-02T10:30:00Z' },
      ],
      reviews: [],
      completedJobs: 0,
    });
    expect(metrics.offered).toBe(2);
    expect(metrics.acceptanceRate).toBe(0.5);
  });

  it('uses the median response, so one overnight reply cannot describe four fast ones', () => {
    // Mean would be 110 minutes and describe none of the five.
    expect(medianMinutes([2, 3, 4, 5, 540])).toBe(4);
    expect(medianMinutes([])).toBeNull();
    expect(medianMinutes([10, 20])).toBe(15);
  });

  it('averages the four scored dimensions across every review', () => {
    const metrics = subMetrics({
      offers: [],
      completedJobs: 3,
      reviews: [
        { workQuality: 5, communication: 5, onTime: 4, cleanliness: 4, withinPrice: true, hireAgain: true },
        { workQuality: 5, communication: 5, onTime: 5, cleanliness: 5, withinPrice: true, hireAgain: false },
      ],
    });
    expect(metrics.rating).toBe(4.8);
    expect(metrics.reviewCount).toBe(2);
    expect(metrics.hireAgainRate).toBe(0.5);
    expect(metrics.completed).toBe(3);
  });

  it('says nothing rather than zero when there is no history', () => {
    const metrics = subMetrics({ offers: [], reviews: [], completedJobs: 0 });
    expect(metrics.acceptanceRate).toBeNull();
    expect(metrics.rating).toBeNull();
    expect(metrics.responseMinutes).toBeNull();
    expect(formatResponseTime(null)).toBe('—');
  });

  it('reads a response time the way a person says one', () => {
    expect(formatResponseTime(6)).toBe('6m');
    expect(formatResponseTime(80)).toBe('1h 20m');
    expect(formatResponseTime(120)).toBe('2h');
    expect(formatResponseTime(0.5)).toBe('under a minute');
  });
});

// ============================================================================
// Matching
// ============================================================================

describe('matching and recipient selection', () => {
  const requirements = {
    requiredTrade: 'Gas fitting',
    requiredSkills: [],
    requiresLicense: true,
    requiresInsurance: true,
    jobCoord: { lat: 42.5, lng: -83.15 },
  };

  it('puts a preferred, compliant, close, free firm at the top', () => {
    const ranked = rankCandidates(
      [
        candidate({ crewId: 'far', name: 'Far Firm', coord: { lat: 43.6, lng: -83.9 } }),
        candidate({ crewId: 'pref', name: 'Preferred Firm', subStatus: 'preferred' }),
        candidate({ crewId: 'backup', name: 'Backup Firm', subStatus: 'backup' }),
      ],
      requirements,
    );
    expect(ranked[0].candidate.crewId).toBe('pref');
    expect(ranked[0].recommended).toBe(true);
  });

  it('blocks a firm that does not list the required trade, but still shows them with the reason', () => {
    const ranked = rankCandidates([candidate({ crewId: 'painter', trades: ['Painting'] })], requirements);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].eligible).toBe(false);
    expect(ranked[0].blockers).toContain('Does not list Gas fitting');
  });

  it('blocks expired insurance when the job insists on it', () => {
    const expired = profile({ insurance_expires_on: '2020-01-01' });
    const ranked = rankCandidates([candidate({ compliance: complianceFor(expired, TODAY) })], requirements);
    expect(ranked[0].eligible).toBe(false);
    expect(ranked[0].blockers).toContain('Insurance not current');
  });

  it('does not block expired insurance when the job does not ask for it', () => {
    const expired = profile({ insurance_expires_on: '2020-01-01' });
    const ranked = rankCandidates([candidate({ compliance: complianceFor(expired, TODAY) })], {
      ...requirements,
      requiresInsurance: false,
      requiresLicense: false,
    });
    expect(ranked[0].eligible).toBe(true);
  });

  it('blocks a firm with no phone number — an offer it can never receive', () => {
    const ranked = rankCandidates([candidate({ hasPhone: false })], requirements);
    expect(ranked[0].eligible).toBe(false);
    expect(ranked[0].blockers).toContain('No mobile number on file');
  });

  it('warns about a schedule conflict without forbidding it', () => {
    // A two-hour water heater on a day they are already out is the sub's call.
    const ranked = rankCandidates([candidate({ conflicts: ['J-1031'] })], requirements);
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[0].recommended).toBe(false);
    expect(ranked[0].reasons.join(' ')).toContain('J-1031');
  });

  it('warns when a job is past a firm’s own travel radius, and still lets you ask', () => {
    const ranked = rankCandidates(
      [candidate({ travelRadiusMiles: 1, coord: { lat: 42.9, lng: -83.6 } })],
      requirements,
    );
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[0].reasons.join(' ')).toMatch(/past their 1 mi radius/);
  });

  it('never recommends an archived firm and never lets one be sent an offer', () => {
    const ranked = rankCandidates([candidate({ subStatus: 'archived' }), candidate({ crewId: 'x', active: false })], requirements);
    expect(ranked.every((entry) => !entry.eligible)).toBe(true);
    expect(ranked.every((entry) => !entry.recommended)).toBe(true);
  });

  it('sorts every ineligible firm below every eligible one', () => {
    const ranked = rankCandidates(
      [
        candidate({ crewId: 'blocked', subStatus: 'preferred', trades: ['Painting'] }),
        candidate({ crewId: 'ok', subStatus: 'backup' }),
      ],
      requirements,
    );
    expect(ranked[0].candidate.crewId).toBe('ok');
  });

  it('measures the distance and says it in the reason', () => {
    const ranked = rankCandidates([candidate()], requirements);
    expect(ranked[0].distanceMiles).not.toBeNull();
    expect(ranked[0].reasons.some((reason) => /mi away/.test(reason))).toBe(true);
  });
});

// ============================================================================
// Statuses, progress and the countdown
// ============================================================================

describe('request status', () => {
  it('is expired the instant its window closes, with no cron involved', () => {
    const past = request({ expiresAt: '2026-08-13T09:59:00.000Z' });
    expect(requestDisplayStatus(past, [offer()], NOW)).toBe('expired');
  });

  it('reads as viewed once somebody has opened their link', () => {
    expect(requestDisplayStatus(request(), [offer({ viewedAt: '2026-08-13T09:30:00Z' })], NOW)).toBe('viewed');
  });

  it('reads as partially responded once anybody has actually answered', () => {
    expect(requestDisplayStatus(request(), [offer({ status: 'declined' }), offer({ id: 'o2' })], NOW)).toBe(
      'partially_responded',
    );
  });

  it('leaves a claimed request claimed even after its original deadline passes', () => {
    const claimed = request({ status: 'claimed', expiresAt: '2026-08-13T09:00:00.000Z', claimedOfferId: 'o1' });
    expect(requestDisplayStatus(claimed, [offer({ status: 'accepted' })], NOW)).toBe('claimed');
  });

  it('leaves a draft alone', () => {
    expect(requestDisplayStatus(request({ status: 'draft' }), [], NOW)).toBe('draft');
  });

  it('counts what happened without letting a view undo a send', () => {
    const progress = requestProgress(
      request(),
      [
        offer({ id: 'a', status: 'viewed', viewedAt: '2026-08-13T09:10:00Z' }),
        offer({ id: 'b', status: 'declined' }),
        offer({ id: 'c', status: 'failed' }),
        offer({ id: 'd', status: 'queued' }),
      ],
      NOW,
    );
    expect(progress.recipients).toBe(4);
    expect(progress.sent).toBe(3);
    expect(progress.viewed).toBe(1);
    expect(progress.declined).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.minutesRemaining).toBe(12 * 60);
  });

  it('stops counting down once the request is settled', () => {
    const claimed = request({ status: 'claimed', claimedOfferId: 'o1' });
    expect(requestProgress(claimed, [], NOW).minutesRemaining).toBeNull();
    expect(formatTimeRemaining(null)).toBe('Closed');
  });

  it('says the time left the way a person reads it', () => {
    expect(formatTimeRemaining(45)).toBe('45m left');
    expect(formatTimeRemaining(200)).toBe('3h 20m left');
    expect(formatTimeRemaining(0)).toBe('Expired');
  });
});

// ============================================================================
// The message
// ============================================================================

describe('the offer message', () => {
  const draft = draftOfferMessage({
    businessName: 'BrokePipes',
    workDescription: 'Water heater replacement',
    generalLocation: 'Royal Oak',
    whenLabel: 'Friday 9–11 AM',
    payAmount: 650,
    expiresLabel: '6 PM',
  });

  it('reads like the example, and carries no private detail', () => {
    expect(draft).toBe(
      'New subcontract job from BrokePipes: Water heater replacement in Royal Oak, Friday 9–11 AM. Pay $650. Review and accept by 6 PM: [secure link]',
    );
    expect(draft).not.toMatch(/\d+\s+\w+\s+(St|Street|Ave|Avenue|Rd|Road)/i);
  });

  it('gives every recipient their own link', () => {
    const a = personalizeOfferMessage(draft, 'https://x.test/sub/aaa');
    const b = personalizeOfferMessage(draft, 'https://x.test/sub/bbb');
    expect(a).toContain('https://x.test/sub/aaa');
    expect(a).not.toContain(LINK_PLACEHOLDER);
    expect(a).not.toBe(b);
  });

  it('appends a link rather than dropping one when the placeholder was deleted', () => {
    expect(personalizeOfferMessage('Can you take this?', 'https://x.test/sub/aaa')).toBe(
      'Can you take this? https://x.test/sub/aaa',
    );
  });

  it('refuses to send a message with no placeholder in it', () => {
    // Without it every recipient would get the same link, and the first person
    // to forward it could hand the job to somebody who was never asked.
    expect(offerMessageProblem('Come and do this job please')).toMatch(/secure link/);
    expect(offerMessageProblem('')).toMatch(/Write the message/);
    expect(offerMessageProblem(draft)).toBeNull();
  });

  it('refuses one long enough to cost three segments', () => {
    expect(offerMessageProblem(`${'x'.repeat(400)} ${LINK_PLACEHOLDER}`)).toMatch(/keep it under 320/);
  });

  it('formats money and windows the way they are spoken', () => {
    expect(formatPay(650)).toBe('$650');
    expect(formatPay(85, 'hourly')).toBe('$85/hr');
    expect(formatWindow('09:00', '11:00')).toBe('9–11 AM');
    expect(formatWindow('11:00', '14:00')).toBe('11 AM–2 PM');
    expect(scheduleLabel({ serviceDate: '2026-08-15', windowStart: '09:00', windowEnd: '11:00' })).toBe(
      'Saturday, Aug 15 · 9–11 AM',
    );
  });

  it('does not slide a date-only day backwards in a western timezone', () => {
    // Parsed at UTC noon on purpose — the classic way "Friday" becomes
    // "Thursday" for anybody west of Greenwich.
    expect(scheduleLabel({ serviceDate: '2026-08-14', windowStart: null, windowEnd: null })).toContain('Friday');
  });

  it('says the deadline relative to today', () => {
    expect(expiryLabel('2026-08-13T22:00:00.000Z', new Date('2026-08-13T10:00:00.000Z'), 'UTC')).toBe('10:00 PM today');
    expect(expiryLabel('2026-08-15T22:00:00.000Z', new Date('2026-08-13T10:00:00.000Z'), 'UTC')).toBe('10:00 PM Sat');
  });
});

// ============================================================================
// Tokens
// ============================================================================

describe('offer tokens', () => {
  it('mints an unguessable token and stores only its hash', () => {
    const { token, tokenHash } = createOfferToken();

    /* A SHAPE, NOT A SUBSTRING. This asserted `token` did not contain "r1" —
       a guard against the old row-reference ids, written as a search for two
       characters that occur in random base64url about once every sixty runs.
       It failed that often, on a suite nothing else in it could explain.
       32 random bytes as base64url is 43 characters, then the signature. */
    const [secret, signature] = token.split('.');
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(40);

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    // The hash is not reversible into a working link, which is the point of
    // storing it rather than the token.
    expect(token).not.toContain(tokenHash);
  });

  /**
   * What "non-sequential" is actually worth asserting. A counter-based scheme —
   * r1, r2, offer-1 — passes a substring check the moment you rename it, and
   * fails every line of this.
   */
  it('is not a counter wearing a disguise', () => {
    const secrets = Array.from({ length: 50 }, () => createOfferToken().token.split('.')[0]);

    // A counter shares a prefix; 50 random 43-character secrets do not all
    // start with the same character (64^-49, so this is not a coin flip).
    expect(new Set(secrets.map((s) => s[0])).size).toBeGreaterThan(1);

    // A counter sorts back into the order it was minted in. Random values do
    // not, and the odds of 50 of them doing so by accident are 1 in 50!.
    expect([...secrets].sort()).not.toEqual(secrets);

    // And none is reachable by extending another.
    for (const secret of secrets) {
      expect(secrets.filter((other) => other.startsWith(secret))).toHaveLength(1);
    }
  });

  it('mints a different token every time', () => {
    const seen = new Set(Array.from({ length: 25 }, () => createOfferToken().token));
    expect(seen.size).toBe(25);
  });

  it('verifies its own signature, so a made-up token never reaches the database', () => {
    const { token } = createOfferToken();
    expect(isValidOfferToken(token)).toBe(true);
    expect(hashOfferToken(token)).not.toBeNull();

    expect(isValidOfferToken('nonsense')).toBe(false);
    expect(isValidOfferToken(null)).toBe(false);
    expect(isValidOfferToken('')).toBe(false);
    // A real secret with a forged signature.
    const forged = `${offerTokenSecret(token)}.AAAAAAAAAAAAAAAAAAAAAA`;
    expect(isValidOfferToken(forged)).toBe(false);
    expect(hashOfferToken(forged)).toBeNull();
  });

  it('round-trips one token to one hash', () => {
    const { token, tokenHash } = createOfferToken();
    expect(hashOfferToken(token)).toBe(tokenHash);
  });

  it('puts no database id in the public URL', () => {
    const { token } = createOfferToken();
    const link = offerLink(token, 'https://letsgetquoted.com');
    expect(link).toBe(`https://letsgetquoted.com/sub/${token}`);
    expect(link).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no uuid
  });
});

// ============================================================================
// Validation
// ============================================================================

describe('creating a job request', () => {
  const valid = {
    jobId: 'j1',
    workDescription: 'Gas water heater replacement',
    generalLocation: 'Royal Oak, MI',
    payAmount: 650,
    expiresAt: '2026-08-13T22:00:00.000Z',
    serviceDate: '2026-08-15',
    windowStart: '09:00',
    windowEnd: '11:00',
    requiredTrade: 'Gas fitting',
  };

  it('accepts a complete one', () => {
    expect(requestDraftProblem(valid, NOW)).toBeNull();
  });

  it('insists on a general location, and says why', () => {
    expect(requestDraftProblem({ ...valid, generalLocation: '' }, NOW)).toMatch(/Never the full address/);
  });

  it('refuses an expiration that has already passed', () => {
    expect(requestDraftProblem({ ...valid, expiresAt: '2026-08-13T09:00:00.000Z' }, NOW)).toMatch(/already passed/);
  });

  it('refuses a backwards arrival window', () => {
    expect(requestDraftProblem({ ...valid, windowStart: '14:00', windowEnd: '11:00' }, NOW)).toMatch(/end after it starts/);
  });

  it('refuses a window with no date to hang it on', () => {
    expect(requestDraftProblem({ ...valid, serviceDate: null }, NOW)).toMatch(/date the arrival window/);
  });

  it('refuses an offer that pays nothing', () => {
    expect(requestDraftProblem({ ...valid, payAmount: 0 }, NOW)).toMatch(/gets paid/);
  });

  it('lists the requirements a subcontractor is shown', () => {
    expect(requirementLines(request())).toEqual([
      'Gas fitting',
      'Valid trade license',
      'Current liability insurance',
    ]);
  });

  it('reduces a street address to a city and state, dropping the ZIP', () => {
    expect(generalLocationFrom('1420 N Main St, Royal Oak, MI 48067')).toBe('Royal Oak, MI');
    expect(generalLocationFrom('Royal Oak, MI')).toBe('Royal Oak, MI');
    expect(generalLocationFrom(null)).toBe('');
    expect(generalLocationFrom('No commas here')).toBe('');
  });
});

// ============================================================================
// What a subcontractor is told
// ============================================================================

describe('the outcome a subcontractor sees', () => {
  it('is open while the offer is live', () => {
    expect(offerOutcome(offer(), request(), NOW)).toEqual({ kind: 'open' });
  });

  it('is "already claimed" for anybody whose offer was covered', () => {
    expect(offerOutcome(offer({ status: 'covered' }), request({ status: 'claimed', claimedOfferId: 'other' }), NOW)).toEqual({
      kind: 'claimed',
    });
    expect(ALREADY_CLAIMED_MESSAGE).toBe('This job has already been claimed.');
  });

  it('is expired once the window shuts, whatever the offer still says', () => {
    expect(offerOutcome(offer(), request({ expiresAt: '2026-08-13T09:00:00.000Z' }), NOW)).toEqual({ kind: 'expired' });
  });

  it('separates a hand up from a claim in collect-interest mode', () => {
    const interest = request({ selectionMode: 'collect_interest' });
    expect(offerOutcome(offer({ status: 'accepted' }), interest, NOW)).toEqual({ kind: 'interested' });
    // Once the owner picks, the request is claimed and the surviving accepted
    // offer can only be the winner's — everybody else was covered.
    const chosen = request({ selectionMode: 'collect_interest', status: 'claimed', claimedOfferId: 'o1' });
    expect(offerOutcome(offer({ status: 'accepted' }), chosen, NOW)).toEqual({ kind: 'accepted' });
  });
});

// ============================================================================
// The four summary cards
// ============================================================================

describe('the job-requests summary', () => {
  const entryFor = (
    overrides: Partial<DispatchRequest>,
    offers: Array<Partial<DispatchOffer>>,
  ) => ({
    request: request(overrides),
    offers: offers.map((entry) => ({ ...offer(entry), crewName: 'X', companyName: null, displayName: 'X', won: false, providerId: null, errorReason: null })),
    job: null,
  });

  it('counts only requests still waiting on cover as open', () => {
    const summary = summarizeRequests(
      [
        entryFor({ id: 'a' }, [{}]),
        entryFor({ id: 'b', status: 'claimed', claimedOfferId: 'x', claimedAt: '2026-08-05T00:00:00Z' }, []),
        entryFor({ id: 'c', status: 'cancelled' }, []),
        entryFor({ id: 'd', expiresAt: '2026-08-01T00:00:00Z' }, []),
      ] as never,
      NOW,
    );
    expect(summary.openRequests).toBe(1);
  });

  it('counts jobs filled inside the current month only', () => {
    const summary = summarizeRequests(
      [
        entryFor({ id: 'a', status: 'claimed', claimedOfferId: 'x', claimedAt: '2026-08-05T00:00:00Z' }, []),
        entryFor({ id: 'b', status: 'claimed', claimedOfferId: 'y', claimedAt: '2026-07-05T00:00:00Z' }, []),
      ] as never,
      NOW,
    );
    expect(summary.filledThisMonth).toBe(1);
  });

  it('computes response rate over offers actually sent, not offers queued', () => {
    const summary = summarizeRequests(
      [
        entryFor({ id: 'a' }, [
          { id: '1', status: 'declined', respondedAt: '2026-08-13T09:10:00Z' },
          { id: '2', status: 'sent' },
          { id: '3', status: 'queued', sentAt: null },
        ]),
      ] as never,
      NOW,
    );
    // Two were sent, one answered.
    expect(summary.responseRate).toBe(0.5);
    expect(summary.responseMinutes).toBe(10);
  });

  it('says nothing rather than 0% when nothing has been sent', () => {
    const summary = summarizeRequests([], NOW);
    expect(summary.responseRate).toBeNull();
    expect(summary.responseMinutes).toBeNull();
    expect(summary.openRequests).toBe(0);
  });
});
