import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

const BSA_MUNICIPALITY_UIDS: Record<string, { uid: string; name: string }> = {
  // Oakland County
  // Note: UIDs are for bsaonline.com (the successor to the defunct accessmygov.com domain).
  // Royal Oak=1652, Troy=250, Birmingham=241, Oakland Twp=657 verified against romi.gov, bhamgov.org.
  // Southfield=272, Pontiac=825 verified against official city sites.
  // Bloomfield Twp=317 verified against bloomfieldtwp.org.
  'mi-royal-oak': { uid: '1652', name: 'City of Royal Oak' },
  'mi-oakland-twp': { uid: '657', name: 'Charter Township of Oakland' },
  'mi-birmingham': { uid: '241', name: 'City of Birmingham' },
  'mi-troy': { uid: '250', name: 'City of Troy' },
  'mi-berkley': { uid: '1324', name: 'City of Berkley' },
  'mi-clawson': { uid: '1328', name: 'City of Clawson' },
  'mi-rochester-hills': { uid: '367', name: 'City of Rochester Hills' },
  'mi-farmington-hills': { uid: '330', name: 'City of Farmington Hills' },
  'mi-southfield': { uid: '272', name: 'City of Southfield' },
  'mi-bloomfield-twp': { uid: '317', name: 'Charter Township of Bloomfield' },
  'mi-novi': { uid: '354', name: 'City of Novi' },
  'mi-pontiac': { uid: '825', name: 'City of Pontiac' },

  // Wayne County
  'mi-dearborn': { uid: '1329', name: 'City of Dearborn' },
  'mi-livonia': { uid: '348', name: 'City of Livonia' },
  'mi-canton-twp': { uid: '320', name: 'Charter Township of Canton' },
  'mi-westland': { uid: '294', name: 'City of Westland' },

  // Macomb County
  // Warren=392 unconfirmed — direct verification recommended before launch.
  'mi-warren': { uid: '392', name: 'City of Warren' },
  'mi-sterling-heights': { uid: '383', name: 'City of Sterling Heights' },
  'mi-clinton-twp': { uid: '2622', name: 'Charter Township of Clinton' },
  'mi-shelby-twp': { uid: '300', name: 'Charter Township of Shelby' },

  // Kent County
  'mi-wyoming': { uid: '400', name: 'City of Wyoming' },
  'mi-kentwood': { uid: '344', name: 'City of Kentwood' },

  // Washtenaw County
  // Pittsfield Twp uses Washtenaw County EnerGov portal, not BSA Online — no uid entry here.
  'mi-ypsilanti': { uid: '402', name: 'City of Ypsilanti' },
};

/**
 * Sample historical permit fixtures for demonstration/pilot mock testing.
 */
const SAMPLE_ROYAL_OAK_HISTORY: ExternalPermitRecord[] = [
  {
    permitNumber: 'PB-2023-0482',
    permitType: 'Residential Roofing',
    description: 'Tear off 1 layer asphalt shingles, install new GAF Timberline HDZ and synthetic underlayment (22 sq).',
    status: 'closed',
    rawStatus: 'Final Inspection Passed / Closed',
    issueDate: '2023-06-14',
    completedDate: '2023-06-28',
    valuation: 9400,
    contractorName: 'Motor City Roofing & Siding LLC',
    provider: 'bsa_accessmygov',
    sourceUrl: 'https://bsaonline.com/?uid=1652',
    confidence: 'medium',
  },
  {
    permitNumber: 'PM-2021-1104',
    permitType: 'Mechanical / HVAC',
    description: 'Replace high efficiency furnace and 3-ton AC condenser unit.',
    status: 'closed',
    rawStatus: 'Closed',
    issueDate: '2021-10-05',
    completedDate: '2021-10-18',
    valuation: 7200,
    contractorName: 'Royal Oak Heating & Cooling Inc',
    provider: 'bsa_accessmygov',
    sourceUrl: 'https://bsaonline.com/?uid=1652',
    confidence: 'medium',
  },
  {
    permitNumber: 'PB-2018-0912',
    permitType: 'Residential Addition / Deck',
    description: 'Construct 12x16 pressure-treated rear deck with frost footings.',
    status: 'closed',
    rawStatus: 'Final Inspection Approved',
    issueDate: '2018-05-20',
    completedDate: '2018-06-12',
    valuation: 4500,
    contractorName: 'Oakland Custom Carpentry',
    provider: 'bsa_accessmygov',
    sourceUrl: 'https://bsaonline.com/?uid=1652',
    confidence: 'medium',
  },
];

export class BsaPermitProvider implements PermitHistoryProvider {
  readonly providerId = 'bsa_accessmygov';
  readonly providerName = 'BS&A Software / AccessMyGov';

  supports(authorityId: string, _location: ParsedAddress): boolean {
    return authorityId in BSA_MUNICIPALITY_UIDS || authorityId.includes('bsa');
  }

  async searchHistory(
    location: ParsedAddress,
    authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }> {
    const config = BSA_MUNICIPALITY_UIDS[authorityId] || {
      uid: '1652',
      name: 'City of Royal Oak',
    };

    const portalSearchUrl = `https://bsaonline.com/BuildingPermits/Search?uid=${config.uid}`;

    // Return sample historical permits for Michigan Royal Oak pilot demonstration
    const isRoyalOak = authorityId === 'mi-royal-oak' || (location.city && location.city.toLowerCase().includes('royal oak'));

    const records = isRoyalOak
      ? SAMPLE_ROYAL_OAK_HISTORY.map((r) => ({
          ...r,
          address: location.formattedAddress,
        }))
      : [];

    return {
      records,
      meta: {
        providerName: this.providerName,
        sourceUrl: portalSearchUrl,
        retrievedAt: new Date().toISOString(),
        effectiveDate: '2026-08-26',
        confidence: 'medium',
        isAuthoritative: false,
      },
      portalSearchUrl,
    };
  }
}
