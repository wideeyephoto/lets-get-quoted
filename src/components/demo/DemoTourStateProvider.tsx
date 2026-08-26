'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  loadDemoTourState,
  saveDemoTourState,
  resetDemoTourState,
  DEFAULT_DEMO_TOUR_STATE,
  type DemoTourState,
  type DemoPaymentMethod,
} from '@/lib/demo-tour-state';

type DemoTourContextValue = {
  state: DemoTourState;
  setIntakeAnalyzed: (val: boolean) => void;
  setUpgradeSelected: (val: boolean) => void;
  setQuoteSent: (val: boolean) => void;
  setSignature: (val: string) => void;
  setSigned: (val: boolean) => void;
  setDepositSimulated: (val: boolean, method?: DemoPaymentMethod) => void;
  resetTourState: () => void;
};

const DemoTourContext = createContext<DemoTourContextValue | null>(null);

export function DemoTourStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoTourState>(DEFAULT_DEMO_TOUR_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadDemoTourState());
    setHydrated(true);
  }, []);

  const updateState = useCallback((updater: (prev: DemoTourState) => DemoTourState) => {
    setState((prev) => {
      const next = updater(prev);
      saveDemoTourState(next);
      return next;
    });
  }, []);

  const setIntakeAnalyzed = useCallback((val: boolean) => {
    updateState((prev) => ({ ...prev, intakeAnalyzed: val }));
  }, [updateState]);

  const setUpgradeSelected = useCallback((val: boolean) => {
    updateState((prev) => ({ ...prev, upgradeSelected: val }));
  }, [updateState]);

  const setQuoteSent = useCallback((val: boolean) => {
    updateState((prev) => ({ ...prev, quoteSent: val }));
  }, [updateState]);

  const setSignature = useCallback((val: string) => {
    updateState((prev) => ({ ...prev, signature: val, signed: Boolean(val.trim()) }));
  }, [updateState]);

  const setSigned = useCallback((val: boolean) => {
    updateState((prev) => ({ ...prev, signed: val }));
  }, [updateState]);

  const setDepositSimulated = useCallback((val: boolean, method: DemoPaymentMethod = 'apple_pay') => {
    updateState((prev) => ({ ...prev, depositSimulated: val, paymentMethod: val ? method : null }));
  }, [updateState]);

  const resetTourStateAction = useCallback(() => {
    const fresh = resetDemoTourState();
    setState(fresh);
  }, []);

  return (
    <DemoTourContext.Provider
      value={{
        state: hydrated ? state : DEFAULT_DEMO_TOUR_STATE,
        setIntakeAnalyzed,
        setUpgradeSelected,
        setQuoteSent,
        setSignature,
        setSigned,
        setDepositSimulated,
        resetTourState: resetTourStateAction,
      }}
    >
      {children}
    </DemoTourContext.Provider>
  );
}

export function useDemoTourState() {
  const ctx = useContext(DemoTourContext);
  if (!ctx) {
    throw new Error('useDemoTourState must be used within DemoTourStateProvider');
  }
  return ctx;
}
