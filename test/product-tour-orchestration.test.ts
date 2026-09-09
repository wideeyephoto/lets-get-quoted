import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Enable React act testing environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
};
let mockPathname = '/dashboard/leads';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

// Mock tour-actions
vi.mock('@/app/dashboard/tour-actions', () => ({
  startTourAction: vi.fn().mockResolvedValue({ success: true }),
  advanceTourAction: vi.fn().mockResolvedValue({ success: true }),
  completeTourAction: vi.fn().mockResolvedValue({ success: true }),
  dismissTourAction: vi.fn().mockResolvedValue({ success: true }),
  restartTourAction: vi.fn().mockResolvedValue({ success: true }),
  recordTourEventAction: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock app shell provider
vi.mock('@/components/app-shell-provider', () => ({
  useAppShell: () => ({
    openNav: vi.fn(),
    closeNav: vi.fn(),
  }),
}));

// Setup minimal DOM environment for Node
class MockDOMElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockDOMElement[] = [];
  parentNode: MockDOMElement | null = null;
  ownerDocument: MockDOMDocument;
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  offsetHeight = 180;
  offsetWidth = 360;

  constructor(tagName: string, ownerDocument: MockDOMDocument) {
    this.nodeName = tagName.toUpperCase();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  appendChild<T extends MockDOMElement>(child: T): T {
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends MockDOMElement>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore<T extends MockDOMElement>(newChild: T, refChild: MockDOMElement | null): T {
    if (!refChild) return this.appendChild(newChild);
    const idx = this.childNodes.indexOf(refChild);
    if (idx >= 0) this.childNodes.splice(idx, 0, newChild);
    else this.childNodes.push(newChild);
    newChild.parentNode = this;
    return newChild;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  getBoundingClientRect(): DOMRect {
    return {
      top: 100,
      left: 100,
      bottom: 250,
      right: 400,
      width: 300,
      height: 150,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    };
  }

  querySelector<T extends MockDOMElement = MockDOMElement>(selector: string): T | null {
    for (const child of this.childNodes) {
      if (matchesSelector(child, selector)) return child as unknown as T;
      const found = child.querySelector<T>(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll<T extends MockDOMElement = MockDOMElement>(selector: string): T[] {
    const results: T[] = [];
    for (const child of this.childNodes) {
      if (matchesSelector(child, selector)) results.push(child as unknown as T);
      results.push(...child.querySelectorAll<T>(selector));
    }
    return results;
  }

  focus(): void {}
  scrollIntoView(): void {}
}

function matchesSelector(el: MockDOMElement, selector: string): boolean {
  if (selector.startsWith('[data-tour-id="')) {
    const val = selector.slice(15, -2);
    return el.getAttribute('data-tour-id') === val;
  }
  if (selector.startsWith('[data-tour-')) {
    const attr = selector.slice(1, -1).split('=')[0];
    return el.hasAttribute(attr);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return (el.getAttribute('class') || '').includes(cls);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

class MockDOMDocument extends MockDOMElement {
  documentElement: MockDOMElement;
  body: MockDOMElement;
  activeElement: MockDOMElement | null = null;
  defaultView: typeof globalThis;

  constructor() {
    super('#document', null as unknown as MockDOMDocument);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.documentElement = this.createElement('html');
    this.body = this.createElement('body');
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.defaultView = globalThis;
  }

  createElement(tagName: string): MockDOMElement {
    return new MockDOMElement(tagName, this);
  }

  createElementNS(_ns: string, tagName: string): MockDOMElement {
    return this.createElement(tagName);
  }

  createTextNode(text: string): MockDOMElement {
    const el = new MockDOMElement('#text', this);
    el.nodeType = 3;
    (el as unknown as { nodeValue: string }).nodeValue = text;
    return el;
  }
}

// Attach mock DOM to global
const mockDoc = new MockDOMDocument();
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
(globalThis as unknown as { document: MockDOMDocument }).document = mockDoc;
(globalThis as unknown as { Element: typeof MockDOMElement }).Element = MockDOMElement;
(globalThis as unknown as { HTMLElement: typeof MockDOMElement }).HTMLElement = MockDOMElement;
(globalThis as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = class {};

if (!globalThis.addEventListener) {
  const windowListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  globalThis.addEventListener = ((type: string, listener: (...args: unknown[]) => void) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type)!.add(listener);
  }) as unknown as typeof window.addEventListener;

  globalThis.removeEventListener = ((type: string, listener: (...args: unknown[]) => void) => {
    windowListeners.get(type)?.delete(listener);
  }) as unknown as typeof window.removeEventListener;
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Imports under test
import ProductTourRoot from '@/components/product-tour/ProductTourRoot';
import ProductTourCoachmark from '@/components/product-tour/ProductTourCoachmark';
import { ChecklistTourInvitation } from '@/components/product-tour/ProductTourLauncher';
import { DASHBOARD_ORIENTATION_TOUR } from '@/lib/product-tour/catalog';
import type { TourProgressRecord } from '@/lib/product-tour/types';

describe('Phase 5: Product Tour Orchestration Behavior Suite', () => {
  let container: MockDOMElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = mockDoc.createElement('div');
    mockDoc.body.appendChild(container);
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(() => {
    try {
      React.act(() => {
        root.unmount();
      });
    } catch {
      // Ignore cleanup error if already unmounted
    }
    mockDoc.body.removeChild(container);
  });

  it('1. No hijack: does not call router.push on mount when tour is active and user is on a different page', () => {
    mockPathname = '/dashboard/leads';

    const activeProgress: TourProgressRecord = {
      account_id: 'acc_123',
      user_id: 'usr_123',
      tour_key: DASHBOARD_ORIENTATION_TOUR.key,
      tour_version: DASHBOARD_ORIENTATION_TOUR.version,
      status: 'active',
      current_step_id: 'dashboard-overview', // Route is '/dashboard'
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dismissed_at: null,
      completed_at: null,
    };

    React.act(() => {
      root.render(
        React.createElement(ProductTourRoot, {
          role: 'owner',
          initialProgress: activeProgress,
          allowedStepIds: DASHBOARD_ORIENTATION_TOUR.steps.map((s) => s.id),
          enabled: true,
        }),
      );
    });

    // Fails today: ProductTourRoot immediately pushes router.push('/dashboard') on mount
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('2. Never anchored without a rect: spotlight and backdrop overlay are absent when targetRect is null', () => {
    const step = DASHBOARD_ORIENTATION_TOUR.steps[0];

    React.act(() => {
      root.render(
        React.createElement(ProductTourCoachmark, {
          step,
          stepIndex: 0,
          totalSteps: 6,
          targetRect: null,
          isFallback: false,
          onNext: vi.fn(),
          onPrev: vi.fn(),
          onClose: vi.fn(),
          onSkip: vi.fn(),
        }),
      );
    });

    // Fails today: renders <div className={styles.fullBackdrop} data-tour-overlay="true" ... />
    // In the new orchestrator with visual modes, fullBackdrop/spotlight overlay must NEVER render when targetRect is null
    const overlay = mockDoc.body.querySelector('[data-tour-overlay]');
    expect(overlay).toBeNull();
  });

  it('3. Prev persists: handlePrev calls advanceTourAction with the previous step id', async () => {
    mockPathname = '/dashboard/leads';

    // Fails today: handlePrev in ProductTourRoot does not await advanceTourAction
    const rootSrc = readFileSync('src/components/product-tour/ProductTourRoot.tsx', 'utf8');
    const handlePrevBody = rootSrc.slice(rootSrc.indexOf('const handlePrev ='), rootSrc.indexOf('const handleClose ='));
    expect(handlePrevBody).toContain('advanceTourAction');
  });

  it('4. Resume degrades: current_step_id not in allowedStepIds falls back to a valid step instead of sticking', () => {
    // Office user only has access to steps 1, 2, 3
    const officeAllowedIds = ['leads-inbox', 'jobs-board', 'schedule-workbench'];

    const storedProgress: TourProgressRecord = {
      account_id: 'acc_123',
      user_id: 'usr_office',
      tour_key: DASHBOARD_ORIENTATION_TOUR.key,
      tour_version: DASHBOARD_ORIENTATION_TOUR.version,
      status: 'active',
      current_step_id: 'dashboard-overview', // Stored step is NOT in allowedStepIds
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dismissed_at: null,
      completed_at: null,
    };

    React.act(() => {
      root.render(
        React.createElement(ProductTourRoot, {
          role: 'office',
          initialProgress: storedProgress,
          allowedStepIds: officeAllowedIds,
          enabled: true,
        }),
      );
    });

    // Under degraded resume, it initializes to the first valid allowed step ('leads-inbox')
    // and renders the active tour UI (settling chip, coachmark, or resume pill) instead of remaining dead/null
    const activeEl =
      mockDoc.body.querySelector('.settlingChip') ||
      mockDoc.body.querySelector('.stepBadge') ||
      mockDoc.body.querySelector('.resumePill');
    expect(activeEl).not.toBeNull();
  });

  it('5. Anchor uniqueness: exactly one data-tour-id declaration exists in src/ for every catalog targetId', () => {
    function getAllFiles(dir: string): string[] {
      const files: string[] = [];
      for (const item of readdirSync(dir)) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getAllFiles(fullPath));
        } else if (/\.(tsx|ts|jsx|js)$/.test(item)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allSrcFiles = getAllFiles('src');
    const targetIds = DASHBOARD_ORIENTATION_TOUR.steps
      .map((s) => s.targetId)
      .filter((id): id is string => Boolean(id));

    const duplicateReports: string[] = [];

    for (const targetId of targetIds) {
      const occurrences: string[] = [];
      const searchStr = `data-tour-id="${targetId}"`;
      for (const file of allSrcFiles) {
        const content = readFileSync(file, 'utf8');
        if (content.includes(searchStr)) {
          occurrences.push(file);
        }
      }
      if (occurrences.length !== 1) {
        duplicateReports.push(
          `targetId "${targetId}" found in ${occurrences.length} places: ${occurrences.join(', ')}`,
        );
      }
    }

    // Fails today: 'dashboard:needs-attention' is in both DashboardHomeScreen.tsx and PriorityQueue.tsx
    expect(duplicateReports).toEqual([]);
  });

  it('6. Copy matches reality: duration and surface list are derived from filtered step list, not literals', () => {
    // Office user allowed steps: 3 steps (leads, jobs, schedule)
    const officeAllowedIds = ['leads-inbox', 'jobs-board', 'schedule-workbench'];

    React.act(() => {
      root.render(
        React.createElement(ChecklistTourInvitation as unknown as React.ComponentType<{ allowedStepIds?: string[] }>, {
          allowedStepIds: officeAllowedIds,
        }),
      );
    });

    // Today: ProductTourLauncher hardcodes "90-second" and "website builder and automations"
    // Fails today: launcher renders literal 90-second and lists surfaces office users cannot access
    const launcherSrc = readFileSync('src/components/product-tour/ProductTourLauncher.tsx', 'utf8');
    expect(launcherSrc).not.toContain('Take a 90-second orientation tour');
    expect(launcherSrc).not.toContain('website builder and automations connect together');
  });

  it('7. Card measured before positioned: layout measurement runs in useLayoutEffect to prevent post-paint position jump', () => {
    const coachmarkSrc = readFileSync('src/components/product-tour/ProductTourCoachmark.tsx', 'utf8');

    // Fails today: ProductTourCoachmark uses useEffect (after paint) with a self-dependency on cardHeight:
    // useEffect(() => { ... setCardHeight(...) }, [step.id, step.body, step.title, cardHeight]);
    // Fix requires useLayoutEffect to measure before paint, and no cardHeight in deps
    expect(coachmarkSrc).toContain('useLayoutEffect');
    expect(coachmarkSrc).not.toMatch(/useEffect\([^)]+cardHeight\]\)/);
  });
});
