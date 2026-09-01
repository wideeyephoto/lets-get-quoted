export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: "Let's Get Quoted Public API",
      version: '1.0.0',
      description:
        'Official REST API for contractor integrations, custom webhooks, Zapier, Make, and n8n connectors.',
      contact: {
        name: "Let's Get Quoted API Support",
        url: 'https://letsgetquoted.com',
      },
    },
    servers: [
      {
        url: 'https://api.letsgetquoted.com/v1',
        description: 'Production API Gateway',
      },
      {
        url: '/api/v1',
        description: 'Current Origin',
      },
    ],
    security: [
      {
        BearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Token (lgq_live_...)',
          description: 'Account-bound secret API token created in Workspace Settings > Developers & APIs.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'invalid_api_key',
                    'insufficient_scope',
                    'invalid_request',
                    'not_found',
                    'idempotency_conflict',
                    'rate_limited',
                    'internal_error',
                  ],
                },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
            request_id: { type: 'string' },
          },
        },
        Lead: {
          type: 'object',
          required: ['id', 'status', 'source', 'customer', 'project', 'triage', 'created_at', 'updated_at'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['new', 'contacted', 'quoted', 'won', 'lost'] },
            source: { type: 'string' },
            customer: {
              type: 'object',
              properties: {
                name: { type: 'string', nullable: true },
                phone: { type: 'string', nullable: true },
                email: { type: 'string', format: 'email', nullable: true },
                address: { type: 'string', nullable: true },
              },
            },
            project: {
              type: 'object',
              properties: {
                project_type: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                estimated_hours: { type: 'number', nullable: true },
                timeline: { type: 'string', nullable: true },
                photo_urls: { type: 'array', items: { type: 'string' } },
              },
            },
            triage: {
              type: 'object',
              properties: {
                score: { type: 'string', enum: ['hot', 'warm', 'low'] },
                flags: { type: 'array', items: { type: 'string' } },
                contact_preference: { type: 'string', enum: ['any', 'text_only'] },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateLeadInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Customer or business contact name' },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            address: { type: 'string', nullable: true },
            project_type: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            estimated_hours: { type: 'number', nullable: true },
            source: { type: 'string', enum: ['website_form', 'missed_call', 'manual', 'referral', 'ai_voice'], nullable: true },
            timeline: { type: 'string', nullable: true },
            contact_preference: { type: 'string', enum: ['any', 'text_only'], nullable: true },
            score: { type: 'string', enum: ['hot', 'warm', 'low'], nullable: true },
          },
        },
        UpdateLeadInput: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            address: { type: 'string', nullable: true },
            project_type: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            estimated_hours: { type: 'number', nullable: true },
            status: { type: 'string', enum: ['new', 'contacted', 'quoted', 'lost'] },
            timeline: { type: 'string', nullable: true },
            contact_preference: { type: 'string', enum: ['any', 'text_only'] },
            score: { type: 'string', enum: ['hot', 'warm', 'low'] },
          },
        },
        WebhookSubscription: {
          type: 'object',
          required: ['id', 'target_url', 'event_types', 'status', 'created_at'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            target_url: { type: 'string', format: 'uri' },
            event_types: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string', description: 'Signing secret (only returned in response to POST creation)' },
            secret_preview: { type: 'string' },
            status: { type: 'string', enum: ['active', 'disabled', 'suspended'] },
            disabled_reason: { type: 'string', nullable: true },
            consecutive_failures: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        IntegrationEvent: {
          type: 'object',
          required: ['id', 'event', 'aggregate_type', 'aggregate_id', 'occurred_at', 'data'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            event: { type: 'string' },
            aggregate_type: { type: 'string' },
            aggregate_id: { type: 'string', format: 'uuid' },
            occurred_at: { type: 'string', format: 'date-time' },
            data: { type: 'object' },
          },
        },
      },
    },
    paths: {
      '/me': {
        get: {
          summary: 'Validate credentials and return workspace metadata',
          description: 'Returns identity and workspace details associated with the Bearer API token.',
          responses: {
            '200': {
              description: 'Workspace and token metadata',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      workspace_id: { type: 'string', format: 'uuid' },
                      business_name: { type: 'string' },
                      token_name: { type: 'string' },
                      token_prefix: { type: 'string' },
                      scopes: { type: 'array', items: { type: 'string' } },
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '/leads': {
        get: {
          summary: 'List leads with cursor pagination and filters',
          parameters: [
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Opaque pagination cursor' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Page size (1-100)' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'contacted', 'quoted', 'won', 'lost'] } },
            { name: 'email', in: 'query', schema: { type: 'string' } },
            { name: 'phone', in: 'query', schema: { type: 'string' } },
            { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': {
              description: 'List of leads and pagination cursor',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                      has_more: { type: 'boolean' },
                      next_cursor: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/schemas/ErrorResponse' },
            '403': { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
        post: {
          summary: 'Create a new lead',
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string' },
              description: 'Unique client-supplied string guaranteeing idempotent execution.',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateLeadInput' } },
            },
          },
          responses: {
            '201': {
              description: 'Lead created successfully',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Lead' } },
              },
            },
            '400': { $ref: '#/components/schemas/ErrorResponse' },
            '401': { $ref: '#/components/schemas/ErrorResponse' },
            '403': { $ref: '#/components/schemas/ErrorResponse' },
            '409': { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '/leads/{id}': {
        get: {
          summary: 'Get single lead by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Lead details',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } },
            },
            '404': { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
        patch: {
          summary: 'Update safe fields on an existing lead',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateLeadInput' } } },
          },
          responses: {
            '200': {
              description: 'Updated lead details',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } },
            },
            '400': { $ref: '#/components/schemas/ErrorResponse' },
            '404': { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '/events': {
        get: {
          summary: 'List recent event envelopes (connector sample stream)',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'event_type', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of integration event envelopes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/webhook-subscriptions': {
        get: {
          summary: 'List active webhook subscriptions',
          responses: {
            '200': {
              description: 'List of registered webhook endpoints',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/WebhookSubscription' } },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Register a new webhook subscription',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['target_url', 'event_types'],
                  properties: {
                    target_url: { type: 'string', format: 'uri' },
                    event_types: {
                      type: 'array',
                      items: { type: 'string', enum: ['lead.created', 'lead.updated', 'lead.status_changed'] },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Webhook subscription created. The response contains the signing secret once.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/WebhookSubscription' } },
              },
            },
          },
        },
      },
      '/webhook-subscriptions/{id}': {
        get: {
          summary: 'Get subscription lifecycle and health',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Subscription status',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookSubscription' } } },
            },
          },
        },
        delete: {
          summary: 'Unsubscribe / remove webhook',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '204': { description: 'Subscription deleted successfully' },
          },
        },
      },
      '/webhook-subscriptions/{id}/deliveries': {
        get: {
          summary: 'List recent delivery attempts for a subscription',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Delivery log history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/webhook-deliveries/{id}/retry': {
        post: {
          summary: 'Request manual replay of a failed or dead-letter delivery',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Delivery requeued successfully for replay',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      delivery_id: { type: 'string' },
                      status: { type: 'string', enum: ['pending'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
