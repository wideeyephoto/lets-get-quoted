import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  normalizeMetaLead,
  type MetaLeadDetails,
  type MetaLeadgenValue,
} from '@/lib/marketplace-router/meta-lead-ads';

describe('Meta Lead Ads Engine', () => {
  describe('Webhook Verification Challenge', () => {
    it('returns challenge when mode is subscribe and verify token matches', () => {
      const result = verifyMetaWebhookChallenge({
        mode: 'subscribe',
        verifyToken: 'secret_verify_123',
        challenge: '1158201444',
        expectedToken: 'secret_verify_123',
      });

      expect(result.valid).toBe(true);
      expect(result.challenge).toBe('1158201444');
    });

    it('rejects when verify token does not match', () => {
      const result = verifyMetaWebhookChallenge({
        mode: 'subscribe',
        verifyToken: 'wrong_token',
        challenge: '1158201444',
        expectedToken: 'secret_verify_123',
      });

      expect(result.valid).toBe(false);
      expect(result.challenge).toBeUndefined();
    });

    it('rejects when mode is not subscribe', () => {
      const result = verifyMetaWebhookChallenge({
        mode: 'unsubscribe',
        verifyToken: 'secret_verify_123',
        challenge: '1158201444',
        expectedToken: 'secret_verify_123',
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('HMAC SHA256 Signature Verification', () => {
    const appSecret = 'super_secret_meta_app_key_456';
    const body = JSON.stringify({ object: 'page', entry: [] });

    it('validates a valid X-Hub-Signature-256 header', () => {
      const hmac = createHmac('sha256', appSecret).update(body).digest('hex');
      const signatureHeader = `sha256=${hmac}`;

      const isValid = verifyMetaWebhookSignature({
        rawBody: body,
        signatureHeader,
        appSecret,
      });

      expect(isValid).toBe(true);
    });

    it('rejects an invalid or tampered signature', () => {
      const signatureHeader = 'sha256=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

      const isValid = verifyMetaWebhookSignature({
        rawBody: body,
        signatureHeader,
        appSecret,
      });

      expect(isValid).toBe(false);
    });

    it('rejects when signature header is missing or malformed', () => {
      expect(verifyMetaWebhookSignature({ rawBody: body, signatureHeader: null, appSecret })).toBe(false);
      expect(verifyMetaWebhookSignature({ rawBody: body, signatureHeader: 'invalid_no_prefix', appSecret })).toBe(false);
    });
  });

  describe('Webhook Payload Parsing', () => {
    it('extracts leadgen events from standard Meta webhook payload', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: 'page_987',
            time: 1725184800,
            changes: [
              {
                field: 'leadgen',
                value: {
                  leadgen_id: 'leadgen_12345678',
                  form_id: 'form_999',
                  page_id: 'page_987',
                  ad_id: 'ad_555',
                  adset_id: 'adset_444',
                  campaign_id: 'campaign_333',
                  created_time: 1725184800,
                },
              },
            ],
          },
        ],
      };

      const events = parseMetaWebhookPayload(payload);
      expect(events).toHaveLength(1);
      expect(events[0].leadgen_id).toBe('leadgen_12345678');
      expect(events[0].form_id).toBe('form_999');
      expect(events[0].page_id).toBe('page_987');
      expect(events[0].ad_id).toBe('ad_555');
    });

    it('returns empty array for non-leadgen webhook payloads', () => {
      const payload = {
        object: 'user',
        entry: [{ id: 'user_1', time: 123, changes: [{ field: 'feed', value: {} }] }],
      };

      expect(parseMetaWebhookPayload(payload)).toHaveLength(0);
    });
  });

  describe('Meta Lead Normalization', () => {
    const event: MetaLeadgenValue = {
      leadgen_id: 'leadgen_777888999',
      form_id: 'form_roofing_offer',
      page_id: 'page_truecoat',
      ad_id: 'ad_spring_roof',
      campaign_id: 'camp_austin_roofing',
      created_time: 1725184800,
    };

    it('correctly maps standard Meta field data and custom questions', () => {
      const leadDetails: MetaLeadDetails = {
        id: 'leadgen_777888999',
        field_data: [
          { name: 'full_name', values: ['Michael Scott'] },
          { name: 'phone_number', values: ['+1 (512) 555-0199'] },
          { name: 'email', values: ['michael@dundermifflin.com'] },
          { name: 'street_address', values: ['1725 Slough Ave'] },
          { name: 'city', values: ['Scranton'] },
          { name: 'state', values: ['PA'] },
          { name: 'zip_code', values: ['18504'] },
          { name: 'what_type_of_roof_service_do_you_need?', values: ['Metal Roof Replacement'] },
          { name: 'how_soon_do_you_need_this_done?', values: ['Immediately / Urgent'] },
        ],
      };

      const normalized = normalizeMetaLead({
        event,
        leadDetails,
        signatureVerified: true,
      });

      expect(normalized.provider).toBe('meta_lead_ads');
      expect(normalized.providerLeadId).toBe('leadgen_777888999');
      expect(normalized.customer.name).toBe('Michael Scott');
      expect(normalized.customer.phone).toBe('+1 (512) 555-0199');
      expect(normalized.customer.email).toBe('michael@dundermifflin.com');
      expect(normalized.customer.address).toBe('1725 Slough Ave, Scranton, PA, 18504');
      expect(normalized.customer.city).toBe('Scranton');
      expect(normalized.customer.state).toBe('PA');
      expect(normalized.customer.zip).toBe('18504');
      expect(normalized.project.projectType).toContain('Metal Roof Replacement');
      expect(normalized.project.isUrgent).toBe(true);
      expect(normalized.attribution?.source).toBe('facebook');
      expect(normalized.attribution?.medium).toBe('meta_lead_ad');
      expect(normalized.attribution?.clickIdType).toBe('fbclid');
      expect(normalized.signatureVerified).toBe(true);
    });

    it('falls back to safe defaults when lead details are missing', () => {
      const normalized = normalizeMetaLead({
        event,
        leadDetails: null,
      });

      expect(normalized.customer.name).toBe('Meta Lead Ad Inquirer');
      expect(normalized.customer.phone).toBeNull();
      expect(normalized.attribution?.source).toBe('facebook');
      expect(normalized.signatureVerified).toBe(false);
    });
  });
});
