/**
 * Shared state for the 5-Minute Public Evaluation Demo Journey.
 *
 * Preserves user choices (e.g. optional lighting upgrade toggle, quote sending,
 * customer signature, simulated deposit payment) across step navigation, browser
 * back/forward, and page refreshes in sessionStorage.
 */

export type DemoPaymentMethod = 'apple_pay' | 'card' | null;

export type DemoTourState = {
  intakeAnalyzed: boolean;
  upgradeSelected: boolean;
  quoteSent: boolean;
  signature: string;
  signed: boolean;
  depositSimulated: boolean;
  paymentMethod: DemoPaymentMethod;
};

export const DEFAULT_DEMO_TOUR_STATE: DemoTourState = {
  intakeAnalyzed: false,
  upgradeSelected: true,
  quoteSent: false,
  signature: '',
  signed: false,
  depositSimulated: false,
  paymentMethod: null,
};

const STORAGE_KEY = 'lgq_demo_tour_state_v1';

export function loadDemoTourState(): DemoTourState {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DEMO_TOUR_STATE };
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEMO_TOUR_STATE };
    const parsed = JSON.parse(raw);
    return {
      intakeAnalyzed: Boolean(parsed.intakeAnalyzed),
      upgradeSelected: typeof parsed.upgradeSelected === 'boolean' ? parsed.upgradeSelected : true,
      quoteSent: Boolean(parsed.quoteSent),
      signature: typeof parsed.signature === 'string' ? parsed.signature : '',
      signed: Boolean(parsed.signed),
      depositSimulated: Boolean(parsed.depositSimulated),
      paymentMethod: parsed.paymentMethod === 'card' || parsed.paymentMethod === 'apple_pay' ? parsed.paymentMethod : null,
    };
  } catch {
    return { ...DEFAULT_DEMO_TOUR_STATE };
  }
}

export function saveDemoTourState(state: DemoTourState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Fail silently in sandboxed iframes
  }
}

export function resetDemoTourState(): DemoTourState {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Fail silently
    }
  }
  return { ...DEFAULT_DEMO_TOUR_STATE };
}
