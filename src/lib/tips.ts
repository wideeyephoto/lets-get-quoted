/**
 * Crew Tip & Gratuity Calculation & Allocation.
 *
 * Allows homeowners to easily tip field service technicians upon invoice settlement.
 * Tips are tracked per job and allocated across assigned crew members in payroll.
 */

export type TipOption = {
  percentage: number;
  amount: number;
  formattedAmount: string;
  totalWithTip: number;
};

export type CrewTipShare = {
  crewId: string;
  crewName: string;
  shareAmount: number;
  formattedShare: string;
};

export const DEFAULT_TIP_PERCENTAGES = [10, 15, 20] as const;

/**
 * Calculates predefined percentage tip amounts and rounded totals.
 */
export function calculateTipOptions(
  subtotal: number,
  percentages: readonly number[] = DEFAULT_TIP_PERCENTAGES
): TipOption[] {
  if (subtotal <= 0) return [];

  return percentages.map((pct) => {
    const rawTip = (subtotal * pct) / 100;
    // Round to whole dollar if >= $100, otherwise round to nearest 50 cents
    const tipAmount = subtotal >= 100 ? Math.round(rawTip) : Math.round(rawTip * 2) / 2;
    const totalWithTip = Math.round((subtotal + tipAmount) * 100) / 100;

    return {
      percentage: pct,
      amount: tipAmount,
      formattedAmount: formatCurrency(tipAmount),
      totalWithTip,
    };
  });
}

/**
 * Splits tip amount evenly among assigned crew members for payroll distribution.
 */
export function allocateTipToCrew(
  tipAmount: number,
  crewMembers: Array<{ id: string; name: string }>
): CrewTipShare[] {
  if (tipAmount <= 0 || crewMembers.length === 0) return [];

  const perMemberRaw = tipAmount / crewMembers.length;
  const shareAmount = Math.round(perMemberRaw * 100) / 100;

  return crewMembers.map((member) => ({
    crewId: member.id,
    crewName: member.name,
    shareAmount,
    formattedShare: formatCurrency(shareAmount),
  }));
}

/**
 * Formats a clean receipt line item description for tips.
 */
export function formatTipReceiptCopy(subtotal: number, tipAmount: number, crewName?: string | null): string {
  if (tipAmount <= 0) return `Total: ${formatCurrency(subtotal)}`;

  const recipient = crewName ? ` (${crewName})` : ' (Crew)';
  return `Subtotal: ${formatCurrency(subtotal)} + Tech Gratuity${recipient}: ${formatCurrency(tipAmount)} = Total: ${formatCurrency(subtotal + tipAmount)}`;
}

function formatCurrency(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
