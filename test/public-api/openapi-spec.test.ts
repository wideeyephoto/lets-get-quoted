import { describe, it, expect } from 'vitest';
import { getOpenApiSpec } from '@/lib/public-api/openapi-spec';

describe('OpenAPI 3.1 Specification', () => {
  it('generates valid OpenAPI 3.1.0 document with expected metadata', () => {
    const spec = getOpenApiSpec();

    expect(spec.openapi).toBe('3.1.0');
    expect((spec.info as any).title).toBe("Let's Get Quoted Public API");
    expect((spec.info as any).version).toBe('1.0.0');
    expect((spec.servers as any[])[0]?.url).toBe('https://api.letsgetquoted.com/v1');
  });

  it('includes BearerAuth security scheme', () => {
    const spec = getOpenApiSpec();
    const securitySchemes = (spec.components as any)?.securitySchemes as Record<string, any>;

    expect(securitySchemes?.BearerAuth).toBeDefined();
    expect(securitySchemes.BearerAuth.type).toBe('http');
    expect(securitySchemes.BearerAuth.scheme).toBe('bearer');
  });

  it('declares all core v1 endpoints and their HTTP methods', () => {
    const spec = getOpenApiSpec();
    const paths = spec.paths as Record<string, any>;

    expect(paths['/me']?.get).toBeDefined();
    expect(paths['/leads']?.get).toBeDefined();
    expect(paths['/leads']?.post).toBeDefined();
    expect(paths['/leads/{id}']?.get).toBeDefined();
    expect(paths['/leads/{id}']?.patch).toBeDefined();
    expect(paths['/events']?.get).toBeDefined();
    expect(paths['/webhook-subscriptions']?.get).toBeDefined();
    expect(paths['/webhook-subscriptions']?.post).toBeDefined();
    expect(paths['/webhook-subscriptions/{id}']?.get).toBeDefined();
    expect(paths['/webhook-subscriptions/{id}']?.delete).toBeDefined();
    expect(paths['/webhook-subscriptions/{id}/deliveries']?.get).toBeDefined();
    expect(paths['/webhook-deliveries/{id}/retry']?.post).toBeDefined();
  });

  it('defines reusable schemas for Lead, WebhookSubscription, IntegrationEvent, and ErrorResponse', () => {
    const spec = getOpenApiSpec();
    const schemas = (spec.components as any)?.schemas as Record<string, any>;

    expect(schemas?.Lead).toBeDefined();
    expect(schemas?.CreateLeadInput).toBeDefined();
    expect(schemas?.UpdateLeadInput).toBeDefined();
    expect(schemas?.WebhookSubscription).toBeDefined();
    expect(schemas?.IntegrationEvent).toBeDefined();
    expect(schemas?.ErrorResponse).toBeDefined();
  });
});
