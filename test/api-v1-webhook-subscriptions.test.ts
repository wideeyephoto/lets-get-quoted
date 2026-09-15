import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

vi.mock('@/lib/public-api/ssrf-guard', () => ({
  validateWebhookUrl: vi.fn(),
}));

vi.mock('@/lib/public-api/webhook-vault-crypto', () => ({
  generateWebhookSecret: vi.fn(),
  encryptWebhookSecret: vi.fn(),
}));

import { GET, POST } from '@/app/api/v1/webhook-subscriptions/route';

describe('V1 Webhook Subscriptions Route', () => {
  let validateWebhookUrlMock: any;
  let generateWebhookSecretMock: any;
  let encryptWebhookSecretMock: any;
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    validateWebhookUrlMock = (await import('@/lib/public-api/ssrf-guard')).validateWebhookUrl;
    generateWebhookSecretMock = (await import('@/lib/public-api/webhook-vault-crypto')).generateWebhookSecret;
    encryptWebhookSecretMock = (await import('@/lib/public-api/webhook-vault-crypto')).encryptWebhookSecret;

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: '1', created_at: '2023-01-01', updated_at: '2023-01-01' }],
        error: null
      }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: '1', created_at: '2023-01-01', updated_at: '2023-01-01' },
        error: null
      })
    };
  });

  describe('GET', () => {
    it('returns subscriptions', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data[0].id).toBe('1');
    });

    it('handles db error', async () => {
      adminMock.order.mockResolvedValue({ data: null, error: new Error('db error') });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions');
      await expect((GET as any)(req, { admin: adminMock, accountId: 'acct_1' })).rejects.toThrow('db error');
    });
  });

  describe('POST', () => {
    it('handles invalid json', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{bad' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('handles missing target_url', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{}' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('handles ssrf failure', async () => {
      validateWebhookUrlMock.mockResolvedValue({ safe: false, reason: 'bad' });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{"target_url":"http://localhost"}' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('handles invalid event_types', async () => {
      validateWebhookUrlMock.mockResolvedValue({ safe: true });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{"target_url":"http://good.com","event_types":"bad"}' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('handles empty valid event_types', async () => {
      validateWebhookUrlMock.mockResolvedValue({ safe: true });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{"target_url":"http://good.com","event_types":["bad"]}' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('creates subscription', async () => {
      validateWebhookUrlMock.mockResolvedValue({ safe: true });
      generateWebhookSecretMock.mockReturnValue('secret');
      encryptWebhookSecretMock.mockReturnValue('encrypted');
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{"target_url":"http://good.com","event_types":["lead.created"]}' });
      const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1', credentialId: 'cred_1' });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('1');
      expect(data.secret).toBe('secret');
    });

    it('handles db error', async () => {
      validateWebhookUrlMock.mockResolvedValue({ safe: true });
      generateWebhookSecretMock.mockReturnValue('secret');
      encryptWebhookSecretMock.mockReturnValue('encrypted');
      adminMock.single.mockResolvedValue({ data: null, error: new Error('db error') });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions', { method: 'POST', body: '{"target_url":"http://good.com","event_types":["lead.created"]}' });
      await expect((POST as any)(req, { admin: adminMock, accountId: 'acct_1', credentialId: 'cred_1' })).rejects.toThrow('db error');
    });
  });
});
