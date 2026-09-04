import { spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';

const DOMAIN = 'letsgetquoted.com';
const DMARC_SUBDOMAIN = '_dmarc';
const RUA_EMAIL = 'mailto:dmarc@letsgetquoted.com';

const STAGES = {
  'none': 'v=DMARC1; p=none; rua=mailto:dmarc@letsgetquoted.com; fo=1',
  'quarantine-10': 'v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@letsgetquoted.com; fo=1',
  'quarantine-100': 'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@letsgetquoted.com; fo=1',
  'reject': 'v=DMARC1; p=reject; rua=mailto:dmarc@letsgetquoted.com; fo=1',
};

function runVercel(args) {
  const result = spawnSync('npx.cmd', ['--yes', 'vercel@56.2.0', ...args], {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Vercel command failed: ${result.stderr || result.stdout || 'Unknown error'}`);
  }
  return result.stdout;
}

async function fetchDnsJson() {
  const output = runVercel(['dns', 'ls', DOMAIN]);
  const lines = output.split(/\r?\n/);
  const records = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Vercel CLI') || trimmed.startsWith('>') || trimmed.startsWith('letsgetquoted') || trimmed.startsWith('id ')) {
      continue;
    }
    // Match columns: id, name, type, value, created
    // Regex for rec_... or default
    const match = trimmed.match(/^(rec_[a-f0-9]+|\s+)\s+([^\s]*)\s+(TXT|MX|ALIAS|CAA|CNAME|A|AAAA)\s+(.+?)\s+([0-9]+[a-z]\s+ago|default)$/i);
    if (match) {
      records.push({
        id: match[1].trim(),
        name: match[2].trim(),
        type: match[3].trim().toUpperCase(),
        value: match[4].trim(),
        created: match[5].trim(),
      });
    }
  }
  return records;
}

async function verifyDoh(name, type = 'TXT') {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
    const data = await res.json();
    return (data.Answer || []).map((a) => a.data.replace(/^"|"$/g, ''));
  } catch (err) {
    return [`Error querying DoH: ${err.message}`];
  }
}

async function showStatus() {
  console.log(`\n=== DNS & DMARC Status for ${DOMAIN} ===\n`);
  const records = await fetchDnsJson();

  console.log('Managed Vercel DNS Records:');
  for (const r of records) {
    if (['TXT', 'MX'].includes(r.type)) {
      console.log(`  [${r.type}] ${r.name || '@'} (id: ${r.id}): ${r.value}`);
    }
  }

  console.log('\nLive Google Public DNS (DoH) Resolution:');
  const rootTxt = await verifyDoh(DOMAIN, 'TXT');
  console.log(`  TXT @ (${DOMAIN}):`);
  rootTxt.forEach((t) => console.log(`    - ${t}`));

  const dmarcTxt = await verifyDoh(`_dmarc.${DOMAIN}`, 'TXT');
  console.log(`  TXT _dmarc (${DMARC_SUBDOMAIN}.${DOMAIN}):`);
  dmarcTxt.forEach((t) => console.log(`    - ${t}`));

  const sendTxt = await verifyDoh(`send.${DOMAIN}`, 'TXT');
  console.log(`  TXT send (send.${DOMAIN}):`);
  sendTxt.forEach((t) => console.log(`    - ${t}`));

  const dkimTxt = await verifyDoh(`resend._domainkey.${DOMAIN}`, 'TXT');
  console.log(`  TXT resend._domainkey (resend._domainkey.${DOMAIN}):`);
  dkimTxt.forEach((t) => console.log(`    - ${t}`));
}

async function addRootSpf() {
  console.log(`\nChecking root SPF for ${DOMAIN}...`);
  const records = await fetchDnsJson();
  const existingSpf = records.find((r) => r.type === 'TXT' && !r.name && r.value.includes('v=spf1'));

  if (existingSpf) {
    console.log(`Root SPF record already exists: ${existingSpf.value} (ID: ${existingSpf.id})`);
    return;
  }

  const rootSpfValue = 'v=spf1 include:_spf.google.com ~all';
  console.log(`Adding root SPF record: ${rootSpfValue}`);
  const out = runVercel(['dns', 'add', DOMAIN, '@', 'TXT', `"${rootSpfValue}"`]);
  console.log(out.trim());

  console.log('Verifying propagation via Google DoH...');
  const check = await verifyDoh(DOMAIN, 'TXT');
  console.log('Current root TXT:', check);
}

async function setDmarcStage(stageKey) {
  const targetRecord = STAGES[stageKey];
  if (!targetRecord) {
    console.error(`Invalid stage '${stageKey}'. Allowed: ${Object.keys(STAGES).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nTransitioning DMARC to stage: [${stageKey}]`);
  console.log(`Target Record: "${targetRecord}"`);

  const records = await fetchDnsJson();
  const existingDmarc = records.find((r) => r.type === 'TXT' && r.name === '_dmarc');

  if (existingDmarc) {
    if (existingDmarc.value === targetRecord) {
      console.log(`DMARC record already matches target stage! Value: ${existingDmarc.value}`);
      return;
    }
    console.log(`Removing existing DMARC record (ID: ${existingDmarc.id}, value: "${existingDmarc.value}")...`);
    const rmOut = runVercel(['dns', 'rm', existingDmarc.id, '-y']);
    console.log(rmOut.trim());
  }

  console.log(`Adding new DMARC record for ${DMARC_SUBDOMAIN}...`);
  const addOut = runVercel(['dns', 'add', DOMAIN, DMARC_SUBDOMAIN, 'TXT', `"${targetRecord}"`]);
  console.log(addOut.trim());

  console.log('Verifying propagation via Google DoH...');
  const doh = await verifyDoh(`_dmarc.${DOMAIN}`, 'TXT');
  console.log('Current _dmarc TXT:', doh);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status') || args.length === 0) {
    await showStatus();
    return;
  }

  if (args.includes('--add-root-spf')) {
    await addRootSpf();
  }

  const stageArg = args.find((a) => a.startsWith('--stage='));
  if (stageArg) {
    const stageKey = stageArg.split('=')[1];
    await setDmarcStage(stageKey);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
