/**
 * Phone Number & Recipient Timezone Resolution for FCC TCPA Compliance
 *
 * Under FCC TCPA rules (47 C.F.R. § 64.1200(c)(1) and FCC declaratory rulings / orders),
 * telemarketing and automated solicitations are prohibited before 8:00 AM or after 9:00 PM
 * local time at the CALLED PARTY'S location (recipient local time).
 *
 * This module provides North American Numbering Plan (NANP) area code mapping,
 * geographic location / state parsing, and conservative quiet-hours calculations
 * to guarantee that communications are evaluated against the called party's local time.
 */

// Mapping of NANP area codes (NPA) to primary IANA timezone
const AREA_CODE_TIMEZONE_MAP: Record<string, string> = {
  // --- Eastern Time (America/New_York) ---
  '201': 'America/New_York', // NJ
  '202': 'America/New_York', // DC
  '203': 'America/New_York', // CT
  '207': 'America/New_York', // ME
  '212': 'America/New_York', // NY
  '215': 'America/New_York', // PA
  '216': 'America/New_York', // OH
  '219': 'America/New_York', // IN (Northwest)
  '220': 'America/New_York', // OH
  '223': 'America/New_York', // PA
  '229': 'America/New_York', // GA
  '231': 'America/New_York', // MI
  '234': 'America/New_York', // OH
  '239': 'America/New_York', // FL
  '240': 'America/New_York', // MD
  '248': 'America/New_York', // MI
  '252': 'America/New_York', // NC
  '260': 'America/New_York', // IN
  '267': 'America/New_York', // PA
  '269': 'America/New_York', // MI
  '272': 'America/New_York', // PA
  '276': 'America/New_York', // VA
  '301': 'America/New_York', // MD
  '302': 'America/New_York', // DE
  '304': 'America/New_York', // WV
  '305': 'America/New_York', // FL
  '313': 'America/New_York', // MI
  '315': 'America/New_York', // NY
  '317': 'America/New_York', // IN
  '321': 'America/New_York', // FL
  '330': 'America/New_York', // OH
  '332': 'America/New_York', // NY
  '336': 'America/New_York', // NC
  '339': 'America/New_York', // MA
  '347': 'America/New_York', // NY
  '351': 'America/New_York', // MA
  '352': 'America/New_York', // FL
  '380': 'America/New_York', // OH
  '386': 'America/New_York', // FL
  '401': 'America/New_York', // RI
  '404': 'America/New_York', // GA
  '407': 'America/New_York', // FL
  '410': 'America/New_York', // MD
  '412': 'America/New_York', // PA
  '413': 'America/New_York', // MA
  '419': 'America/New_York', // OH
  '423': 'America/New_York', // TN (East)
  '434': 'America/New_York', // VA
  '440': 'America/New_York', // OH
  '443': 'America/New_York', // MD
  '463': 'America/New_York', // IN
  '470': 'America/New_York', // GA
  '475': 'America/New_York', // CT
  '478': 'America/New_York', // GA
  '484': 'America/New_York', // PA
  '502': 'America/New_York', // KY
  '508': 'America/New_York', // MA
  '513': 'America/New_York', // OH
  '516': 'America/New_York', // NY
  '517': 'America/New_York', // MI
  '518': 'America/New_York', // NY
  '540': 'America/New_York', // VA
  '551': 'America/New_York', // NJ
  '561': 'America/New_York', // FL
  '567': 'America/New_York', // OH
  '570': 'America/New_York', // PA
  '571': 'America/New_York', // VA
  '574': 'America/New_York', // IN
  '585': 'America/New_York', // NY
  '586': 'America/New_York', // MI
  '603': 'America/New_York', // NH
  '606': 'America/New_York', // KY
  '607': 'America/New_York', // NY
  '609': 'America/New_York', // NJ
  '610': 'America/New_York', // PA
  '614': 'America/New_York', // OH
  '616': 'America/New_York', // MI
  '617': 'America/New_York', // MA
  '631': 'America/New_York', // NY
  '640': 'America/New_York', // NJ
  '646': 'America/New_York', // NY
  '667': 'America/New_York', // MD
  '678': 'America/New_York', // GA
  '680': 'America/New_York', // NY
  '681': 'America/New_York', // WV
  '689': 'America/New_York', // FL
  '703': 'America/New_York', // VA
  '704': 'America/New_York', // NC
  '706': 'America/New_York', // GA
  '716': 'America/New_York', // NY
  '717': 'America/New_York', // PA
  '718': 'America/New_York', // NY
  '724': 'America/New_York', // PA
  '727': 'America/New_York', // FL
  '732': 'America/New_York', // NJ
  '734': 'America/New_York', // MI
  '740': 'America/New_York', // OH
  '743': 'America/New_York', // NC
  '754': 'America/New_York', // FL
  '757': 'America/New_York', // VA
  '762': 'America/New_York', // GA
  '765': 'America/New_York', // IN
  '770': 'America/New_York', // GA
  '772': 'America/New_York', // FL
  '774': 'America/New_York', // MA
  '781': 'America/New_York', // MA
  '786': 'America/New_York', // FL
  '802': 'America/New_York', // VT
  '803': 'America/New_York', // SC
  '804': 'America/New_York', // VA
  '810': 'America/New_York', // MI
  '812': 'America/New_York', // IN
  '813': 'America/New_York', // FL
  '814': 'America/New_York', // PA
  '826': 'America/New_York', // VA
  '828': 'America/New_York', // NC
  '838': 'America/New_York', // NY
  '843': 'America/New_York', // SC
  '845': 'America/New_York', // NY
  '848': 'America/New_York', // NJ
  '854': 'America/New_York', // SC
  '856': 'America/New_York', // NJ
  '857': 'America/New_York', // MA
  '859': 'America/New_York', // KY
  '860': 'America/New_York', // CT
  '862': 'America/New_York', // NJ
  '863': 'America/New_York', // FL
  '864': 'America/New_York', // SC
  '865': 'America/New_York', // TN (East)
  '878': 'America/New_York', // PA
  '904': 'America/New_York', // FL
  '906': 'America/New_York', // MI
  '908': 'America/New_York', // NJ
  '910': 'America/New_York', // NC
  '912': 'America/New_York', // GA
  '914': 'America/New_York', // NY
  '917': 'America/New_York', // NY
  '919': 'America/New_York', // NC
  '929': 'America/New_York', // NY
  '930': 'America/New_York', // IN
  '934': 'America/New_York', // NY
  '937': 'America/New_York', // OH
  '941': 'America/New_York', // FL
  '947': 'America/New_York', // MI
  '948': 'America/New_York', // VA
  '954': 'America/New_York', // FL
  '959': 'America/New_York', // CT
  '973': 'America/New_York', // NJ
  '978': 'America/New_York', // MA
  '980': 'America/New_York', // NC
  '984': 'America/New_York', // NC
  '989': 'America/New_York', // MI

  // --- Central Time (America/Chicago) ---
  '205': 'America/Chicago', // AL
  '210': 'America/Chicago', // TX
  '214': 'America/Chicago', // TX
  '217': 'America/Chicago', // IL
  '218': 'America/Chicago', // MN
  '224': 'America/Chicago', // IL
  '225': 'America/Chicago', // LA
  '228': 'America/Chicago', // MS
  '251': 'America/Chicago', // AL
  '254': 'America/Chicago', // TX
  '256': 'America/Chicago', // AL
  '262': 'America/Chicago', // WI
  '270': 'America/Chicago', // KY
  '281': 'America/Chicago', // TX
  '308': 'America/Chicago', // NE
  '309': 'America/Chicago', // IL
  '312': 'America/Chicago', // IL
  '314': 'America/Chicago', // MO
  '316': 'America/Chicago', // KS
  '318': 'America/Chicago', // LA
  '319': 'America/Chicago', // IA
  '320': 'America/Chicago', // MN
  '325': 'America/Chicago', // TX
  '331': 'America/Chicago', // IL
  '334': 'America/Chicago', // AL
  '337': 'America/Chicago', // LA
  '346': 'America/Chicago', // TX
  '361': 'America/Chicago', // TX
  '364': 'America/Chicago', // KY
  '402': 'America/Chicago', // NE
  '405': 'America/Chicago', // OK
  '409': 'America/Chicago', // TX
  '414': 'America/Chicago', // WI
  '417': 'America/Chicago', // MO
  '430': 'America/Chicago', // TX
  '432': 'America/Chicago', // TX
  '448': 'America/Chicago', // FL
  '469': 'America/Chicago', // TX
  '479': 'America/Chicago', // AR
  '501': 'America/Chicago', // AR
  '504': 'America/Chicago', // LA
  '507': 'America/Chicago', // MN
  '512': 'America/Chicago', // TX
  '515': 'America/Chicago', // IA
  '531': 'America/Chicago', // NE
  '534': 'America/Chicago', // WI
  '539': 'America/Chicago', // OK
  '563': 'America/Chicago', // IA
  '573': 'America/Chicago', // MO
  '580': 'America/Chicago', // OK
  '601': 'America/Chicago', // MS
  '605': 'America/Chicago', // SD
  '608': 'America/Chicago', // WI
  '612': 'America/Chicago', // MN
  '615': 'America/Chicago', // TN
  '618': 'America/Chicago', // IL
  '620': 'America/Chicago', // KS
  '629': 'America/Chicago', // TN
  '630': 'America/Chicago', // IL
  '636': 'America/Chicago', // MO
  '641': 'America/Chicago', // IA
  '651': 'America/Chicago', // MN
  '659': 'America/Chicago', // AL
  '660': 'America/Chicago', // MO
  '662': 'America/Chicago', // MS
  '682': 'America/Chicago', // TX
  '701': 'America/Chicago', // ND
  '708': 'America/Chicago', // IL
  '712': 'America/Chicago', // IA
  '713': 'America/Chicago', // TX
  '715': 'America/Chicago', // WI
  '726': 'America/Chicago', // TX
  '731': 'America/Chicago', // TN
  '737': 'America/Chicago', // TX
  '763': 'America/Chicago', // MN
  '769': 'America/Chicago', // MS
  '773': 'America/Chicago', // IL
  '779': 'America/Chicago', // IL
  '785': 'America/Chicago', // KS
  '806': 'America/Chicago', // TX
  '815': 'America/Chicago', // IL
  '816': 'America/Chicago', // MO
  '817': 'America/Chicago', // TX
  '830': 'America/Chicago', // TX
  '832': 'America/Chicago', // TX
  '847': 'America/Chicago', // IL
  '850': 'America/Chicago', // FL (Panhandle)
  '870': 'America/Chicago', // AR
  '872': 'America/Chicago', // IL
  '901': 'America/Chicago', // TN
  '903': 'America/Chicago', // TX
  '913': 'America/Chicago', // KS
  '918': 'America/Chicago', // OK
  '920': 'America/Chicago', // WI
  '931': 'America/Chicago', // TN
  '936': 'America/Chicago', // TX
  '938': 'America/Chicago', // AL
  '940': 'America/Chicago', // TX
  '952': 'America/Chicago', // MN
  '956': 'America/Chicago', // TX
  '972': 'America/Chicago', // TX
  '979': 'America/Chicago', // TX
  '985': 'America/Chicago', // LA

  // --- Mountain Time (America/Denver) ---
  '208': 'America/Denver', // ID
  '303': 'America/Denver', // CO
  '307': 'America/Denver', // WY
  '385': 'America/Denver', // UT
  '406': 'America/Denver', // MT
  '435': 'America/Denver', // UT
  '505': 'America/Denver', // NM
  '575': 'America/Denver', // NM
  '719': 'America/Denver', // CO
  '720': 'America/Denver', // CO
  '801': 'America/Denver', // UT
  '915': 'America/Denver', // TX (El Paso)
  '970': 'America/Denver', // CO
  '986': 'America/Denver', // ID

  // --- Arizona (America/Phoenix - MST no DST) ---
  '480': 'America/Phoenix', // AZ
  '520': 'America/Phoenix', // AZ
  '602': 'America/Phoenix', // AZ
  '623': 'America/Phoenix', // AZ
  '928': 'America/Phoenix', // AZ

  // --- Pacific Time (America/Los_Angeles) ---
  '206': 'America/Los_Angeles', // WA
  '209': 'America/Los_Angeles', // CA
  '213': 'America/Los_Angeles', // CA
  '253': 'America/Los_Angeles', // WA
  '279': 'America/Los_Angeles', // CA
  '310': 'America/Los_Angeles', // CA
  '323': 'America/Los_Angeles', // CA
  '341': 'America/Los_Angeles', // CA
  '360': 'America/Los_Angeles', // WA
  '408': 'America/Los_Angeles', // CA
  '415': 'America/Los_Angeles', // CA
  '424': 'America/Los_Angeles', // CA
  '425': 'America/Los_Angeles', // WA
  '442': 'America/Los_Angeles', // CA
  '458': 'America/Los_Angeles', // OR
  '503': 'America/Los_Angeles', // OR
  '509': 'America/Los_Angeles', // WA
  '510': 'America/Los_Angeles', // CA
  '530': 'America/Los_Angeles', // CA
  '541': 'America/Los_Angeles', // OR
  '559': 'America/Los_Angeles', // CA
  '562': 'America/Los_Angeles', // CA
  '564': 'America/Los_Angeles', // WA
  '619': 'America/Los_Angeles', // CA
  '626': 'America/Los_Angeles', // CA
  '628': 'America/Los_Angeles', // CA
  '650': 'America/Los_Angeles', // CA
  '657': 'America/Los_Angeles', // CA
  '661': 'America/Los_Angeles', // CA
  '669': 'America/Los_Angeles', // CA
  '702': 'America/Los_Angeles', // NV
  '707': 'America/Los_Angeles', // CA
  '714': 'America/Los_Angeles', // CA
  '725': 'America/Los_Angeles', // NV
  '747': 'America/Los_Angeles', // CA
  '760': 'America/Los_Angeles', // CA
  '775': 'America/Los_Angeles', // NV
  '805': 'America/Los_Angeles', // CA
  '818': 'America/Los_Angeles', // CA
  '820': 'America/Los_Angeles', // CA
  '831': 'America/Los_Angeles', // CA
  '858': 'America/Los_Angeles', // CA
  '909': 'America/Los_Angeles', // CA
  '916': 'America/Los_Angeles', // CA
  '925': 'America/Los_Angeles', // CA
  '949': 'America/Los_Angeles', // CA
  '951': 'America/Los_Angeles', // CA
  '971': 'America/Los_Angeles', // OR

  // --- Alaska (America/Anchorage) ---
  '907': 'America/Anchorage', // AK

  // --- Hawaii (Pacific/Honolulu) ---
  '808': 'Pacific/Honolulu', // HI

  // --- Puerto Rico & US Virgin Islands (America/Puerto_Rico) ---
  '787': 'America/Puerto_Rico', // PR
  '939': 'America/Puerto_Rico', // PR
  '340': 'America/Puerto_Rico', // VI

  // --- Canada ---
  '204': 'America/Winnipeg',
  '236': 'America/Vancouver',
  '249': 'America/Toronto',
  '250': 'America/Vancouver',
  '289': 'America/Toronto',
  '306': 'America/Winnipeg',
  '343': 'America/Toronto',
  '365': 'America/Toronto',
  '403': 'America/Edmonton',
  '416': 'America/Toronto',
  '418': 'America/Toronto',
  '431': 'America/Winnipeg',
  '437': 'America/Toronto',
  '438': 'America/Toronto',
  '450': 'America/Toronto',
  '506': 'America/Halifax',
  '514': 'America/Toronto',
  '579': 'America/Toronto',
  '581': 'America/Toronto',
  '587': 'America/Edmonton',
  '604': 'America/Vancouver',
  '613': 'America/Toronto',
  '639': 'America/Winnipeg',
  '647': 'America/Toronto',
  '672': 'America/Vancouver',
  '705': 'America/Toronto',
  '709': 'America/St_Johns',
  '778': 'America/Vancouver',
  '780': 'America/Edmonton',
  '782': 'America/Halifax',
  '807': 'America/Toronto',
  '819': 'America/Toronto',
  '825': 'America/Edmonton',
  '867': 'America/Edmonton',
  '873': 'America/Toronto',
  '902': 'America/Halifax',
  '905': 'America/Toronto',
};

// Mapping of 2-letter US State Codes to Primary IANA Timezone
const STATE_TIMEZONE_MAP: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/New_York',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/New_York',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  PR: 'America/Puerto_Rico',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  VI: 'America/Puerto_Rico',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
};

/**
 * Validates whether a given timezone string is recognized by the Intl engine.
 */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the 3-digit NANP area code from a phone string.
 */
export function extractAreaCode(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return digits.slice(0, 3);
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1, 4);
  }
  if (digits.length > 11 && digits.startsWith('1')) {
    return digits.slice(1, 4);
  }
  return null;
}

/**
 * Resolves the primary IANA timezone for a given US/Canada phone number.
 */
export function getTimeZoneFromPhone(phone: string | null | undefined): string | null {
  const areaCode = extractAreaCode(phone);
  if (!areaCode) return null;
  return AREA_CODE_TIMEZONE_MAP[areaCode] ?? null;
}

/**
 * Attempts to parse a state abbreviation or location from an address/city string.
 */
export function getTimeZoneFromLocation(locationText: string | null | undefined): string | null {
  if (!locationText || typeof locationText !== 'string') return null;

  // Match state code patterns: "Austin, TX", "Austin, TX 78701", "Seattle, WA", "Miami FL"
  const stateMatch = locationText.match(/\b([A-Z]{2})\b(?:\s+\d{5})?$/i)
    || locationText.match(/,\s*([A-Za-z]{2})(?:\s|$|\b)/);

  if (stateMatch && stateMatch[1]) {
    const code = stateMatch[1].toUpperCase();
    if (STATE_TIMEZONE_MAP[code]) {
      return STATE_TIMEZONE_MAP[code];
    }
  }

  // Check for common full state names
  const lower = locationText.toLowerCase();
  if (lower.includes('california')) return 'America/Los_Angeles';
  if (lower.includes('texas')) return 'America/Chicago';
  if (lower.includes('florida')) return 'America/New_York';
  if (lower.includes('new york')) return 'America/New_York';
  if (lower.includes('washington')) return 'America/Los_Angeles';
  if (lower.includes('illinois')) return 'America/Chicago';
  if (lower.includes('arizona')) return 'America/Phoenix';
  if (lower.includes('colorado')) return 'America/Denver';
  if (lower.includes('ohio')) return 'America/New_York';
  if (lower.includes('michigan')) return 'America/New_York';
  if (lower.includes('georgia')) return 'America/New_York';
  if (lower.includes('north carolina')) return 'America/New_York';
  if (lower.includes('pennsylvania')) return 'America/New_York';
  if (lower.includes('hawaii')) return 'Pacific/Honolulu';
  if (lower.includes('alaska')) return 'America/Anchorage';

  return null;
}

export type RecipientLocationParams = {
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  explicitTimeZone?: string | null;
  accountTimeZone?: string | null;
};

/**
 * Resolves the called party's (recipient's) local time zone in compliance with FCC TCPA rules.
 *
 * Precedence:
 * 1. Explicit valid recipient time zone (if provided)
 * 2. Inferred from recipient phone number area code (NANP)
 * 3. Inferred from recipient address / city / state
 * 4. Account local operating time zone (contractor's registered time zone)
 * 5. Default fallback to 'America/New_York'
 */
export function resolveRecipientTimeZone(params: RecipientLocationParams): string {
  // 1. Explicit timezone
  if (params.explicitTimeZone && isValidTimeZone(params.explicitTimeZone)) {
    return params.explicitTimeZone;
  }

  // 2. Recipient phone area code
  if (params.phone) {
    const tzFromPhone = getTimeZoneFromPhone(params.phone);
    if (tzFromPhone && isValidTimeZone(tzFromPhone)) {
      return tzFromPhone;
    }
  }

  // 3. Recipient address / city / state
  const locationCandidate = params.state || params.address || params.city || params.postalCode;
  const tzFromLocation = getTimeZoneFromLocation(locationCandidate);
  if (tzFromLocation && isValidTimeZone(tzFromLocation)) {
    return tzFromLocation;
  }

  // 4. Account operating timezone
  if (params.accountTimeZone && isValidTimeZone(params.accountTimeZone)) {
    return params.accountTimeZone;
  }

  // 5. Safe default
  return 'America/New_York';
}

/**
 * Checks whether a given timestamp falls within TCPA quiet hours (9:00 PM to 8:00 AM local time).
 * Under FCC rules (47 CFR § 64.1200(c)(1)), calls and marketing texts are prohibited before 8 AM or after 9 PM
 * local time at the called party's location.
 */
export function isWithinTcpaQuietHours(
  date = new Date(),
  timeZone = 'America/New_York',
  quietStartHour = 21,
  quietEndHour = 8
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    });
    const localHour = parseInt(formatter.format(date), 10);
    // Quiet hours: at or after 9:00 PM (21:00) or before 8:00 AM (08:00)
    return localHour >= quietStartHour || localHour < quietEndHour;
  } catch {
    // Fallback using UTC-5 if timezone is invalid
    const hour = date.getUTCHours() - 5;
    const normalizedHour = (hour + 24) % 24;
    return normalizedHour >= quietStartHour || normalizedHour < quietEndHour;
  }
}

/**
 * Calculates compliant delivery time for messages received during TCPA quiet hours.
 * If received overnight in the recipient's local timezone, rolls forward to 8:01 AM
 * in the recipient's local time zone the next morning.
 */
export function getTcpaCompliantSendTime(
  date = new Date(),
  timeZone = 'America/New_York',
  quietStartHour = 21,
  quietEndHour = 8
): {
  isDelayed: boolean;
  sendAt: Date;
  reason?: string;
  localHour?: number;
  timeZone: string;
} {
  const isQuiet = isWithinTcpaQuietHours(date, timeZone, quietStartHour, quietEndHour);
  if (!isQuiet) {
    return {
      isDelayed: false,
      sendAt: date,
      timeZone,
    };
  }

  // Calculate the next 8:01 AM in the recipient's local timezone
  const sendAt = calculateNextPermissibleSendTime(date, timeZone, quietEndHour, 1);

  return {
    isDelayed: true,
    sendAt,
    timeZone,
    reason: `Queued for 8:01 AM recipient-local delivery to comply with FCC TCPA quiet hours (9:00 PM – 8:00 AM ${timeZone}).`,
  };
}

/**
 * Computes the exact UTC Date corresponding to the next morning's compliant start hour (e.g. 8:01 AM)
 * in the specified IANA timezone.
 */
export function calculateNextPermissibleSendTime(
  date: Date,
  timeZone: string,
  targetHour = 8,
  targetMinute = 1
): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  const localYear = getPart('year');
  const localMonth = getPart('month');
  const localDay = getPart('day');
  const localHour = getPart('hour');

  let targetYear = localYear;
  let targetMonth = localMonth;
  let targetDay = localDay;

  // If after midday / evening, advance to tomorrow morning in recipient's timezone
  if (localHour >= 12) {
    const nextDay = new Date(Date.UTC(localYear, localMonth - 1, localDay + 1));
    targetYear = nextDay.getUTCFullYear();
    targetMonth = nextDay.getUTCMonth() + 1;
    targetDay = nextDay.getUTCDate();
  }

  // Iterate to find the exact UTC epoch mapping to target local time
  const targetUtcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, 0);
  let guess = new Date(targetUtcMs);

  for (let i = 0; i < 3; i++) {
    const guessParts = formatter.formatToParts(guess);
    const gYear = parseInt(guessParts.find((p) => p.type === 'year')?.value ?? '0', 10);
    const gMonth = parseInt(guessParts.find((p) => p.type === 'month')?.value ?? '0', 10);
    const gDay = parseInt(guessParts.find((p) => p.type === 'day')?.value ?? '0', 10);
    const gHour = parseInt(guessParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const gMin = parseInt(guessParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    const gSec = parseInt(guessParts.find((p) => p.type === 'second')?.value ?? '0', 10);

    const currentLocalMs = Date.UTC(gYear, gMonth - 1, gDay, gHour, gMin, gSec);
    const diff = targetUtcMs - currentLocalMs;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}
