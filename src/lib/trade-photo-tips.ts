/**
 * Provides contextual, trade-aware camera guidance tips to help homeowners
 * capture the most useful photos for accurate AI estimates.
 */
export function getTradePhotoTip(trade?: string | null, description?: string | null): string {
  const combined = `${trade || ''} ${description || ''}`.toLowerCase();

  if (
    combined.includes('water heater') ||
    combined.includes('plumb') ||
    combined.includes('drain') ||
    combined.includes('faucet') ||
    combined.includes('pipe') ||
    combined.includes('leak')
  ) {
    return '💡 Tip: Stand back 3–4 ft to capture both the connected pipes and the base of the unit. Rating labels help!';
  }

  if (
    combined.includes('panel') ||
    combined.includes('breaker') ||
    combined.includes('electric') ||
    combined.includes('wiring') ||
    combined.includes('outlet') ||
    combined.includes('ev charger') ||
    combined.includes('generator')
  ) {
    return '💡 Tip: Open the panel door so circuit breakers, capacity rating, and labels are visible.';
  }

  if (
    combined.includes('hvac') ||
    combined.includes('ac') ||
    combined.includes('air condition') ||
    combined.includes('furnace') ||
    combined.includes('heat pump') ||
    combined.includes('thermostat')
  ) {
    return '💡 Tip: Snap the indoor furnace data badge and outdoor condenser unit if accessible.';
  }

  if (
    combined.includes('roof') ||
    combined.includes('shingle') ||
    combined.includes('gutter') ||
    combined.includes('siding') ||
    combined.includes('fascia')
  ) {
    return '💡 Tip: Step back across the yard so the full roofline, pitch, and surrounding area are in view.';
  }

  if (
    combined.includes('paint') ||
    combined.includes('drywall') ||
    combined.includes('wall') ||
    combined.includes('ceiling') ||
    combined.includes('flooring') ||
    combined.includes('tile')
  ) {
    return '💡 Tip: Take one wide photo of the full room/wall and one closer photo of the damaged area.';
  }

  if (
    combined.includes('tree') ||
    combined.includes('landscape') ||
    combined.includes('lawn') ||
    combined.includes('fence') ||
    combined.includes('deck')
  ) {
    return '💡 Tip: Show the full yard or tree relative to nearby structures, driveways, or property lines.';
  }

  return '💡 Tip: Step back 3–5 ft to capture the whole problem area and surrounding fixtures in good light.';
}
