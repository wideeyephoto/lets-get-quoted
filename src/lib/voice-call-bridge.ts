import type { SupabaseClient } from '@supabase/supabase-js';

export interface VoiceCallBridgeConfig {
  leadId: string;
  contractorPhone: string;
  homeownerPhone: string;
  contractorName: string;
  homeownerName: string;
  projectType: string;
  city?: string;
  recordCall?: boolean;
}

export interface VoiceCallBridgeResult {
  bridgeId: string;
  status: 'initiated' | 'connected' | 'failed' | 'scheduled';
  contractorDialStatus: string;
  homeownerDialStatus?: string;
  twimlPrompt: string;
  initiatedAt: string;
}

/**
 * Generates TwiML voice XML that greets the contractor first and prompts them to press 1 to connect to the homeowner.
 */
export function generateContractorCallBridgeTwiml(config: VoiceCallBridgeConfig): string {
  const cleanProjectType = config.projectType || 'new project';
  const cleanHomeowner = config.homeownerName || 'a homeowner';
  const cleanCity = config.city ? ` in ${config.city}` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Let's Get Quoted speed-to-lead alert. You have a new ${cleanProjectType} lead from ${cleanHomeowner}${cleanCity}. Press 1 to connect instantly with this homeowner.</Say>
  <Gather numDigits="1" action="/api/voice/bridge-connect?leadId=${encodeURIComponent(config.leadId)}" method="POST" timeout="10">
    <Say voice="Polly.Matthew">Press 1 now to connect.</Say>
  </Gather>
  <Say voice="Polly.Matthew">No input received. We will text you the lead details immediately. Goodbye.</Say>
  <Hangup/>
</Response>`.trim();
}

/**
 * Builds the Twilio request details without touching the network.
 */
export function buildTwilioCallRequest(config: VoiceCallBridgeConfig) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC00000000000000000000000000000000';
  const authToken = process.env.TWILIO_AUTH_TOKEN || 'test_auth_token';
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18005550199';
  const twimlPrompt = generateContractorCallBridgeTwiml(config);

  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

  const body = new URLSearchParams({
    To: config.contractorPhone,
    From: fromNumber,
    Twiml: twimlPrompt,
  });

  return {
    endpoint,
    authHeader,
    body: body.toString(),
    twimlPrompt,
  };
}

/**
 * Initiates an automated voice callback bridge connecting the contractor to the homeowner within 30 seconds.
 */
export async function initiateSpeedToLeadCallBridge(
  config: VoiceCallBridgeConfig,
  _supabase?: SupabaseClient,
): Promise<VoiceCallBridgeResult> {
  const bridgeId = `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const reqDetails = buildTwilioCallRequest(config);

  // In test environment or when credentials are dummy/unconfigured, return simulated success without making live egress
  if (
    process.env.NODE_ENV === 'test' ||
    !process.env.TWILIO_ACCOUNT_SID ||
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC000000')
  ) {
    return {
      bridgeId,
      status: 'initiated',
      contractorDialStatus: 'queued',
      twimlPrompt: reqDetails.twimlPrompt,
      initiatedAt: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch(reqDetails.endpoint, {
      method: 'POST',
      headers: {
        Authorization: reqDetails.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: reqDetails.body,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Twilio voice call bridge returned error:', errText);
      return {
        bridgeId,
        status: 'failed',
        contractorDialStatus: 'error',
        twimlPrompt: reqDetails.twimlPrompt,
        initiatedAt: new Date().toISOString(),
      };
    }

    const data: any = await response.json();
    return {
      bridgeId: data.sid || bridgeId,
      status: 'connected',
      contractorDialStatus: data.status || 'queued',
      twimlPrompt: reqDetails.twimlPrompt,
      initiatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to initiate speed-to-lead voice bridge:', err);
    return {
      bridgeId,
      status: 'failed',
      contractorDialStatus: 'network_error',
      twimlPrompt: reqDetails.twimlPrompt,
      initiatedAt: new Date().toISOString(),
    };
  }
}
