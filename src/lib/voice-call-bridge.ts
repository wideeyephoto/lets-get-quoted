import type { SupabaseClient } from '@supabase/supabase-js';
import { twilioCallsUrl } from '@/lib/sms-provider';

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

import { randomUUID } from 'node:crypto';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates TwiML voice XML that greets the contractor first and prompts them to press 1 to connect to the homeowner.
 */
export function generateContractorCallBridgeTwiml(config: VoiceCallBridgeConfig): string {
  const cleanProjectType = escapeXml(config.projectType || 'new project');
  const cleanHomeowner = escapeXml(config.homeownerName || 'a homeowner');
  const cleanCity = config.city ? ` in ${escapeXml(config.city)}` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Let's Get Quoted speed-to-lead alert. You have a new ${cleanProjectType} lead from ${cleanHomeowner}${cleanCity}. Press 1 to connect instantly with this homeowner.</Say>
  <Gather numDigits="1" action="/api/voice/bridge-connect?leadId=${encodeURIComponent(config.leadId)}&amp;expires=${Math.floor(Date.now() / 1000) + 300}" method="POST" timeout="10">
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
  const endpoint = twilioCallsUrl(accountSid);

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
  const bridgeId = `bridge_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const reqDetails = buildTwilioCallRequest(config);

  // Missing credentials must never be reported as a successfully queued call.
  if (
    !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER ||
    !process.env.TWILIO_ACCOUNT_SID ||
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC000000')
  ) {
    return {
      bridgeId,
      status: 'failed',
      contractorDialStatus: 'not_configured',
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

    const data = (await response.json()) as { sid?: string; status?: string };
    return {
      bridgeId: data.sid || bridgeId,
      status: 'initiated',
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
