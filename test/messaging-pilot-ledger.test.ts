import { describe, expect, it } from 'vitest';
import {
  buildPilotContractorRecord,
  calculatePilotMonthlyFeesCents,
  calculatePilotUpfrontFeesCents,
  formatFeeUsd,
  STANDARD_10DLC_CARRIER_FEES,
} from '@/lib/messaging-pilot-ledger';

describe('messaging pilot contractor ledger & carrier fee accounting', () => {
  it('defines the standard carrier fee schedule with exact TCR and SignalWire rates', () => {
    expect(STANDARD_10DLC_CARRIER_FEES).toEqual([
      {
        code: 'TCR_BRAND_STANDARD',
        description: 'TCR Downstream Standard Brand Registration Fee',
        category: 'brand_registration',
        amountCents: 400,
        cadence: 'one_time',
      },
      {
        code: 'DCA_CAMPAIGN_VETTING',
        description: 'DCA / Carrier 10DLC Campaign Vetting Fee',
        category: 'campaign_vetting',
        amountCents: 1500,
        cadence: 'one_time',
      },
      {
        code: 'TCR_CAMPAIGN_MONTHLY',
        description: 'Low-Volume Customer Care Campaign Maintenance',
        category: 'campaign_monthly',
        amountCents: 150,
        cadence: 'monthly',
      },
      {
        code: 'SIGNALWIRE_DID_LOCAL',
        description: 'SignalWire Local Dedicated Number Lease',
        category: 'number_monthly',
        amountCents: 50,
        cadence: 'monthly',
      },
    ]);
  });

  it('calculates total upfront and monthly carrier pass-through costs accurately', () => {
    const upfrontCents = calculatePilotUpfrontFeesCents();
    const monthlyCents = calculatePilotMonthlyFeesCents();

    // Upfront: $4.00 (Brand) + $15.00 (Campaign Vetting) = $19.00
    expect(upfrontCents).toBe(1900);
    expect(formatFeeUsd(upfrontCents)).toBe('$19.00');

    // Monthly: $1.50 (Campaign) + $0.50 (DID Lease) = $2.00
    expect(monthlyCents).toBe(200);
    expect(formatFeeUsd(monthlyCents)).toBe('$2.00');
  });

  it('builds a complete pilot audit record documenting every stage and API interaction', () => {
    const pilotRecord = buildPilotContractorRecord({
      pilotId: 'pilot-apex-001',
      accountId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      legalBusinessName: 'Apex Roofing LLC',
      dbaName: 'Apex Roofs & Gutters',
      einLastFour: '4829',
      websiteUrl: 'https://apexroofing.example.com',
      desiredAreaCode: '248',
      purchasedNumber: '+12485550199',
      providerBrandId: 'b8f9e123-4567-4890-a123-bcdef4567890',
      providerCampaignId: 'c7d8e234-5678-4901-b234-cdefa5678901',
      assignmentOrderId: 'ord_123456789abcdef',
      activatedAt: '2026-08-25T17:30:00.000Z',
    });

    expect(pilotRecord.pilotId).toBe('pilot-apex-001');
    expect(pilotRecord.legalBusinessName).toBe('Apex Roofing LLC');
    expect(pilotRecord.dbaName).toBe('Apex Roofs & Gutters');
    expect(pilotRecord.einLastFour).toBe('4829');
    expect(pilotRecord.providerBrandState).toBe('completed');
    expect(pilotRecord.providerCampaignState).toBe('active');
    expect(pilotRecord.assignmentState).toBe('assigned');

    // Verify all 8 lifecycle stages are documented in order
    expect(pilotRecord.completedStages).toEqual([
      'application_intake',
      'tax_identity_verification',
      'tcr_brand_registration',
      'tcr_campaign_registration',
      'number_search_and_purchase',
      'inbound_webhook_configuration',
      'campaign_number_assignment',
      'activation_and_canary',
    ]);

    // Verify API interaction log entries
    expect(pilotRecord.apiInteractions).toHaveLength(5);
    const stages = pilotRecord.apiInteractions.map((i) => i.stage);
    expect(stages).toEqual([
      'tcr_brand_registration',
      'tcr_campaign_registration',
      'number_search_and_purchase',
      'inbound_webhook_configuration',
      'campaign_number_assignment',
    ]);

    // Verify inbound webhook points to exact POST route
    const inbound = pilotRecord.apiInteractions.find((i) => i.stage === 'inbound_webhook_configuration');
    expect(inbound?.requestBodySummary.message_request_url).toBe('https://app.letsgetquoted.com/api/sms/inbound');
    expect(inbound?.requestBodySummary.message_request_method).toBe('POST');
  });
});
