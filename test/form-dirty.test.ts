import { describe, expect, it } from 'vitest';
import { formSignature, isDirty, shouldShowSave, type FormEntry } from '@/lib/form-dirty';

const base: FormEntry[] = [
  ['businessName', 'BrokePipes'],
  ['phone', '2485550117'],
  ['email', 'brett@example.com'],
];

describe('a form that has not been touched', () => {
  it('is not dirty', () => {
    expect(isDirty(formSignature(base), formSignature(base))).toBe(false);
  });

  it('is not dirty when read twice from an identical form', () => {
    const copy: FormEntry[] = base.map(([k, v]) => [k, v]);
    expect(formSignature(copy)).toBe(formSignature(base));
  });

  it('treats an empty form as clean against itself', () => {
    expect(isDirty(formSignature([]), formSignature([]))).toBe(false);
  });
});

describe('what counts as a change', () => {
  it('notices an edited value', () => {
    const after: FormEntry[] = [...base.slice(0, 1), ['phone', '2485550118'], base[2]];
    expect(isDirty(formSignature(base), formSignature(after))).toBe(true);
  });

  it('notices a cleared field', () => {
    const after: FormEntry[] = [base[0], ['phone', ''], base[2]];
    expect(isDirty(formSignature(base), formSignature(after))).toBe(true);
  });

  it('notices a checkbox going on or off', () => {
    // An unchecked box submits nothing at all, so the entry disappears.
    const off: FormEntry[] = [['smsOptIn', 'on']];
    expect(isDirty(formSignature(off), formSignature([]))).toBe(true);
  });

  it('notices a row added or removed', () => {
    const more: FormEntry[] = [...base, ['area', 'Royal Oak']];
    expect(isDirty(formSignature(base), formSignature(more))).toBe(true);
  });

  // Not sorted on purpose: a reordered list HAS changed. Sorting would call a
  // dragged price-book row identical to where it started.
  it('notices a reorder', () => {
    const swapped: FormEntry[] = [base[1], base[0], base[2]];
    expect(isDirty(formSignature(base), formSignature(swapped))).toBe(true);
  });

  // The separator must not let two different forms collide.
  it('does not confuse a value ending where the next key begins', () => {
    const a: FormEntry[] = [['a', 'bc'], ['d', 'e']];
    const b: FormEntry[] = [['a', 'b'], ['cd', 'e']];
    expect(formSignature(a)).not.toBe(formSignature(b));
  });
});

describe('file inputs', () => {
  const empty = { name: '', size: 0 };

  it('an untouched file input is not a change', () => {
    const before: FormEntry[] = [['certificate', empty]];
    const after: FormEntry[] = [['certificate', empty]];
    expect(isDirty(formSignature(before), formSignature(after))).toBe(false);
  });

  it('choosing a file is a change', () => {
    const before: FormEntry[] = [['certificate', empty]];
    const after: FormEntry[] = [['certificate', { name: 'coi.pdf', size: 51200 }]];
    expect(isDirty(formSignature(before), formSignature(after))).toBe(true);
  });

  it('swapping to a different file is a change', () => {
    const a: FormEntry[] = [['certificate', { name: 'coi.pdf', size: 51200 }]];
    const b: FormEntry[] = [['certificate', { name: 'coi-2027.pdf', size: 51200 }]];
    expect(isDirty(formSignature(a), formSignature(b))).toBe(true);
  });

  it('the same file re-picked is not', () => {
    const a: FormEntry[] = [['certificate', { name: 'coi.pdf', size: 51200 }]];
    const b: FormEntry[] = [['certificate', { name: 'coi.pdf', size: 51200 }]];
    expect(isDirty(formSignature(a), formSignature(b))).toBe(false);
  });
});

describe('when the button is on screen', () => {
  const off = { onlyWhenChanged: false, dirty: false, pending: false, justSaved: false };

  it('always, for a button that never opted in', () => {
    expect(shouldShowSave(off)).toBe(true);
    expect(shouldShowSave({ ...off, dirty: true })).toBe(true);
  });

  it('hidden on a clean opted-in form', () => {
    expect(shouldShowSave({ onlyWhenChanged: true, dirty: false, pending: false, justSaved: false })).toBe(false);
  });

  it('shown as soon as something is edited', () => {
    expect(shouldShowSave({ onlyWhenChanged: true, dirty: true, pending: false, justSaved: false })).toBe(true);
  });

  it('stays while the save is in flight', () => {
    // The form can go clean mid-submit; the button must not vanish under the
    // cursor that just pressed it.
    expect(shouldShowSave({ onlyWhenChanged: true, dirty: false, pending: true, justSaved: false })).toBe(true);
  });

  // The bug this rule exists for: a button that disappeared the moment the save
  // landed would take its own "Saved ✓" with it, at exactly the moment somebody
  // is looking for confirmation.
  it('stays long enough to say it saved', () => {
    expect(shouldShowSave({ onlyWhenChanged: true, dirty: false, pending: false, justSaved: true })).toBe(true);
  });

  it('goes away once the confirmation has been shown', () => {
    expect(shouldShowSave({ onlyWhenChanged: true, dirty: false, pending: false, justSaved: false })).toBe(false);
  });
});
