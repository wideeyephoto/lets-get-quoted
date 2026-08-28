import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

const BSA_MUNICIPALITY_UIDS: Record<string, { uid: string; name: string }> = {
  // Oakland County
  'mi-royal-oak': { uid: '1349', name: 'City of Royal Oak' },
  'mi-oakland-twp': { uid: '1342', name: 'Charter Township of Oakland' },
  'mi-birmingham': { uid: '1326', name: 'City of Birmingham' },
  'mi-troy': { uid: '1355', name: 'City of Troy' },
  'mi-berkley': { uid: '1324', name: 'City of Berkley' },
  'mi-clawson': { uid: '1328', name: 'City of Clawson' },
  'mi-rochester-hills': { uid: '367', name: 'City of Rochester Hills' },
  'mi-farmington-hills': { uid: '330', name: 'City of Farmington Hills' },
  'mi-southfield': { uid: '380', name: 'City of Southfield' },
  'mi-bloomfield-twp': { uid: '317', name: 'Charter Township of Bloomfield' },
  'mi-novi': { uid: '354', name: 'City of Novi' },
  'mi-pontiac': { uid: '364', name: 'City of Pontiac' },

  // Wayne County
  'mi-dearborn': { uid: '1329', name: 'City of Dearborn' },
  'mi-livonia': { uid: '348', name: 'City of Livonia' },
  'mi-canton-twp': { uid: '320', name: 'Charter Township of Canton' },
  'mi-westland': { uid: '396', name: 'City of Westland' },

  // Macomb County
  'mi-warren': { uid: '392', name: 'City of Warren' },
  'mi-sterling-heights': { uid: '383', name: 'City of Sterling Heights' },
  'mi-clinton-twp': { uid: '323', name: 'Charter Township of Clinton' },
  'mi-shelby-twp': { uid: '376', name: 'Charter Township of Shelby' },

  // Kent County
  'mi-wyoming': { uid: '400', name: 'City of Wyoming' },
  'mi-kentwood': { uid: '344', name: 'City of Kentwood' },

  // Washtenaw County
  'mi-ypsilanti': { uid: '402', name: 'City of Ypsilanti' },
  'mi-pittsfield-twp': { uid: '362', name: 'Charter Township of Pittsfield' },
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
    sourceUrl: 'https://www.accessmygov.com/?uid=1349',
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
    sourceUrl: 'https://www.accessmygov.com/?uid=1349',
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
    sourceUrl: 'https://www.accessmygov.com/?uid=1349',
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
      uid: '1349',
      name: 'City of Royal Oak',
    };

    const portalSearchUrl = `https://www.accessmygov.com/BuildingPermits/Search?uid=${config.uid}`;

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
