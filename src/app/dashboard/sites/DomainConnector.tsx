'use client';

import { useState } from 'react';
import styles from './SiteEditor.module.css';

// Guided custom-domain connector. Not an API integration — it gives each
// provider's current, exact steps, a copy-pasteable CNAME record, and a deep
// link straight into that provider's DNS editor. Steps/labels/URLs verified
// against GoDaddy + Squarespace help docs (2026); "Other" is the generic path.

type Provider = {
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

const PROVIDERS: Provider[] = [
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
      'Come back here and click “Verify DNS”. Changes can take up to an hour.',
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
      'Come back here and click “Verify DNS”. DNS can take 24–48 hours.',
    ],
    apex: 'For a bare root domain, add an ALIAS record instead: Type ALIAS, Name @, Data domains.letsgetquoted.com (turn DNSSEC off first and delete any existing apex A records). Or add a Domain Forwarding rule from @ to https://www.yourdomain.com as a 301.',
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
      'Save, then come back here and click “Verify DNS”. DNS can take up to 48 hours.',
    ],
    apex: 'A root domain (no www) can’t use a CNAME. Use your provider’s CNAME flattening / ALIAS / ANAME record at @, or redirect the root to https://www.yourdomain.com.',
  },
];

export default function DomainConnector({ domain, target }: { domain: string | null | undefined; target: string }) {
  const [providerId, setProviderId] = useState('godaddy');
  const [copied, setCopied] = useState<string | null>(null);

  const provider = PROVIDERS.find((item) => item.id === providerId) || PROVIDERS[0];
  const rootDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const openUrl = provider.dnsUrl(rootDomain);

  const record = [
    { key: 'type', label: 'Type', value: 'CNAME' },
    { key: 'host', label: provider.hostLabel, value: 'www' },
    { key: 'value', label: provider.valueLabel, value: target },
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
        <small>Pick where you bought your domain for step-by-step setup.</small>
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
          {provider.openLabel}
        </a>
      )}

      <div className={styles.connectorRecord}>
        {record.map((row) => (
          <div key={row.key} className={styles.connectorRow}>
            <span className={styles.connectorRowLabel}>{row.label}</span>
            <code className={styles.connectorRowValue}>{row.value}</code>
            <button type="button" className={styles.connectorCopy} onClick={() => copy(row.key, row.value)} aria-label={`Copy ${row.label}`}>
              {copied === row.key ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
      </div>

      <ol className={styles.connectorSteps}>
        {provider.steps.map((step, index) => <li key={index}>{step}</li>)}
      </ol>

      <details className={styles.connectorApex}>
        <summary>Using your root domain (no “www”)?</summary>
        <p>{provider.apex}</p>
      </details>

      <p className={styles.connectorNote}>If your domain’s nameservers point to another service (e.g. Cloudflare), add this record there instead — records added at your registrar won’t apply.</p>
    </div>
  );
}
