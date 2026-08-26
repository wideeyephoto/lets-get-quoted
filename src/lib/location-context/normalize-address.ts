import type { ParsedAddress } from './types';

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const VALID_STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));

/**
 * Normalizes and parses a free-text US address string into structured parts.
 */
export function normalizeAddress(rawAddress: string | null | undefined): ParsedAddress {
  if (!rawAddress || !rawAddress.trim()) {
    return {
      raw: '',
      formattedAddress: '',
      isValid: false,
    };
  }

  const raw = rawAddress.trim();
  const cleaned = raw.replace(/\s+/g, ' ');

  // Standard comma-separated check: "123 Main St, Royal Oak, MI 48067" or "123 Main St Apt 4B, Royal Oak, MI 48067"
  const commaParts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);

  let streetNumber: string | undefined;
  let streetName: string | undefined;
  let unitOrApt: string | undefined;
  let city: string | undefined;
  let state: string | undefined;
  let postalCode: string | undefined;

  // Extract 5-digit or 5+4 zip code from the end if present
  const zipMatch = cleaned.match(/\b(\d{5}(?:-\d{4})?)\b$/);
  if (zipMatch) {
    postalCode = zipMatch[1];
  }

  if (commaParts.length >= 3) {
    // Street is part 0, City is part 1, State/Zip is part 2+
    const streetLine = commaParts[0];
    city = commaParts[1];

    const stateZipLine = commaParts.slice(2).join(' ').trim();
    const stateMatch = stateZipLine.match(/\b([a-zA-Z]{2})\b/);
    if (stateMatch && VALID_STATE_ABBRS.has(stateMatch[1].toUpperCase())) {
      state = stateMatch[1].toUpperCase();
    } else {
      // Check full state name
      for (const [full, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
        if (new RegExp(`\\b${full}\\b`, 'i').test(stateZipLine)) {
          state = abbr;
          break;
        }
      }
    }

    // Parse street line for number, name, unit
    parseStreetLine(streetLine, (num, name, unit) => {
      streetNumber = num;
      streetName = name;
      unitOrApt = unit;
    });
  } else if (commaParts.length === 2) {
    // "123 Main St, Royal Oak MI 48067"
    const streetLine = commaParts[0];
    const cityStateZip = commaParts[1];

    parseStreetLine(streetLine, (num, name, unit) => {
      streetNumber = num;
      streetName = name;
      unitOrApt = unit;
    });

    // Try to extract State, Zip, and remaining as City
    const parts = cityStateZip.split(' ').map((s) => s.trim()).filter(Boolean);
    const lastWord = parts[parts.length - 1];
    const secondLastWord = parts.length > 1 ? parts[parts.length - 2] : '';

    if (postalCode && lastWord.startsWith(postalCode.slice(0, 5))) {
      parts.pop(); // remove zip
    }

    if (parts.length > 0) {
      const candidateState = parts[parts.length - 1].toUpperCase();
      if (VALID_STATE_ABBRS.has(candidateState)) {
        state = candidateState;
        parts.pop();
      }
    }

    city = parts.join(' ');
  } else {
    // Single line without commas: "123 Main St Royal Oak MI 48067"
    const words = cleaned.split(' ').filter(Boolean);

    // Look for state near zip
    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i].replace(/[^\w]/g, '').toUpperCase();
      if (VALID_STATE_ABBRS.has(word)) {
        state = word;
        // Assume words after state might be zip, words between street and state are city
        const beforeState = words.slice(0, i);
        if (beforeState.length >= 2) {
          // crude split: first two words might be number + street name, last word before state is city
          streetNumber = beforeState[0];
          if (/^\d+[A-Za-z]?$/.test(streetNumber)) {
            streetName = beforeState.slice(1, -1).join(' ');
            city = beforeState[beforeState.length - 1];
          }
        }
        break;
      }
    }
  }

  // Clean unit from streetName if not isolated
  if (!unitOrApt && streetName) {
    const unitMatch = streetName.match(/(?:apt|suite|ste|unit|#)\s*([a-zA-Z0-9_-]+)/i);
    if (unitMatch) {
      unitOrApt = unitMatch[0];
      streetName = streetName.replace(unitMatch[0], '').trim();
    }
  }

  const formattedParts = [];
  if (streetNumber && streetName) {
    formattedParts.push(`${streetNumber} ${streetName}${unitOrApt ? ` ${unitOrApt}` : ''}`);
  } else if (commaParts[0]) {
    formattedParts.push(commaParts[0]);
  }

  if (city) {
    formattedParts.push(city);
  }

  if (state && postalCode) {
    formattedParts.push(`${state} ${postalCode}`);
  } else if (state) {
    formattedParts.push(state);
  } else if (postalCode) {
    formattedParts.push(postalCode);
  }

  const formattedAddress = formattedParts.join(', ') || cleaned;
  const isValid = Boolean((streetName || streetNumber) && (city || postalCode));

  return {
    raw,
    streetNumber,
    streetName,
    unitOrApt,
    city: city ? titleCase(city) : undefined,
    state: state?.toUpperCase(),
    postalCode,
    formattedAddress,
    isValid,
  };
}

function parseStreetLine(
  streetLine: string,
  onParsed: (num?: string, name?: string, unit?: string) => void,
) {
  const match = streetLine.match(/^(\d+[\w-]*)\s+(.+)$/);
  if (match) {
    const num = match[1];
    let rest = match[2];
    let unit: string | undefined;

    const unitMatch = rest.match(/\b(?:apt|suite|ste|unit|#)\s*([a-zA-Z0-9_-]+)/i);
    if (unitMatch) {
      unit = unitMatch[0];
      rest = rest.replace(unitMatch[0], '').trim();
    }

    onParsed(num, rest, unit);
  } else {
    onParsed(undefined, streetLine, undefined);
  }
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}
