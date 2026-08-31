/**
 * Financial Precision & 100% Exact Number Math Engine
 *
 * Prevents IEEE 754 floating-point arithmetic drift by performing all monetary
 * operations in integer cents and applying Hare-Niemeyer largest-remainder penny
 * allocation for milestone and fee distributions.
 */

/**
 * Converts a dollar amount to integer cents safely, handling floats and strings.
 */
export function toIntegerCents(dollars: number | string): number {
  if (typeof dollars === 'string') {
    const sanitized = dollars.replace(/[^0-9.-]+/g, '');
    const parsed = Number.parseFloat(sanitized);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

/**
 * Converts integer cents back to standard decimal dollar representation.
 */
export function fromIntegerCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/**
 * Formats a numeric dollar amount to standard USD format with 2 decimal places.
 */
export function formatExactUsd(amount: number | string): string {
  const cents = toIntegerCents(amount);
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Hare-Niemeyer / Largest-Remainder Penny Allocation Algorithm.
 *
 * Allocates a total contract value across N percentage stages with EXACT penny precision.
 * Guarantees: sum(allocated dollars) === total contract dollars (zero dropped pennies).
 */
export function allocateMilestoneCents(
  totalContractDollars: number | string,
  stagePercentages: number[],
): Array<{ percentage: number; cents: number; dollars: number }> {
  const totalCents = toIntegerCents(totalContractDollars);
  if (totalCents <= 0 || stagePercentages.length === 0) {
    return stagePercentages.map((pct) => ({ percentage: pct, cents: 0, dollars: 0 }));
  }

  // 1. Calculate floor cents and fractional remainders for each stage
  const rawShares = stagePercentages.map((pct, idx) => {
    const rawCents = (totalCents * pct) / 100;
    const floorCents = Math.floor(rawCents);
    const remainder = rawCents - floorCents;
    return { idx, percentage: pct, floorCents, remainder };
  });

  // 2. Sum base floor cents and determine remaining pennies to distribute
  const sumFloorCents = rawShares.reduce((sum, s) => sum + s.floorCents, 0);
  let penniesToDistribute = totalCents - sumFloorCents;

  // 3. Sort by largest fractional remainder to distribute residual pennies fairly
  const sortedShares = [...rawShares].sort((a, b) => b.remainder - a.remainder);

  const finalAllocations: number[] = new Array(stagePercentages.length).fill(0);
  for (const s of sortedShares) {
    let allocated = s.floorCents;
    if (penniesToDistribute > 0) {
      allocated += 1;
      penniesToDistribute -= 1;
    }
    finalAllocations[s.idx] = allocated;
  }

  return stagePercentages.map((pct, idx) => ({
    percentage: pct,
    cents: finalAllocations[idx],
    dollars: fromIntegerCents(finalAllocations[idx]),
  }));
}

/**
 * Calculates exact cash change and shortfall for field collection.
 */
export function calculateCashChangeCents(
  tenderedDollars: number | string,
  amountDueDollars: number | string,
): {
  tenderedCents: number;
  dueCents: number;
  changeCents: number;
  changeDollars: number;
  isSufficient: boolean;
  shortfallDollars: number;
} {
  const tenderedCents = toIntegerCents(tenderedDollars);
  const dueCents = toIntegerCents(amountDueDollars);

  const isSufficient = tenderedCents >= dueCents;
  const changeCents = isSufficient ? tenderedCents - dueCents : 0;
  const shortfallCents = isSufficient ? 0 : dueCents - tenderedCents;

  return {
    tenderedCents,
    dueCents,
    changeCents,
    changeDollars: fromIntegerCents(changeCents),
    isSufficient,
    shortfallDollars: fromIntegerCents(shortfallCents),
  };
}

/**
 * Calculates compliant credit card surcharge and net total in integer cents.
 */
export function calculateSurchargeCents(
  amountDollars: number | string,
  surchargeRatePercent: number,
): {
  baseCents: number;
  surchargeCents: number;
  surchargeDollars: number;
  totalWithSurchargeCents: number;
  totalWithSurchargeDollars: number;
} {
  const baseCents = toIntegerCents(amountDollars);
  const rate = Math.max(0, Math.min(3.0, surchargeRatePercent)); // 3.0% legal compliance cap
  const surchargeCents = Math.round((baseCents * rate) / 100);
  const totalWithSurchargeCents = baseCents + surchargeCents;

  return {
    baseCents,
    surchargeCents,
    surchargeDollars: fromIntegerCents(surchargeCents),
    totalWithSurchargeCents,
    totalWithSurchargeDollars: fromIntegerCents(totalWithSurchargeCents),
  };
}

/**
 * Verifies double-entry accounting balance down to zero cents discrepancy.
 */
export function verifyDoubleEntryBalance(
  entries: Array<{ debit: number; credit: number }>,
): {
  isBalanced: boolean;
  totalDebitsCents: number;
  totalCreditsCents: number;
  deltaCents: number;
} {
  let totalDebitsCents = 0;
  let totalCreditsCents = 0;

  for (const e of entries) {
    totalDebitsCents += toIntegerCents(e.debit);
    totalCreditsCents += toIntegerCents(e.credit);
  }

  const deltaCents = Math.abs(totalDebitsCents - totalCreditsCents);

  return {
    isBalanced: deltaCents === 0,
    totalDebitsCents,
    totalCreditsCents,
    deltaCents,
  };
}
