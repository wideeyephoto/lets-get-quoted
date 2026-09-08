/**
 * Backward-compatibility re-export.
 *
 * All fabricated loan amortization calculators (calculateMonthlyPayment,
 * calculateFinancingOptions, 0% promo / fixed APR generators) have been
 * permanently removed in compliance with Truth in Lending Act (TILA § 1026.24 / Reg Z).
 */
export { calculateEarlyPayDiscount } from './early-pay-discount';
