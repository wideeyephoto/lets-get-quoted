'use client';

import { useState } from 'react';
import styles from './SiteEditor.module.css';
import SquarespaceDnsModal from './SquarespaceDnsModal';

// Guided custom-domain connector. Not an API integration — it gives each
// provider's current, exact steps, a copy-pasteable CNAME record, and a deep
// link straight into that provider's DNS editor. Steps/labels/URLs verified
// against GoDaddy + Squarespace help docs (2026); "Other" is the generic path.

import { DNS_PROVIDERS, type DnsProvider } from '@/lib/dns-providers';

export type Provider = DnsProvider;
export const PROVIDERS = DNS_PROVIDERS;

export default function DomainConnector({ domain, target, apexIp = '76.76.21.21', apexDomain }: { domain: string | null | undefined; target: string; apexIp?: string; apexDomain?: string }) {
  const [providerId, setProviderId] = useState('godaddy');
  const [copied, setCopied] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const provider = PROVIDERS.find((item) => item.id === providerId) || PROVIDERS[0];
  const cleanedDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const parts = cleanedDomain.split('.');
  const rootDomain = apexDomain || (parts.length > 2 ? parts.slice(-2).join('.') : cleanedDomain);
  const isApex = cleanedDomain === rootDomain && parts.length >= 2;
  const hostValue = isApex ? '@' : (cleanedDomain.endsWith(`.${rootDomain}`) ? cleanedDomain.slice(0, -(rootDomain.length + 1)) : 'www');
  const openUrl = provider.dnsUrl(rootDomain);

  const records = isApex
    ? [
        { key: 'a-record', type: 'A', hostLabel: provider.hostLabel, host: '@', valueLabel: provider.valueLabel, value: apexIp, note: 'Points root apex domain' },
      ]
    : [
        { key: 'cname', type: 'CNAME', hostLabel: provider.hostLabel, host: hostValue, valueLabel: provider.valueLabel, value: target, note: `Points ${cleanedDomain || 'your custom domain'}` },
      ];

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    });
  };

  return (
    <div className={styles.connector}>
      <div className={styles.connectorHead}>
        <strong>Connect your domain</strong>
        <small>Step-by-step DNS and automatic SSL configuration.</small>
      </div>

      <div className={styles.connectorProviders} role="group" aria-label="Domain provider">
        {PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === providerId}
            className={`${styles.connectorProvider}${item.id === providerId ? ` ${styles.connectorProviderOn}` : ''}`}
            onClick={() => setProviderId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className={styles.connectorActions}>
        {openUrl && (
          <a className={styles.connectorOpen} href={openUrl} target="_blank" rel="noopener noreferrer">
            {provider.openLabel || `Open ${provider.name} DNS settings ↗`}
          </a>
        )}
        {providerId === 'squarespace' && (
          <button
            type="button"
            className={styles.connectorScreenshotBtn}
            onClick={() => setShowGuide(true)}
          >
            📸 View Squarespace Screenshot Guide
          </button>
        )}
      </div>

      <div className={styles.connectorRecord}>
        {records.map((row) => (
          <div key={row.key} style={{ marginBottom: records.length > 1 ? '12px' : '0' }}>
            <div className={styles.connectorRow}>
              <span className={styles.connectorRowLabel}>Type</span>
              <code className={styles.connectorRowValue}>{row.type}</code>
            </div>
            <div className={styles.connectorRow}>
              <span className={styles.connectorRowLabel}>{row.hostLabel}</span>
              <code className={styles.connectorRowValue}>{row.host}</code>
              <button type="button" className={styles.connectorCopy} onClick={() => copy(`${row.key}-host`, row.host)} aria-label={`Copy ${row.hostLabel}`}>
                {copied === `${row.key}-host` ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.connectorRow}>
              <span className={styles.connectorRowLabel}>{row.valueLabel}</span>
              <code className={styles.connectorRowValue}>{row.value}</code>
              <button type="button" className={styles.connectorCopy} onClick={() => copy(`${row.key}-val`, row.value)} aria-label={`Copy ${row.valueLabel}`}>
                {copied === `${row.key}-val` ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ol className={styles.connectorSteps}>
        {(isApex ? [
          `Open ${provider.name === 'Other provider' ? 'your DNS provider' : provider.name} DNS settings for your domain.`,
          `Add an A record with host @ and value ${apexIp}. Replace any conflicting apex A or AAAA records.`,
          'If your provider offers a proxy, use DNS only while SSL is being set up.',
          'Save the record, then come back here and click “Check connection”.',
        ] : provider.steps).map((step, index) => <li key={index}>{step}</li>)}
      </ol>

      <details className={styles.connectorApex}>
        <summary>Automatic HTTPS / SSL Certificate</summary>
        <p>Click “Check connection” to register your domain and begin SSL setup. If ownership verification records appear, add those too. Keep checking until you see “Connected with active SSL”; your free subdomain remains available while setup is pending.</p>
      </details>

      <p className={styles.connectorNote}>If your domain’s nameservers point to another service (e.g. Cloudflare), add this record there instead — records added at your registrar won’t apply.</p>

      {providerId === 'squarespace' && (
        <SquarespaceDnsModal
          isOpen={showGuide}
          onClose={() => setShowGuide(false)}
          isApex={isApex}
          host={records[0]?.host || (isApex ? '@' : 'www')}
          value={records[0]?.value || (isApex ? apexIp : target)}
        />
      )}
    </div>
  );
}
