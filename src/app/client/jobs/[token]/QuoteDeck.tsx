'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { formatUsdExact, formatUsdRounded } from '@/lib/money-format';

/**
 * The state a homeowner is holding in their head while they read a quote.
 *
 * Which upgrades they want, what that makes the total, which day they would
 * rather start, whether they intend to pay it in one go — and their name, once
 * they have decided. All four of those were previously owned by whichever card
 * happened to render the control, which is why the running total lived inside
 * the itemised list and the deposit lived four screens further down with no
 * idea the total above it had changed.
 *
 * One provider owns all of it, so the summary rail, the mobile bar and the
 * document itself are three views of the same numbers rather than three
 * calculations that agree by luck.
 *
 * THE APPROVAL FORM IS THE RAIL, NOT THIS. The add-on checkboxes sit in the
 * document in the main column and are bound to the form in the sidebar by
 * `form={QUOTE_FORM_ID}` — the HTML form-owner attribute, which associates a
 * control with a form it is not inside. That is what lets the button that
 * submits live next to the total it is submitting, on a page where the
 * scheduling, question and payment forms make a wrapping <form> impossible.
 */

export const QUOTE_FORM_ID = 'quote-approve';

export type DeckAddon = {
  id: string;
  label: string;
  amount: number;
  recommended: boolean;
  selected: boolean;
};

export type PayMode = 'full' | 'plan';

/**
 * Enough of a name to be a signature.
 *
 * DELIBERATELY NOT "two words". A rule that insists on a space stops anybody
 * with a single legal name from approving their own quote, on a page whose only
 * recovery path is ringing the contractor to be let past a validator. What this
 * has to stop is an empty box and a stray keystroke, so it asks for two letters
 * and nothing else. The field still asks for a first and last name — it just
 * does not enforce a rule about names that is not true of all of them.
 */
export function isSignature(value: string): boolean {
  return value.replace(/[^\p{L}]/gu, '').length >= 2;
}

type DeckValue = {
  addons: DeckAddon[];
  selected: Record<string, boolean>;
  setAddon: (id: string, on: boolean) => void;
  addonCount: number;
  baseTotal: number;
  addonsTotal: number;
  /** What they have actually chosen, to the cent. */
  total: number;
  /** The same number mid-animation. Settles on `total`; equal to it at rest. */
  shownTotal: number;
  signer: string;
  setSigner: (value: string) => void;
  signerValid: boolean;
  /** The start date they have highlighted, as a label. Null until they pick. */
  preferredDate: string | null;
  setPreferredDate: (label: string | null) => void;
  payMode: PayMode | null;
  setPayMode: (mode: PayMode) => void;
  awaitingApproval: boolean;
};

const DeckContext = createContext<DeckValue | null>(null);

export function useQuoteDeck(): DeckValue {
  const value = useContext(DeckContext);
  // Thrown rather than defaulted: a rail that quietly renders $0.00 because a
  // provider went missing is a wrong number in front of somebody about to
  // agree to it. Every consumer is inside the provider, and the build says so.
  if (!value) throw new Error('useQuoteDeck must be used inside QuoteDeckProvider.');
  return value;
}

export function QuoteDeckProvider({
  addons,
  baseTotal,
  awaitingApproval,
  /** Pre-selected when the contractor only offers one route. */
  initialPayMode = null,
  children,
}: {
  addons: DeckAddon[];
  baseTotal: number;
  awaitingApproval: boolean;
  initialPayMode?: PayMode | null;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addons.map((addon) => [addon.id, addon.selected])),
  );
  const [signer, setSigner] = useState('');
  const [preferredDate, setPreferredDate] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PayMode | null>(initialPayMode);

  const setAddon = useCallback((id: string, on: boolean) => {
    setSelected((current) => ({ ...current, [id]: on }));
  }, []);

  const addonsTotal = addons.reduce((sum, addon) => (selected[addon.id] ? sum + addon.amount : sum), 0);
  const addonCount = addons.reduce((count, addon) => (selected[addon.id] ? count + 1 : count), 0);
  const total = baseTotal + addonsTotal;

  // Count the headline total up or down when an add-on is toggled, so the
  // number visibly answers the tap. Honors reduced-motion, and settles on the
  // exact cents-accurate value at rest — the animation is never what is read.
  const [shownTotal, setShownTotal] = useState(total);
  const shownRef = useRef(total);
  shownRef.current = shownTotal;
  useEffect(() => {
    const from = shownRef.current;
    if (from === total) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShownTotal(total);
      return;
    }
    const start = performance.now();
    const duration = 380;
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShownTotal(from + (total - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setShownTotal(total);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  const value = useMemo<DeckValue>(
    () => ({
      addons,
      selected,
      setAddon,
      addonCount,
      baseTotal,
      addonsTotal,
      total,
      shownTotal,
      signer,
      setSigner,
      signerValid: isSignature(signer),
      preferredDate,
      setPreferredDate,
      payMode,
      setPayMode,
      awaitingApproval,
    }),
    [addons, selected, setAddon, addonCount, baseTotal, addonsTotal, total, shownTotal, signer, preferredDate, payMode, awaitingApproval],
  );

  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>;
}

/**
 * The bar that stays on a phone.
 *
 * A quote is read top to bottom on a 360px screen and the total lives in a rail
 * that is now the last thing on the page, so between the first line item and
 * the bottom of the document there was nothing on screen answering "what is
 * this going to cost me". This is that answer, pinned, plus the one action.
 *
 * It scrolls to the approval panel rather than submitting. A fixed bar that
 * commits somebody to a contract with one thumb press, while they are halfway
 * through reading it, is the wrong control — "Review & approve" is a promise to
 * take them to the decision, not to make it for them.
 */
export function QuoteBottomBar({ label = 'Review & approve' }: { label?: string }) {
  const { awaitingApproval } = useQuoteDeck();
  if (!awaitingApproval) return null;
  return (
    <div className="quote-bottom-bar">
      <span className="quote-bottom-total">
        <small>Your total</small>
        <LiveTotal className="quote-bottom-amount" />
      </span>
      <a className="btn primary quote-bottom-cta" href={`#${QUOTE_FORM_ID}`}>
        {label}
      </a>
    </div>
  );
}

/**
 * The live total, wherever it needs to appear.
 *
 * Cents at rest, whole dollars while it is moving — two decimal places on a
 * number changing sixty times a second is noise, and the frame that matters is
 * the one it stops on.
 */
export function LiveTotal({ className, live = false }: { className?: string; live?: boolean }) {
  const { total, shownTotal } = useQuoteDeck();
  const atRest = Math.abs(shownTotal - total) < 0.005;
  return (
    /* Announced from ONE place. The same total renders in the rail, the mobile
       bar, the document and the button label; four live regions would read the
       new figure four times to somebody on a screen reader every time they
       ticked a box. */
    <span className={className} aria-live={live ? 'polite' : undefined}>
      {atRest ? formatUsdExact(total) : formatUsdRounded(shownTotal)}
    </span>
  );
}
