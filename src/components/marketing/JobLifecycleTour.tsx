'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { JOB_TOUR_STEPS, JOB_TOUR_STORAGE_KEY, JOB_TOUR_VERSION, INITIAL_JOB_TOUR_STATE, normalizeJobTourStep, restoreJobTourState, updateJobTourState, type JobTourState, type JobTourStep } from '@/lib/job-lifecycle-tour';
import { trackDemoEvent, type DemoEventName } from '@/lib/demo-analytics';
import styles from './job-lifecycle-tour.module.css';

type TourContext = { isOpen: boolean; open: (launcher: HTMLButtonElement) => void };
const Context = createContext<TourContext>({ isOpen: false, open: () => {} });
export const useJobLifecycleTour = () => useContext(Context);
export type TourPanelProps = {
  state: JobTourState;
  previewResult?: boolean;
  update: (patch: Partial<JobTourState>, event?: DemoEventName) => void;
  goTo: (step: JobTourStep) => void;
};
const HISTORY_KEY = 'lgqJobTour';

export function JobLifecycleTourLauncher({ className, children = 'Try the 5-minute tour' }: { className?: string; children?: ReactNode }) {
  const { open } = useJobLifecycleTour();
  return <button type="button" data-job-tour-launcher className={className} aria-haspopup="dialog" onClick={(event) => open(event.currentTarget)}>{children}</button>;
}

export function JobLifecycleTourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState(false);
  const [state, setState] = useState<JobTourState>({ ...INITIAL_JOB_TOUR_STATE });
  const stateRef = useRef(state);
  const [Panel, setPanel] = useState<ComponentType<TourPanelProps> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const loadingRef = useRef(false);
  const currentIndex = JOB_TOUR_STEPS.findIndex((step) => step.slug === state.step);
  const current = JOB_TOUR_STEPS[currentIndex];

  const track = useCallback((event: DemoEventName, step = stateRef.current.step) => {
    trackDemoEvent(event, { tourKey: 'demo-job-lifecycle', tourVersion: JOB_TOUR_VERSION, stepId: `demo-${step}`, stepSlug: step, totalSteps: 5, source: 'how_it_works_popup' });
  }, []);
  const save = useCallback((next: JobTourState) => {
    stateRef.current = next;
    setState(next);
    try { sessionStorage.setItem(JOB_TOUR_STORAGE_KEY, JSON.stringify(next)); } catch { /* In-memory fallback. */ }
  }, []);
  const update = useCallback((patch: Partial<JobTourState>, event: DemoEventName = 'step_interacted') => {
    save(updateJobTourState(stateRef.current, patch));
    track(event);
  }, [save, track]);
  const load = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadError(false);
    import('./JobLifecycleTourPanels').then((module) => setPanel(() => module.default)).catch(() => setLoadError(true)).finally(() => { loadingRef.current = false; });
  }, []);

  useEffect(() => {
    let restored = { ...INITIAL_JOB_TOUR_STATE };
    try { restored = restoreJobTourState(sessionStorage.getItem(JOB_TOUR_STORAGE_KEY)); } catch { /* In-memory fallback. */ }
    save(restored);
    const syncUrl = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tour') !== 'job-lifecycle') { setIsOpen(false); return; }
      let next = { ...stateRef.current, step: normalizeJobTourStep(params.get('step')) };
      // Cross-device handoffs carry quote options only, never approval or payment.
      const upgrade = params.get('upgrade');
      if (upgrade === '0' || upgrade === '1') {
        next = { ...next, upgradeSelected: upgrade === '1', signed: false, depositSimulated: false, booked: false };
        const url = new URL(window.location.href);
        url.searchParams.delete('upgrade');
        window.history.replaceState(window.history.state, '', url);
      }
      save(next);
      setPreviewResult(params.get('result') === 'preview');
      setIsOpen(true);
    };
    syncUrl();
    window.addEventListener('popstate', syncUrl);
    return () => window.removeEventListener('popstate', syncUrl);
  }, [save]);

  const open = useCallback((launcher: HTMLButtonElement) => {
    launcherRef.current = launcher;
    // Keep only one top-layer experience open at a time.
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
    const url = new URL(window.location.href);
    url.searchParams.set('tour', 'job-lifecycle');
    url.searchParams.set('step', stateRef.current.step);
    window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, '', url);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    if (window.history.state?.[HISTORY_KEY]) window.history.back();
    else {
      const url = new URL(window.location.href);
      ['tour', 'step', 'upgrade', 'result'].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState(window.history.state, '', url);
      setIsOpen(false);
    }
  }, []);
  const goTo = useCallback((step: JobTourStep) => {
    setPreviewResult(false);
    save({ ...stateRef.current, step });
    const url = new URL(window.location.href);
    url.searchParams.set('step', step);
    url.searchParams.delete('result');
    window.history.replaceState(window.history.state, '', url);
  }, [save]);

  useEffect(() => {
    if (!isOpen) return;
    load();
    // Loading the substantial panel code does not delay the modal or Close control.
  }, [isOpen, load]);
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.dataset.jobTourOpen = 'true';
    dialog?.showModal();
    track('tour_started');
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      delete document.documentElement.dataset.jobTourOpen;
      (launcherRef.current ?? document.querySelector<HTMLButtonElement>('[data-job-tour-launcher]'))?.focus({ preventScroll: true });
      track('tour_exited');
    };
  }, [isOpen, track]);
  useEffect(() => {
    if (!isOpen) return;
    track('step_viewed', state.step);
    scrollRef.current?.scrollTo(0, 0);
    tabRefs.current[currentIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [isOpen, state.step, currentIndex, track]);

  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % 5 : event.key === 'ArrowLeft' ? (index + 4) % 5 : event.key === 'Home' ? 0 : event.key === 'End' ? 4 : -1;
    if (next < 0) return;
    event.preventDefault();
    goTo(JOB_TOUR_STEPS[next].slug);
    tabRefs.current[next]?.focus();
  };
  const restart = () => {
    save({ ...INITIAL_JOB_TOUR_STATE });
    goTo('site');
    track('tour_restarted', 'site');
  };
  const keepFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]'))
      .filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return <Context.Provider value={{ isOpen, open }}>
    {children}
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="job-tour-title" aria-describedby="job-tour-disclosure" onKeyDown={keepFocusInside} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}>
      {isOpen && <div className={styles.shell}>
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>ONE SAMPLE JOB · FIVE CONNECTED STEPS</span><h2 id="job-tour-title">See the whole job come together.</h2><p id="job-tour-disclosure">Interactive sample—no real messages or payments.</p></div>
          <button type="button" className={styles.close} onClick={close} aria-label="Close tour" autoFocus>✕</button>
        </header>
        <div role="tablist" aria-label="Job lifecycle tour" className={styles.tabs}>
          {JOB_TOUR_STEPS.map((step, index) => <button type="button" key={step.slug} ref={(node) => { tabRefs.current[index] = node; }} role="tab" id={`job-tour-tab-${step.slug}`} aria-controls={`job-tour-panel-${step.slug}`} aria-selected={step.slug === state.step} tabIndex={step.slug === state.step ? 0 : -1} onClick={() => goTo(step.slug)} onKeyDown={(event) => keyDown(event, index)}><span>{index + 1}</span>{step.label}</button>)}
        </div>
        <div ref={scrollRef} className={styles.scroll}>
          <section role="tabpanel" id={`job-tour-panel-${state.step}`} aria-labelledby={`job-tour-tab-${state.step}`} tabIndex={0} className={styles.content}>
            <aside className={styles.explanation}><span className={styles.perspective}>{current.perspective} view</span><h3>{current.title}</h3><p>{current.description}</p><div className={styles.takeaway}><span aria-hidden="true">↳</span>{current.takeaway}</div><small>Fictional plumbing business and customer. Explore any tab at your own pace.</small></aside>
            <div className={styles.preview}>
              {Panel ? <Panel key={state.step} state={state} previewResult={previewResult} update={update} goTo={goTo} /> : loadError ? <div role="alert" className={styles.loading}><p>The tour couldn’t load. Please try again.</p><button className={styles.primary} onClick={load}>Retry</button></div> : <p role="status" className={styles.loading}>Loading the interactive sample…</p>}
            </div>
          </section>
        </div>
        <footer className={styles.footer}><button type="button" className={styles.textButton} onClick={restart}>Restart tour</button><span className={styles.counter}>{currentIndex + 1} of 5</span><div className={styles.navigation}><button type="button" className={styles.secondary} disabled={currentIndex === 0} onClick={() => goTo(JOB_TOUR_STEPS[currentIndex - 1].slug)}>Back</button><button type="button" className={styles.primary} onClick={() => currentIndex === 4 ? close() : goTo(JOB_TOUR_STEPS[currentIndex + 1].slug)}>{currentIndex === 4 ? 'Close tour' : 'Next →'}</button></div></footer>
      </div>}
    </dialog>
  </Context.Provider>;
}
