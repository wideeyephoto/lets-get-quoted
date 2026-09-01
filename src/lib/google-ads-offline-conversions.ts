import type { SupabaseClient } from '@supabase/supabase-js';

export interface OfflineConversionPayload {
  gclid: string;
  conversionAction: 'quote_approved' | 'deposit_paid' | 'job_completed' | 'lead_submitted';
  conversionDateTime: string;
  conversionValue: number;
  currencyCode?: string;
  orderId: string;
  userEmail?: string;
  userPhone?: string;
}

export interface OfflineConversionUploadResult {
  success: boolean;
  uploadedCount: number;
  conversionActionId: string;
  gclid: string;
  value: number;
  uploadTimestamp: string;
  simulated?: boolean;
}

/**
 * Maps high-intent contractor events to Google Ads conversion action names and default values
 */
export const GOOGLE_ADS_CONVERSION_ACTIONS: Record<OfflineConversionPayload['conversionAction'], { name: string; defaultWeight: number }> = {
  lead_submitted: { name: 'Contractor Lead Form Submission', defaultWeight: 25 },
  quote_approved: { name: 'Quote Approved by Homeowner', defaultWeight: 150 },
  deposit_paid: { name: 'Initial Project Deposit Paid', defaultWeight: 500 },
  job_completed: { name: 'Full Job Completed & Settled', defaultWeight: 1500 },
};

/**
 * Uploads an offline Enhanced Conversion to Google Ads API using the click identifier (GCLID) and conversion value.
 */
export async function uploadGoogleAdsOfflineConversion(
  payload: OfflineConversionPayload,
  _supabase?: SupabaseClient,
): Promise<OfflineConversionUploadResult> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || process.env.GOOGLE_ADS_MCC_CUSTOMER_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  const actionInfo = GOOGLE_ADS_CONVERSION_ACTIONS[payload.conversionAction] || {
    name: 'Contractor Quote Conversion',
    defaultWeight: 100,
  };

  const uploadTimestamp = new Date().toISOString();

  // If Google Ads API credentials are not set (e.g. staging or local test), perform structured mock validation
  if (!customerId || !developerToken || !refreshToken) {
    return {
      success: true,
      uploadedCount: 1,
      conversionActionId: actionInfo.name,
      gclid: payload.gclid,
      value: payload.conversionValue > 0 ? payload.conversionValue : actionInfo.defaultWeight,
      uploadTimestamp,
      simulated: true,
    };
  }

  try {
    // In production, send to Google Ads REST API v17 conversionUploads:uploadClickConversions
    const endpoint = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`;

    const conversionData = {
      conversions: [
        {
          gclid: payload.gclid,
          conversionAction: `customers/${customerId}/conversionActions/${payload.conversionAction}`,
          conversionDateTime: payload.conversionDateTime,
          conversionValue: payload.conversionValue,
          currencyCode: payload.currencyCode || 'USD',
          orderId: payload.orderId,
        },
      ],
      partialFailure: true,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conversionData),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('Google Ads offline conversion upload failed:', err);
      return {
        success: false,
        uploadedCount: 0,
        conversionActionId: actionInfo.name,
        gclid: payload.gclid,
        value: payload.conversionValue,
        uploadTimestamp,
      };
    }

    return {
      success: true,
      uploadedCount: 1,
      conversionActionId: actionInfo.name,
      gclid: payload.gclid,
      value: payload.conversionValue,
      uploadTimestamp,
    };
  } catch (err) {
    console.error('Offline conversion upload exception:', err);
    return {
      success: false,
      uploadedCount: 0,
      conversionActionId: actionInfo.name,
      gclid: payload.gclid,
      value: payload.conversionValue,
      uploadTimestamp,
    };
  }
}
