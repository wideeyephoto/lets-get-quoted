'use client';

import { useActionState, useState } from 'react';
import {
  createApiTokenAction,
  revokeApiTokenAction,
  createWebhookSubscriptionAction,
  deleteWebhookSubscriptionAction,
  retryWebhookDeliveryAction,
  type CreateTokenActionResult,
  type CreateWebhookActionResult,
} from './developer-api-actions';
import {
  ALL_API_SCOPES,
  API_SCOPE_DESCRIPTIONS,
  type ApiCredentialRow,
  type ApiScope,
} from '@/lib/public-api/types';

export type WebhookSubscriptionView = {
  id: string;
  target_url: string;
  event_types: string[];
  secret_preview: string;
  status: string;
  disabled_reason: string | null;
  consecutive_failures: number;
  created_at: string;
};

export type WebhookDeliveryView = {
  id: string;
  subscription_id: string;
  event_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
};

export default function DeveloperApiSection({
  tokens,
  subscriptions,
  deliveries,
}: {
  tokens: ApiCredentialRow[];
  subscriptions: WebhookSubscriptionView[];
  deliveries: WebhookDeliveryView[];
}) {
  const [tokenState, tokenAction, isTokenPending] = useActionState<CreateTokenActionResult | null, FormData>(
    createApiTokenAction,
    null
  );

  const [webhookState, webhookAction, isWebhookPending] = useActionState<CreateWebhookActionResult | null, FormData>(
    createWebhookSubscriptionAction,
    null
  );

  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);

  function copyToClipboard(text: string, isSecret = false) {
    navigator.clipboard.writeText(text);
    if (isSecret) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 3000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 3000);
    }
  }

  return (
    <div className="developer-api-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. API TOKENS CARD */}
      <section className="panel workspace-section-card" id="api-tokens">
        <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="eyebrow">Public REST API</p>
            <h2>API Tokens</h2>
          </div>
          {!showTokenForm && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowTokenForm(true)}
            >
              + Generate New Token
            </button>
          )}
        </div>

        <p className="workspace-details-copy" style={{ margin: '0.75rem 0 1.25rem 0' }}>
          Account-bound API tokens allow your custom software, Zapier, Make, and n8n connectors to securely interact with the Let&apos;s Get Quoted REST API at <code>https://api.letsgetquoted.com/v1</code>.
        </p>

        {tokenState?.success && tokenState.tokenSecret && (
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ color: 'var(--color-success, #22c55e)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Token Created: {tokenState.name}
            </h3>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>
              <strong>Copy this token now.</strong> It is encrypted with SHA-256 and will never be shown again.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={tokenState.tokenSecret}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--color-surface, #fff)',
                  border: '1px solid var(--color-border, #ccc)',
                  borderRadius: '4px',
                }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => copyToClipboard(tokenState.tokenSecret!)}
              >
                {copiedToken ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {showTokenForm && (
          <form
            action={tokenAction}
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--color-surface-sunken, #f8f9fa)',
              border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Generate API Token</h3>
            {tokenState?.error && (
              <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                {tokenState.error}
              </p>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                Token Name / Application
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Zapier Lead Sync, Make.com Integration"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Permission Scopes
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem' }}>
                {ALL_API_SCOPES.map((scope: ApiScope) => (
                  <label key={scope} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="scopes" value={scope} defaultChecked={scope.startsWith('leads')} />
                    <div>
                      <strong>{scope}</strong>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #666)', margin: 0 }}>
                        {API_SCOPE_DESCRIPTIONS[scope]}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowTokenForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={isTokenPending}
              >
                {isTokenPending ? 'Generating...' : 'Create Token'}
              </button>
            </div>
          </form>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Token Name</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Prefix</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Scopes</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Created / Last Used</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--color-text-muted, #666)' }}>
                    No API tokens generated yet. Click &quot;Generate New Token&quot; above to create one.
                  </td>
                </tr>
              ) : (
                tokens.map((tok) => (
                  <tr key={tok.id} style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)', opacity: tok.revoked_at ? 0.6 : 1 }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                      {tok.name}
                      {tok.revoked_at && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-danger, #ef4444)' }}>
                          (Revoked)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace' }}>{tok.token_prefix}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(tok.scopes || []).map((s) => (
                          <span key={s} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--color-surface-sunken, #eee)', borderRadius: '3px' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted, #666)' }}>
                      <div>Created: {new Date(tok.created_at).toLocaleDateString()}</div>
                      <div>Last used: {tok.last_used_at ? new Date(tok.last_used_at).toLocaleDateString() : 'Never'}</div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      {!tok.revoked_at && (
                        <form
                          action={async (fd: FormData) => {
                            await revokeApiTokenAction(fd);
                          }}
                          style={{ display: 'inline' }}
                        >
                          <input type="hidden" name="credentialId" value={tok.id} />
                          <button
                            type="submit"
                            className="btn danger small"
                            onClick={(e) => {
                              if (!confirm(`Are you sure you want to revoke the token "${tok.name}"? Applications using it will immediately lose access.`)) {
                                e.preventDefault();
                              }
                            }}
                          >
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. WEBHOOK SUBSCRIPTIONS CARD */}
      <section className="panel workspace-section-card" id="webhooks">
        <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="eyebrow">Real-Time Events</p>
            <h2>Outbound Webhooks</h2>
          </div>
          {!showWebhookForm && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowWebhookForm(true)}
            >
              + Add Webhook Endpoint
            </button>
          )}
        </div>

        <p className="workspace-details-copy" style={{ margin: '0.75rem 0 1.25rem 0' }}>
          Receive signed HMAC-SHA256 event payloads whenever Leads are created, updated, or change status in real time.
        </p>

        {webhookState?.success && webhookState.secret && (
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ color: 'var(--color-success, #22c55e)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Webhook Endpoint Registered!
            </h3>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>
              <strong>Copy your endpoint signing secret.</strong> Use this to verify incoming <code>LGQ-Signature</code> headers.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={webhookState.secret}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--color-surface, #fff)',
                  border: '1px solid var(--color-border, #ccc)',
                  borderRadius: '4px',
                }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => copyToClipboard(webhookState.secret!, true)}
              >
                {copiedSecret ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {showWebhookForm && (
          <form
            action={webhookAction}
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--color-surface-sunken, #f8f9fa)',
              border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Register Webhook Endpoint</h3>
            {webhookState?.error && (
              <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                {webhookState.error}
              </p>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                Endpoint URL (HTTPS only)
              </label>
              <input
                type="url"
                name="targetUrl"
                required
                placeholder="https://hooks.zapier.com/hooks/catch/... or https://your-server.com/webhooks"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Subscribed Events
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" name="eventTypes" value="lead.created" defaultChecked />
                  <span><strong>lead.created</strong> — Triggered when a new lead enters the pipeline</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" name="eventTypes" value="lead.updated" defaultChecked />
                  <span><strong>lead.updated</strong> — Triggered when customer, address, or details are modified</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" name="eventTypes" value="lead.status_changed" defaultChecked />
                  <span><strong>lead.status_changed</strong> — Triggered when lead moves across stages (new, contacted, quoted, lost)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowWebhookForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={isWebhookPending}
              >
                {isWebhookPending ? 'Registering...' : 'Register Webhook'}
              </button>
            </div>
          </form>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Endpoint URL</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Events</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Secret Hint</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--color-text-muted, #666)' }}>
                    No webhook subscriptions configured. Click &quot;Add Webhook Endpoint&quot; above to connect Zapier, Make, or custom listeners.
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr key={sub.id} style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500, wordBreak: 'break-all', maxWidth: '280px' }}>
                      {sub.target_url}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(sub.event_types || []).map((e) => (
                          <span key={e} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--color-surface-sunken, #eee)', borderRadius: '3px' }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: sub.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: sub.status === 'active' ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {sub.status.toUpperCase()}
                      </span>
                      {sub.disabled_reason && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-danger, #ef4444)', marginTop: '0.25rem' }}>
                          {sub.disabled_reason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {sub.secret_preview}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <form
                        action={async (fd: FormData) => {
                          await deleteWebhookSubscriptionAction(fd);
                        }}
                        style={{ display: 'inline' }}
                      >
                        <input type="hidden" name="subscriptionId" value={sub.id} />
                        <button
                          type="submit"
                          className="btn danger small"
                          onClick={(e) => {
                            if (!confirm('Are you sure you want to delete this webhook subscription?')) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. WEBHOOK DELIVERIES LOG */}
      <section className="panel workspace-section-card" id="webhook-deliveries">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Queue &amp; Observability</p>
          <h2>Recent Webhook Deliveries</h2>
        </div>

        <p className="workspace-details-copy" style={{ margin: '0.75rem 0 1.25rem 0' }}>
          Durable delivery logs with automatic exponential retry and manual replay for dead-letter tasks.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Delivery ID / Event</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Attempts</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Last Error / Result</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Time</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--color-text-muted, #666)' }}>
                    No webhook delivery history recorded yet.
                  </td>
                </tr>
              ) : (
                deliveries.map((del) => (
                  <tr key={del.id} style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {del.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor:
                            del.status === 'delivered'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : del.status === 'pending' || del.status === 'leased'
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                          color:
                            del.status === 'delivered'
                              ? '#16a34a'
                              : del.status === 'pending' || del.status === 'leased'
                                ? '#2563eb'
                                : '#dc2626',
                        }}
                      >
                        {del.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {del.attempt_count} / {del.max_attempts}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: del.last_error ? 'var(--color-danger, #ef4444)' : 'var(--color-text-muted, #666)' }}>
                      {del.last_error || 'Success'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted, #666)' }}>
                      {new Date(del.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      {(del.status === 'failed' || del.status === 'dead_letter') && (
                        <form
                          action={async (fd: FormData) => {
                            await retryWebhookDeliveryAction(fd);
                          }}
                          style={{ display: 'inline' }}
                        >
                          <input type="hidden" name="deliveryId" value={del.id} />
                          <button type="submit" className="btn secondary small">
                            Replay
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. API DOCUMENTATION & CONNECTOR SAMPLES */}
      <section className="panel workspace-section-card" id="api-docs">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Specifications &amp; Guides</p>
          <h2>OpenAPI 3.1 &amp; Connector Setup</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Explore the runtime OpenAPI 3.1 schema or import it directly into Postman, Insomnia, or custom tooling:
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="btn secondary"
          >
            View OpenAPI 3.1 JSON Specification
          </a>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #666)' }}>
            Endpoint: <code>/api/v1/openapi.json</code>
          </span>
        </div>
      </section>
    </div>
  );
}
