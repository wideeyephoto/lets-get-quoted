import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');

for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const { provisionManagedMetaCampaign, getMetaAdsConfig, pauseMetaCampaign } = await import('../src/lib/meta-ads-api.js');

console.log('===============================================================');
console.log('  Launching 1-Day Canary Meta Ads Campaign');
console.log('===============================================================');

async function runCanary() {
  const config = getMetaAdsConfig();
  console.log(`Ad Account: ${config.adAccountId}`);
  console.log(`Page ID:    ${config.pageId}`);

  console.log('\n[1/3] Provisioning managed Meta campaign via application code...');
  const res = await provisionManagedMetaCampaign({
    accountId: '7caf66e2-7c05-4d7d-a768-83f2da784713',
    businessName: "Let's Get Quoted Canary",
    trade: 'Plumbing',
    city: 'Troy, MI',
    radiusMiles: 1,
    monthlyBudgetDollars: 152, // ~$5/day
    landingPageUrl: 'https://letsgetquoted.com',
    durationDays: 1,
  });

  console.log('Provisioning result:', JSON.stringify(res, null, 2));

  if (!res.success) {
    console.error('\n[FAIL] Canary launch failed:', res.message);
    process.exit(1);
  }

  console.log('\n[2/3] Campaign successfully provisioned on Meta!');
  console.log(`  Campaign ID: ${res.campaignId}`);
  console.log(`  AdSet ID:    ${res.adSetId}`);
  console.log(`  Creative ID: ${res.creativeId}`);
  console.log(`  Ad ID:       ${res.adId}`);

  console.log('\n[3/3] Pausing canary campaign so it does not spend unmonitored funds...');
  const pauseRes = await pauseMetaCampaign(res.campaignId);
  console.log('  Pause result:', pauseRes);

  console.log('\n[SUCCESS] 1-Day Canary Campaign launched and verified successfully on Meta!');
}

runCanary().catch(err => {
  console.error('Fatal canary error:', err);
  process.exit(1);
});
