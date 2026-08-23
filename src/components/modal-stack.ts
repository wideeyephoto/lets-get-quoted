export type ModalStackRegistration = Readonly<{
  id: string;
  backdrop: HTMLElement;
  trigger: HTMLElement | null;
  requestClose: () => void;
  focusInitial: () => void;
  setTopmost: (topmost: boolean) => void;
}>;

type RegisteredModal = ModalStackRegistration & Readonly<{ token: symbol }>;

type OwnedElementState = Readonly<{
  hadInert: boolean;
  ariaHidden: string | null;
}>;

export type ModalStack = Readonly<{
  register: (registration: ModalStackRegistration) => () => void;
  isTopmost: (id: string) => boolean;
}>;

function canManage(element: Element): element is HTMLElement {
  return typeof (element as HTMLElement).toggleAttribute === 'function';
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected) return false;
  return !element.closest('[inert]');
}

/**
 * One controller owns every ModalDialog mounted in the same document. It is
 * intentionally independent of React so stacking, out-of-order cleanup and
 * focus restoration can be exercised as behavior in the unit suite.
 */
export function createModalStack(documentRef: Document): ModalStack {
  const entries: RegisteredModal[] = [];
  const ownedElements = new Map<HTMLElement, OwnedElementState>();
  const fallbackFocusTargets: HTMLElement[] = [];
  let previousOverflow: string | null = null;
  let observer: MutationObserver | null = null;

  const restoreOwnedElement = (element: HTMLElement) => {
    const previous = ownedElements.get(element);
    if (!previous) return;
    if (previous.hadInert) element.toggleAttribute('inert', true);
    else element.removeAttribute('inert');
    if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', previous.ariaHidden);
    ownedElements.delete(element);
  };

  const ownElement = (element: HTMLElement) => {
    if (!ownedElements.has(element)) {
      ownedElements.set(element, {
        hadInert: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      });
    }
    element.toggleAttribute('inert', true);
    element.setAttribute('aria-hidden', 'true');
  };

  const sync = () => {
    const top = entries.at(-1) ?? null;
    for (const entry of entries) entry.setTopmost(entry === top);

    for (const child of Array.from(documentRef.body.children)) {
      if (!canManage(child)) continue;
      if (top && child === top.backdrop) restoreOwnedElement(child);
      else ownElement(child);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const top = entries.at(-1);
    if (!top) return;
    event.preventDefault();
    event.stopPropagation();
    top.requestClose();
  };

  const beginGlobalEffects = () => {
    if (previousOverflow !== null) return;
    previousOverflow = documentRef.body.style.overflow;
    documentRef.body.style.overflow = 'hidden';
    documentRef.addEventListener('keydown', onKeyDown, true);

    const MutationObserverConstructor = documentRef.defaultView?.MutationObserver;
    if (MutationObserverConstructor) {
      observer = new MutationObserverConstructor(sync);
      observer.observe(documentRef.body, { childList: true });
    }
  };

  const endGlobalEffects = () => {
    observer?.disconnect();
    observer = null;
    documentRef.removeEventListener('keydown', onKeyDown, true);
    for (const element of [...ownedElements.keys()]) restoreOwnedElement(element);
    if (previousOverflow !== null && documentRef.body.style.overflow === 'hidden') {
      documentRef.body.style.overflow = previousOverflow;
    }
    previousOverflow = null;
  };

  const focusAfterTopClose = (removed: RegisteredModal) => {
    const nextTop = entries.at(-1) ?? null;
    if (canRestoreFocus(removed.trigger)) {
      removed.trigger.focus();
      return;
    }
    if (nextTop) {
      nextTop.focusInitial();
      return;
    }
    while (fallbackFocusTargets.length) {
      const fallback = fallbackFocusTargets.pop() ?? null;
      if (canRestoreFocus(fallback)) {
        fallback.focus();
        return;
      }
    }
  };

  const unregister = (id: string, token: symbol) => {
    const index = entries.findIndex((entry) => entry.id === id && entry.token === token);
    if (index < 0) return;
    const wasTopmost = index === entries.length - 1;
    const [removed] = entries.splice(index, 1);
    if (!wasTopmost && removed.trigger) fallbackFocusTargets.push(removed.trigger);

    if (entries.length) sync();
    else endGlobalEffects();

    if (wasTopmost) focusAfterTopClose(removed);
    if (!entries.length) fallbackFocusTargets.length = 0;
  };

  return {
    register(registration) {
      const existing = entries.findIndex((entry) => entry.id === registration.id);
      const entry = { ...registration, token: Symbol(registration.id) };
      if (existing >= 0) entries.splice(existing, 1, entry);
      else entries.push(entry);

      beginGlobalEffects();
      sync();
      if (entries.at(-1) === entry) entry.focusInitial();
      return () => unregister(entry.id, entry.token);
    },
    isTopmost(id) {
      return entries.at(-1)?.id === id;
    },
  };
}

const stacks = new WeakMap<Document, ModalStack>();

export function modalStackFor(documentRef: Document): ModalStack {
  const existing = stacks.get(documentRef);
  if (existing) return existing;
  const stack = createModalStack(documentRef);
  stacks.set(documentRef, stack);
  return stack;
}
