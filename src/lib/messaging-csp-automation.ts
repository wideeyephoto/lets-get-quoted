import 'server-only';

import {
  buildStandardContractorCampaignPayload,
  effectiveBrandName,
} from '@/lib/messaging-contractor-campaign-template';
import type { MessagingRegistrationApplication } from '@/lib/messaging-number-provisioning';
import {
  STANDARD_10DLC_CARRIER_FEES,
  type CarrierFeeItem,
} from '@/lib/messaging-pilot-ledger';
import {
  SignalWireNumberProvisioningClient,
  type SignalWireBrand,
  type SignalWireCampaign,
} from '@/lib/signalwire-number-provisioning';

export type AutoCspRegistrationResult = Readonly<{
  success: boolean;
  brand: SignalWireBrand;
  campaign: SignalWireCampaign;
  brandBelongsToCampaign: boolean;
  applicableFees: readonly CarrierFeeItem[];
  timestamp: string;
}>;

/**
 * Automate Downstream TCR Brand and Campaign Registration for a contractor.
 *
 * Uses the proven, standard contractor customer operations campaign template
 * and the verified tax identity to provision a downstream TCR Brand & Campaign.
 */
export async function automateDownstreamBrandAndCampaign(input: {
  client: SignalWireNumberProvisioningClient;
  application: Pick<
    MessagingRegistrationApplication,
    | 'id'
    | 'legalBusinessName'
    | 'dbaName'
    | 'businessType'
    | 'websiteUrl'
    | 'businessEmail'
    | 'businessPhone'
    | 'addressLine1'
    | 'city'
    | 'region'
    | 'postalCode'
    | 'messagingSupportEmail'
    | 'messagingSupportPhone'
    | 'providerBrandId'
    | 'providerCampaignId'
  >;
  verifiedEin: string;
}): Promise<AutoCspRegistrationResult> {
  const { client, application, verifiedEin } = input;
  const brandName = effectiveBrandName({
    legalBusinessName: application.legalBusinessName,
    dbaName: application.dbaName,
  });

  // 1. Create or retrieve downstream TCR Brand
  let brand: SignalWireBrand;
  if (application.providerBrandId) {
    brand = await client.getBrand(application.providerBrandId);
  } else {
    const entityTypeMap: Record<string, string> = {
      sole_proprietor: 'SOLE_PROPRIETORSHIP',
      llc: 'PRIVATE_PROFIT',
      corporation: 'PRIVATE_PROFIT',
      partnership: 'PARTNERSHIP',
      nonprofit: 'NON_PROFIT',
      other: 'PRIVATE_PROFIT',
    };

    brand = await client.createBrand({
      name: brandName,
      companyName: application.legalBusinessName,
      ein: verifiedEin.replace(/\D/g, ''),
      einIssuingCountry: 'USA',
      entityType: entityTypeMap[application.businessType] ?? 'PRIVATE_PROFIT',
      vertical: 'HOME_SERVICES',
      street: application.addressLine1,
      city: application.city,
      state: application.region,
      postalCode: application.postalCode,
      country: 'US',
      email: application.businessEmail,
      phone: application.businessPhone,
      website: application.websiteUrl,
      brandType: 'STANDARD',
    });
  }

  // 2. Generate standard campaign payload
  const standardTemplate = buildStandardContractorCampaignPayload({
    legalBusinessName: application.legalBusinessName,
    dbaName: application.dbaName,
    websiteUrl: application.websiteUrl,
    supportEmail: application.messagingSupportEmail,
    supportPhone: application.messagingSupportPhone,
  });

  // 3. Create or retrieve downstream TCR Campaign
  let campaign: SignalWireCampaign;
  if (application.providerCampaignId) {
    campaign = await client.getCampaign(application.providerCampaignId);
  } else {
    campaign = await client.createCampaign({
      brandId: brand.id,
      name: `${brandName} Customer Operations`,
      useCase: standardTemplate.useCase,
      vertical: standardTemplate.vertical,
      description: standardTemplate.description,
      messageFlow: standardTemplate.optInDescription,
      sampleMessages: standardTemplate.sampleMessages,
      helpMessage: standardTemplate.helpMessage,
      optOutMessage: standardTemplate.optOutMessage,
      optInMessage: standardTemplate.optInMessage,
      hasEmbeddedLinks: standardTemplate.hasEmbeddedLinks,
      hasEmbeddedPhone: standardTemplate.hasEmbeddedPhone,
      ageGated: standardTemplate.ageGated,
      directLending: standardTemplate.directLending,
      subscriberOptIn: standardTemplate.subscriberOptIn,
      subscriberOptOut: standardTemplate.subscriberOptOut,
      subscriberHelp: standardTemplate.subscriberHelp,
      affiliateMarketing: false,
    });
  }

  // 4. Verify Brand-Campaign relationship
  const belongs = await client.campaignBelongsToBrand({
    brandId: brand.id,
    campaignId: campaign.id,
  });

  return {
    success: belongs && (brand.state === 'completed' || brand.state === 'verified') && campaign.state === 'active',
    brand,
    campaign,
    brandBelongsToCampaign: belongs,
    applicableFees: STANDARD_10DLC_CARRIER_FEES,
    timestamp: new Date().toISOString(),
  };
}
