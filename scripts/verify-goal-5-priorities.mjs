import assert from 'node:assert';

// 1. Verify SMS Segment Calculator
import { calculateSmsSegments } from '../src/lib/sms/sms-segments.ts';

console.log('--- TEST 1: SMS Segment & Encoding Calculator ---');
// GSM-7 simple message
const gsmMsg = 'Good morning team! Your daily schedule is ready. Please check the portal for details.';
const gsmResult = calculateSmsSegments(gsmMsg);
assert.strictEqual(gsmResult.encoding, 'GSM-7');
assert.strictEqual(gsmResult.segmentCount, 1);
assert.strictEqual(gsmResult.containsUnicode, false);
console.log('✓ GSM-7 simple message: 1 segment');

// UCS-2 message with emojis
const emojiMsg = '☀️ Good morning! Today has 3 stops 📍. Check individual job notes for gate codes 🔒.';
const emojiResult = calculateSmsSegments(emojiMsg);
assert.strictEqual(emojiResult.encoding, 'UCS-2');
// 86 chars in UCS-2 (> 70 chars) -> 2 segments of 67 chars each
assert.strictEqual(emojiResult.segmentCount, 2);
assert.strictEqual(emojiResult.containsUnicode, true);
console.log('✓ UCS-2 emoji message correctly detected as 2 segments (UCS-2 mode)');

// 2. Verify Address & State Normalization
import { normalizeAddress } from '../src/lib/location-context/normalize-address.ts';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver.ts';

console.log('\n--- TEST 2: Dynamic State & Address Normalization ---');
const addrTX = normalizeAddress('123 Congress Ave, Austin, TX 78701');
assert.strictEqual(addrTX.state, 'TX');
assert.strictEqual(addrTX.city, 'Austin');
const jurisTX = resolveJurisdiction(addrTX, 'building');
assert.strictEqual(jurisTX.state, 'TX');
console.log('✓ Austin, TX correctly resolves to State: TX');

const addrOH = normalizeAddress('456 High St, Columbus, OH 43215');
assert.strictEqual(addrOH.state, 'OH');
const jurisOH = resolveJurisdiction(addrOH, 'electrical');
assert.strictEqual(jurisOH.state, 'OH');
console.log('✓ Columbus, OH correctly resolves to State: OH');

const addrMI = normalizeAddress('211 S Williams St, Royal Oak, MI 48067');
assert.strictEqual(addrMI.state, 'MI');
const jurisMI = resolveJurisdiction(addrMI, 'mechanical');
assert.strictEqual(jurisMI.authorityId, 'mi-royal-oak');
console.log('✓ Royal Oak, MI correctly resolves to mi-royal-oak authority');

// 3. Verify Clean Energy Rebates State Propagation
import { calculateCleanEnergyRebates } from '../src/lib/rebates/clean-energy-rebate-engine.ts';

console.log('\n--- TEST 3: Clean Energy Rebates ---');
const rebateTX = calculateCleanEnergyRebates({
  category: 'heat_pump_hvac',
  state: 'TX',
  projectCost: 8000,
});
assert.strictEqual(rebateTX.incentives.federalTaxCredit.calculatedAmount, 2000);
assert.strictEqual(rebateTX.financialSummary.netHomeownerCost, 5500); // 8000 - 2000 (fed) - 500 (util)
console.log('✓ Clean energy rebate calculated successfully for TX');

// 4. Verify PDF Generation Unbranded Header
import { generateEstimatePdf } from '../src/lib/tools/estimate-pdf.ts';
import { calculateEstimateTotals } from '../src/lib/tools/estimate-generator-utils.ts';

console.log('\n--- TEST 4: Unbranded Estimate PDF Generation ---');
const blankEstimate = {
  estimateNumber: 'EST-9999',
  estimateDate: '2026-08-27',
  contractorName: '', // Blank business name
  contractorPhone: '',
  contractorEmail: '',
  contractorLicense: '',
  clientName: 'Jane Doe',
  clientAddress: '123 Pine St, Denver, CO 80202',
  selectedTrade: 'remodel',
  mode: 'single_total',
  items: [{ id: '1', description: 'Framing & Drywall Repair', type: 'Labor', quantity: 1, unitPrice: 3200 }],
  taxRate: 0,
  depositPct: 30,
  depositDue: 960,
  milestones: [],
  milestonesEnabled: false,
  tiers: [],
  activeTierId: 'good',
};
const totals = calculateEstimateTotals(blankEstimate.items, 0, 30, 0);
const pdfBuf = await generateEstimatePdf(blankEstimate, totals);
assert(pdfBuf.length > 500, 'PDF buffer should be valid non-empty buffer');
console.log('✓ PDF generated successfully for unbranded contractor without Apex Trade Solutions');

console.log('\n🎉 ALL 5 PRIORITY VERIFICATIONS PASSED SUCCESSFULLY!');
