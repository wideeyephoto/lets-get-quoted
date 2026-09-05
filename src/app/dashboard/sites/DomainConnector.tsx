'use client';

import { useState } from 'react';
import styles from './SiteEditor.module.css';

// Guided custom-domain connector. Not an API integration — it gives each
// provider's current, exact steps, a copy-pasteable CNAME record, and a deep
// link straight into that provider's DNS editor. Steps/labels/URLs verified
// against GoDaddy + Squarespace help docs (2026); "Other" is the generic path.

export type Provider = {
  id: string;
  name: string;
  // Deep link into the provider's DNS editor. GoDaddy embeds the domain;
  // Squarespace lands on the domains list. '' means no deep link (Other).
  dnsUrl: (rootDomain: string) => string;
  openLabel?: string;
  hostLabel: string;
  valueLabel: string;
  steps: string[];
  apex: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: 'godaddy',
    name: 'GoDaddy',
    dnsUrl: (root) => (root ? `https://dcc.godaddy.com/control/${root}/dns` : 'https://dcc.godaddy.com/control/portfolio'),
    openLabel: 'Open GoDaddy DNS settings ↗',
    hostLabel: 'Name',
    valueLabel: 'Value',
    steps: [
      'Click “Open GoDaddy DNS settings” above and sign in if asked.',
      'Select “Add New Record” (older accounts: Additional Settings → Manage DNS → Add).',
      'Set Type to CNAME.',
      'In Name, enter the host below — the prefix only, not the full domain.',
      'In Value, paste the target below (no http://, no trailing slash).',
      'Leave TTL at 1 hour and click Save. Approve any security prompt.',
      'Come back here and click “Check connection”. Changes can take up to an hour.',
    ],
    apex: 'GoDaddy can’t point a bare root domain (no www) with a CNAME. On the DNS page open Forwarding → Add Forwarding, and forward the root domain to https://www.yourdomain.com as a Permanent (301) redirect — the www record above carries it the rest of the way.',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    dnsUrl: () => 'https://account.squarespace.com/domains',
    openLabel: 'Open Squarespace domains ↗',
    hostLabel: 'Name',
    valueLabel: 'Data',
    steps: [
      'Click “Open Squarespace domains” above and sign in.',
      'Click your domain, then “DNS” (or “DNS Settings”) in the side panel.',
      'Under Custom Records, click “Add record”; re-enter your password/2FA if prompted.',
      'Set Type to CNAME.',
      'In Name, enter the host below. In Data, paste the target below.',
      'Click Save. If it says the record conflicts, delete the existing “www” record first, then re-add.',
      'Come back here and click “Check connection”. DNS can take 24–48 hours.',
    ],
    apex: 'For a bare root domain, add an ALIAS record instead: Type ALIAS, Name @, Data domains.letsgetquoted.com (turn DNSSEC off first and delete any existing apex A records). Or add a Domain Forwarding rule from @ to https://www.yourdomain.com as a 301.',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    dnsUrl: () => 'https://dash.cloudflare.com/',
    openLabel: 'Open Cloudflare Dashboard ↗',
    hostLabel: 'Name',
    valueLabel: 'Target',
    steps: [
      'Click “Open Cloudflare Dashboard” above and choose your domain zone.',
      'Go to DNS → Records and click “Add record”.',
      'Set Type to CNAME.',
      'In Name, enter the host below (e.g. www).',
      'In Target, paste the value below.',
      'IMPORTANT: Set Proxy status to “DNS only” (Grey cloud) initially so SSL verification completes directly.',
      'Leave TTL at Auto and click Save.',
      'Come back here and click “Check connection”. Changes propagate in minutes.',
    ],
    apex: 'Cloudflare supports CNAME flattening at the root domain (@). You can add a CNAME record with Name: @ and Target: domains.letsgetquoted.com with Proxy status set to DNS only.',
  },
  {
    id: 'namecheap',
    name: 'Namecheap',
    dnsUrl: () => 'https://ap.www.namecheap.com/domains/domainlist/',
    openLabel: 'Open Namecheap Domain List ↗',
    hostLabel: 'Host',
    valueLabel: 'Value',
    steps: [
      'Click “Open Namecheap Domain List” and click “Manage” next to your domain.',
      'Select the “Advanced DNS” tab.',
      'In the Host Records section, click “Add New Record”.',
      'Set Type to CNAME Record.',
      'In Host, enter the prefix shown below (e.g. www).',
      'In Value, paste the target below.',
      'Set TTL to Automatic and click the green checkmark to save.',
      'Come back here and click “Check connection”.',
    ],
    apex: 'Under Advanced DNS, add a URL Redirect Record with Host: @ and Value: https://www.yourdomain.com (Redirect Type: Permanent 301), and the www CNAME record will serve your site.',
  },
  {
    id: 'other',
    name: 'Other provider',
    dnsUrl: () => '',
    hostLabel: 'Host',
    valueLabel: 'Value',
    steps: [
      'Sign in wherever your domain’s DNS is managed (your registrar or DNS host).',
      'Add a new DNS record of type CNAME.',
      'Set the host/name and value shown below.',
      'Save, then come back here and click “Check connection”. DNS can take up to 48 hours.',
    ],
    apex: 'A root domain (no www) can’t use a CNAME. Use your provider’s CNAME flattening / ALIAS / ANAME record at @, or redirect the root to https://www.yourdomain.com.',
  },
];

export default function DomainConnector({ domain, target, apexIp = '76.76.21.21', apexDomain }: { domain: string | null | undefined; target: string; apexIp?: string; apexDomain?: string }) {
  const [providerId, setProviderId] = useState('godaddy');
  const [copied, setCopied] = useState<string | null>(null);

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

      {openUrl && (
        <a className={styles.connectorOpen} href={openUrl} target="_blank" rel="noopener noreferrer">
          {provider.openLabel || `Open ${provider.name} DNS settings ↗`}
        </a>
      )}

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
    </div>
  );
}
