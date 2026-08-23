import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { createModalStack } from '@/components/modal-stack';

class FakeElement {
  readonly style: Record<string, string> = { overflow: '' };
  readonly childElements: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  parentElement: FakeElement | null = null;
  isConnected = true;
  focusCalls = 0;

  get children(): FakeElement[] {
    return this.childElements;
  }

  append(child: FakeElement): void {
    child.parentElement = this;
    child.setConnected(this.isConnected);
    this.childElements.push(child);
  }

  remove(): void {
    if (this.parentElement) {
      const index = this.parentElement.childElements.indexOf(this);
      if (index >= 0) this.parentElement.childElements.splice(index, 1);
    }
    this.parentElement = null;
    this.setConnected(false);
  }

  private setConnected(connected: boolean): void {
    this.isConnected = connected;
    for (const child of this.childElements) child.setConnected(connected);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.attributes.has(name);
    if (enabled) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return enabled;
  }

  closest(selector: string): FakeElement | null {
    if (selector !== '[inert]') return null;
    let current: FakeElement | null = this;
    while (current) {
      if (current.hasAttribute('inert')) return current;
      current = current.parentElement;
    }
    return null;
  }

  focus(): void {
    this.focusCalls += 1;
  }
}

class FakeDocument {
  readonly body = new FakeElement();
  readonly defaultView = undefined;
  private readonly listeners = new Set<(event: KeyboardEvent) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'keydown' && typeof listener === 'function') {
      this.listeners.add(listener as (event: KeyboardEvent) => void);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'keydown' && typeof listener === 'function') {
      this.listeners.delete(listener as (event: KeyboardEvent) => void);
    }
  }

  pressEscape(): { prevented: boolean; stopped: boolean } {
    const result = { prevented: false, stopped: false };
    const event = {
      key: 'Escape',
      preventDefault: () => { result.prevented = true; },
      stopPropagation: () => { result.stopped = true; },
    } as KeyboardEvent;
    for (const listener of [...this.listeners]) listener(event);
    return result;
  }
}

function element(value: FakeElement): HTMLElement {
  return value as unknown as HTMLElement;
}

function documentRef(value: FakeDocument): Document {
  return value as unknown as Document;
}

describe('shared modal accessibility boundary', () => {
  it('makes only the top dialog interactive and Escape requests only that dialog to close', () => {
    const doc = new FakeDocument();
    const page = new FakeElement();
    const triggerA = new FakeElement();
    const backdropA = new FakeElement();
    const closeA = new FakeElement();
    page.append(triggerA);
    backdropA.append(closeA);
    doc.body.append(page);
    doc.body.append(backdropA);
    const stack = createModalStack(documentRef(doc));
    const closeRequestA = vi.fn();
    const topStateA = vi.fn();
    const unregisterA = stack.register({
      id: 'a',
      backdrop: element(backdropA),
      trigger: element(triggerA),
      requestClose: closeRequestA,
      focusInitial: () => closeA.focus(),
      setTopmost: topStateA,
    });

    expect(doc.body.style.overflow).toBe('hidden');
    expect(page.hasAttribute('inert')).toBe(true);
    expect(backdropA.hasAttribute('inert')).toBe(false);
    expect(closeA.focusCalls).toBe(1);

    const triggerB = new FakeElement();
    const backdropB = new FakeElement();
    const closeB = new FakeElement();
    backdropA.append(triggerB);
    backdropB.append(closeB);
    doc.body.append(backdropB);
    const closeRequestB = vi.fn();
    const topStateB = vi.fn();
    const unregisterB = stack.register({
      id: 'b',
      backdrop: element(backdropB),
      trigger: element(triggerB),
      requestClose: closeRequestB,
      focusInitial: () => closeB.focus(),
      setTopmost: topStateB,
    });

    expect(backdropA.hasAttribute('inert')).toBe(true);
    expect(backdropA.getAttribute('aria-hidden')).toBe('true');
    expect(backdropB.hasAttribute('inert')).toBe(false);
    expect(topStateA).toHaveBeenLastCalledWith(false);
    expect(topStateB).toHaveBeenLastCalledWith(true);

    const escape = doc.pressEscape();
    expect(escape).toEqual({ prevented: true, stopped: true });
    expect(closeRequestA).not.toHaveBeenCalled();
    expect(closeRequestB).toHaveBeenCalledTimes(1);

    unregisterB();
    expect(doc.body.style.overflow).toBe('hidden');
    expect(page.hasAttribute('inert')).toBe(true);
    expect(backdropA.hasAttribute('inert')).toBe(false);
    expect(triggerB.focusCalls).toBe(1);
    backdropB.remove();

    unregisterA();
    expect(doc.body.style.overflow).toBe('');
    expect(page.hasAttribute('inert')).toBe(false);
    expect(triggerA.focusCalls).toBe(1);
  });

  it('keeps global effects ref-counted and restores valid focus after out-of-order unmounts', () => {
    const doc = new FakeDocument();
    doc.body.style.overflow = 'clip';
    const page = new FakeElement();
    page.setAttribute('aria-hidden', 'false');
    const triggerA = new FakeElement();
    const backdropA = new FakeElement();
    const triggerB = new FakeElement();
    page.append(triggerA);
    backdropA.append(triggerB);
    doc.body.append(page);
    doc.body.append(backdropA);
    const stack = createModalStack(documentRef(doc));
    const unregisterA = stack.register({
      id: 'a',
      backdrop: element(backdropA),
      trigger: element(triggerA),
      requestClose: vi.fn(),
      focusInitial: vi.fn(),
      setTopmost: vi.fn(),
    });
    const backdropB = new FakeElement();
    doc.body.append(backdropB);
    const unregisterB = stack.register({
      id: 'b',
      backdrop: element(backdropB),
      trigger: element(triggerB),
      requestClose: vi.fn(),
      focusInitial: vi.fn(),
      setTopmost: vi.fn(),
    });

    unregisterA();
    unregisterA();
    expect(doc.body.style.overflow).toBe('hidden');
    expect(page.hasAttribute('inert')).toBe(true);
    expect(triggerA.focusCalls).toBe(0);
    backdropA.remove();
    expect(triggerB.isConnected).toBe(false);

    unregisterB();
    expect(doc.body.style.overflow).toBe('clip');
    expect(page.hasAttribute('inert')).toBe(false);
    expect(page.getAttribute('aria-hidden')).toBe('false');
    expect(triggerB.focusCalls).toBe(0);
    expect(triggerA.focusCalls).toBe(1);
  });

  it('keeps the React component wired to the shared stack and dialog relationship', () => {
    const modal = readFileSync('src/components/modal-dialog.tsx', 'utf8');
    expect(modal).toContain('modalStackFor(document).register');
    expect(modal).toContain('modalStackFor(document).isTopmost(dialogId)');
    expect(modal).toContain('aria-haspopup="dialog"');
    expect(modal).toContain('aria-expanded={open}');
    expect(modal).toContain('aria-controls={dialogId}');
    expect(modal).toContain('aria-modal={topmost');
  });
});
