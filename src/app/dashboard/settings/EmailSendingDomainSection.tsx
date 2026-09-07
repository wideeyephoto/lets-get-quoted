'use client';

import { useState, useTransition } from 'react';
import { DNS_PROVIDERS } from '@/lib/dns-providers';
import {
  createEmailSendingDomainAction,
  deleteEmailSendingDomainAction,
  verifyEmailSendingDomainAction,
  type EmailSendingDomainRow,
} from './email-domain-actions';

interface Props {
  initialDomain: EmailSendingDomainRow | null;
  isConfigured?: boolean;
  isEnabled: boolean;
}

export default function EmailSendingDomainSection({
  initialDomain,
  isConfigured: _isConfigured,
  isEnabled,
}: Props) {
  const [domainRow, setDomainRow] = useState<EmailSendingDomainRow | null>(initialDomain);
  const [domainInput, setDomainInput] = useState('');
  const [localPartInput, setLocalPartInput] = useState('quotes');
  const [selectedProviderId, setSelectedProviderId] = useState('godaddy');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isEnabled) {
    return null;
  }

  const selectedProvider =
    DNS_PROVIDERS.find((p) => p.id === selectedProviderId) || DNS_PROVIDERS[0];

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const created = await createEmailSendingDomainAction({
          domain: domainInput,
          fromLocalPart: localPartInput,
        });
        setDomainRow(created);
        setSuccessMessage('Domain added. Add the DNS records below at your domain registrar.');
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to connect sending domain.');
      }
    });
  };

  const handleVerify = () => {
    if (!domainRow) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const updated = await verifyEmailSendingDomainAction(domainRow.id);
        setDomainRow(updated);
        if (updated.status === 'verified') {
          setSuccessMessage('Domain verified! Outbound quotes and invoices will now send from your domain.');
        } else {
          setErrorMessage(
            'DNS records are still propagating or could not be detected yet. Please allow a few minutes and try again.',
          );
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Verification check failed.');
      }
    });
  };

  const handleDelete = () => {
    if (!domainRow) return;
    if (!confirm(`Are you sure you want to disconnect ${domainRow.domain}? Outbound email will revert to the platform address.`)) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        await deleteEmailSendingDomainAction(domainRow.id);
        setDomainRow(null);
        setDomainInput('');
        setSuccessMessage('Sending domain disconnected.');
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to disconnect domain.');
      }
    });
  };

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px 0' }}>
            Custom Email Sending Domain
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
            Send quotes, invoices, and job updates from your own business email address (e.g. <code>quotes@{domainRow?.domain || 'yourbusiness.com'}</code>).
          </p>
        </div>

        {domainRow && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              background:
                domainRow.status === 'verified'
                  ? '#ecfdf5'
                  : domainRow.status === 'failed'
                  ? '#fef2f2'
                  : '#fffbeb',
              color:
                domainRow.status === 'verified'
                  ? '#065f46'
                  : domainRow.status === 'failed'
                  ? '#991b1b'
                  : '#92400e',
              border: `1px solid ${
                domainRow.status === 'verified'
                  ? '#a7f3d0'
                  : domainRow.status === 'failed'
                  ? '#fecaca'
                  : '#fde68a'
              }`,
            }}
          >
            {domainRow.status === 'verified' && '✓ Verified'}
            {domainRow.status === 'pending' && '⏳ Pending DNS'}
            {domainRow.status === 'failed' && '⚠ Verification Failed'}
            {domainRow.status === 'disabled' && 'Disabled'}
          </span>
        )}
      </div>

      {errorMessage && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
          {successMessage}
        </div>
      )}

      {!domainRow ? (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
                Email Prefix
              </label>
              <input
                type="text"
                value={localPartInput}
                onChange={(e) => setLocalPartInput(e.target.value)}
                placeholder="quotes"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
                Your Domain
              </label>
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="eliteelectricians.com"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            💡 <strong>Safe for your existing email:</strong> This only configures outbound sending for Let&apos;s Get Quoted quotes and invoices. It will not touch your inbox or interfere with Google Workspace, Microsoft 365, or any email you already receive.
          </div>

          <div>
            <button
              type="submit"
              disabled={isPending || !domainInput.trim()}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Connecting...' : 'Connect Email Domain'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                {domainRow.from_local_part}@{domainRow.domain}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {domainRow.status === 'verified'
                  ? 'Active · DKIM & SPF aligned to your domain'
                  : 'Pending DNS verification · Outbound mail currently uses platform default'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              style={{
                background: 'transparent',
                border: '1px solid #e2e8f0',
                color: '#dc2626',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </div>

          {domainRow.status !== 'verified' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                  Required DNS Records
                </h4>

                <select
                  value={selectedProviderId}
                  onChange={(e) => setSelectedProviderId(e.target.value)}
                  style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  {DNS_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProvider.dnsUrl(domainRow.domain) && (
                <div style={{ marginBottom: '12px' }}>
                  <a
                    href={selectedProvider.dnsUrl(domainRow.domain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: '#0284c7', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {selectedProvider.openLabel || `Open ${selectedProvider.name} DNS Settings ↗`}
                  </a>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {domainRow.dns_records.map((rec, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'grid',
                      gridTemplateColumns: '80px 1.5fr 2fr 70px',
                      gap: '12px',
                      alignItems: 'center',
                      fontSize: '13px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        TYPE
                      </span>
                      <strong>{rec.type}</strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        NAME / HOST
                      </span>
                      <code style={{ wordBreak: 'break-all', fontSize: '12px' }}>{rec.name}</code>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        VALUE / TARGET
                      </span>
                      <code style={{ wordBreak: 'break-all', fontSize: '12px' }}>
                        {rec.priority ? `[Priority ${rec.priority}] ` : ''}
                        {rec.value}
                      </code>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleCopy(`rec-${i}`, rec.value)}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedKey === `rec-${i}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={isPending}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? 'Checking DNS...' : 'Check Connection'}
                </button>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  DNS changes usually take 5–15 minutes, but can take up to 24 hours depending on your registrar.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
