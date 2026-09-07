// Shared DNS provider steps and deep links for registrar guidance.
// Used across website domain and email sending domain connection wizards.

export type DnsProvider = {
  id: string;
  name: string;
  dnsUrl: (rootDomain: string) => string;
  openLabel?: string;
  hostLabel: string;
  valueLabel: string;
  steps: string[];
  apex?: string;
};

export const DNS_PROVIDERS: DnsProvider[] = [
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
      'Select the record Type indicated below.',
      'In Name, enter the host below — the prefix only, not the full domain.',
      'In Value, paste the target/data below.',
      'Leave TTL at 1 hour and click Save. Approve any security prompt.',
      'Come back here and check your connection. Changes can take up to an hour.',
    ],
    apex: 'GoDaddy can’t point a bare root domain (no www) with a CNAME. On the DNS page open Forwarding → Add Forwarding, and forward the root domain to https://www.yourdomain.com as a Permanent (301) redirect.',
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
      'Select the record Type indicated below.',
      'In Name, enter the host below. In Data, paste the target below.',
      'Click Save. If it says the record conflicts, check for duplicate hostnames.',
      'Come back here and check your connection. DNS can take 24–48 hours.',
    ],
    apex: 'For a bare root domain, add an ALIAS record instead: Type ALIAS, Name @, Data domains.letsgetquoted.com (turn DNSSEC off first and delete any existing apex A records).',
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
      'Select the record Type indicated below.',
      'In Name, enter the host below.',
      'In Target, paste the value below.',
      'IMPORTANT: Set Proxy status to “DNS only” (Grey cloud) so validation checks query records directly.',
      'Leave TTL at Auto and click Save.',
      'Come back here and check your connection. Changes propagate in minutes.',
    ],
    apex: 'Cloudflare supports CNAME flattening at the root domain (@).',
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
      'Select the record Type indicated below.',
      'In Host, enter the prefix shown below.',
      'In Value, paste the target below.',
      'Set TTL to Automatic and click the green checkmark to save.',
      'Come back here and check your connection.',
    ],
    apex: 'Under Advanced DNS, add a URL Redirect Record with Host: @ and Value: https://www.yourdomain.com (Redirect Type: Permanent 301).',
  },
  {
    id: 'other',
    name: 'Other provider',
    dnsUrl: () => '',
    hostLabel: 'Host',
    valueLabel: 'Value',
    steps: [
      'Sign in wherever your domain’s DNS is managed (your registrar or DNS host).',
      'Add each new DNS record shown below matching the Type, Host/Name, and Value.',
      'Save, then come back here and check your connection. DNS can take up to 48 hours.',
    ],
    apex: 'A root domain (no www) can’t use a CNAME. Use your provider’s CNAME flattening / ALIAS / ANAME record at @, or redirect the root.',
  },
];
