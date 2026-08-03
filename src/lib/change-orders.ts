// Change orders: the extra work nobody quoted for.
//
// A crew member opens a wall, finds rot, and photographs it. Without this the
// photo lands in a folder, the extra work gets agreed on the phone, and six
// weeks later two people remember the conversation differently. A change order
// is the object that turns a find into a decision somebody made in writing.
//
// Pure half. Everything here runs without a database so the rules about who may
// change what, and what the homeowner is shown, can be pinned by tests.

import type { QuoteItem } from '@/lib/jobs';

export type ChangeOrderStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'void';

export const CHANGE_ORDER_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  draft: 'Not sent yet',
  sent: 'With the customer',
  approved: 'Approved',
  declined: 'Declined',
  void: 'Withdrawn',
};

/** What the HOMEOWNER is told. Deliberately different words from the owner's. */
export const CHANGE_ORDER_STATUS_CLIENT_LABEL: Record<ChangeOrderStatus, string> = {
  draft: '',
  sent: 'Waiting on you',
  approved: 'You approved this',
  declined: 'You declined this',
  void: 'Withdrawn',
};

export type ChangeOrder = {
  id: string;
  jobId: string;
  status: ChangeOrderStatus;
  crewId: string | null;
  crewName: string | null;
  title: string;
  /** The crew member's own words. Never overwritten by the drafted version. */
  fieldNote: string;
  /** The write-up the homeowner reads. */
  scope: string;
  photoPaths: string[];
  items: QuoteItem[];
  amount: number;
  estimatedCost: number | null;
  sentAt: string | null;
  respondedAt: string | null;
  signatureName: string | null;
  declineReason: string | null;
  paymentId: string | null;
  createdAt: string;
};

export function changeOrderTotal(items: QuoteItem[]): number {
  const total = items.reduce((sum, item) => {
    if (item.kind === 'subscription') return sum;
    if (item.kind === 'base' || item.selected) return sum + (Number(item.amount) || 0);
    return sum;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** A decision has been made, or the owner withdrew it. Nothing more to do. */
export function isSettled(status: ChangeOrderStatus): boolean {
  return status === 'approved' || status === 'declined' || status === 'void';
}

export type SendBlocker = string;

/**
 * Whether this can go to the homeowner yet, and what's stopping it.
 *
 * Blockers are specific because the person reading them is trying to finish a
 * job, not debug a form. "Add a price" and "say what the work is" are different
 * problems with different fixes.
 */
export function sendBlockers(order: Pick<ChangeOrder, 'status' | 'title' | 'scope' | 'amount' | 'items'>): SendBlocker[] {
  const blockers: SendBlocker[] = [];
  if (order.status === 'sent') blockers.push('This is already with the customer.');
  if (isSettled(order.status)) blockers.push('This has already been answered.');
  if (!order.title.trim()) blockers.push('Give it a title — the customer sees this first.');
  if (!order.scope.trim()) blockers.push('Describe the work. “Extra materials” is not something anyone can agree to.');
  if (!(order.amount > 0)) blockers.push('Set a price. A $0 change order reads as work thrown in for free.');
  if (order.items.length === 0) blockers.push('Add at least one line so the customer can see what they are paying for.');
  return blockers;
}

export function canSend(order: Pick<ChangeOrder, 'status' | 'title' | 'scope' | 'amount' | 'items'>): boolean {
  return sendBlockers(order).length === 0;
}

/**
 * A sent change order is FROZEN. Editing the price of something a customer is
 * currently looking at — or has already agreed to — changes the terms of a deal
 * under them, which is the exact dispute this feature exists to prevent.
 *
 * Withdrawing it and raising a new one is the honest way to change your mind,
 * and it leaves both versions on the record.
 */
export function isEditable(status: ChangeOrderStatus): boolean {
  return status === 'draft';
}

export type MarginImpact = {
  addedRevenue: number;
  addedCost: number | null;
  /** Null when the added work has no cost against it — unknown, not free. */
  addedMargin: number | null;
  /** The job's margin if this is approved. Null when either side is unknown. */
  jobMarginAfter: number | null;
  jobMarginBefore: number | null;
};

/**
 * What approving this would do to the job.
 *
 * Returns nulls rather than flattering numbers when the cost is unknown. A
 * change order priced from the book but never costed would otherwise show as
 * 100% margin and make every extra look like free money.
 */
export function marginImpact(input: {
  jobRevenue: number;
  jobCost: number;
  addedRevenue: number;
  addedCost: number | null;
}): MarginImpact {
  const jobRevenue = Number(input.jobRevenue) || 0;
  const jobCost = Number(input.jobCost) || 0;
  const addedRevenue = Math.round((Number(input.addedRevenue) || 0) * 100) / 100;
  const addedCost = input.addedCost === null || input.addedCost === undefined ? null : Math.round(Number(input.addedCost) * 100) / 100;

  const jobMarginBefore = jobRevenue > 0 ? (jobRevenue - jobCost) / jobRevenue : null;
  if (addedCost === null) {
    return { addedRevenue, addedCost: null, addedMargin: null, jobMarginAfter: null, jobMarginBefore };
  }

  const addedMargin = addedRevenue > 0 ? (addedRevenue - addedCost) / addedRevenue : null;
  const revenueAfter = jobRevenue + addedRevenue;
  const jobMarginAfter = revenueAfter > 0 ? (revenueAfter - (jobCost + addedCost)) / revenueAfter : null;
  return { addedRevenue, addedCost, addedMargin, jobMarginAfter, jobMarginBefore };
}

/**
 * What the homeowner sees. Everything the contractor uses to decide is stripped:
 * no cost, no margin, no draft anybody hasn't chosen to send, and no note about
 * which crew member wrote it up.
 */
export type ClientChangeOrder = {
  id: string;
  title: string;
  scope: string;
  amount: number;
  status: ChangeOrderStatus;
  statusLabel: string;
  photoCount: number;
  items: { label: string; amount: number }[];
  sentAt: string | null;
  respondedAt: string | null;
  awaitingDecision: boolean;
};

export function toClientChangeOrders(orders: ChangeOrder[]): ClientChangeOrder[] {
  return orders
    // A draft is the contractor working something out. Showing it would invite
    // an argument about a price they hadn't decided to charge.
    .filter((order) => order.status !== 'draft' && order.status !== 'void')
    .map((order) => ({
      id: order.id,
      title: order.title,
      scope: order.scope,
      amount: order.amount,
      status: order.status,
      statusLabel: CHANGE_ORDER_STATUS_CLIENT_LABEL[order.status],
      photoCount: order.photoPaths.length,
      items: order.items
        .filter((item) => item.kind !== 'subscription')
        .map((item) => ({ label: item.label, amount: Number(item.amount) || 0 })),
      sentAt: order.sentAt,
      respondedAt: order.respondedAt,
      awaitingDecision: order.status === 'sent',
    }));
}

export type ChangeOrderTotals = {
  approved: number;
  awaiting: number;
  declined: number;
  /** Written up on site but never sent. The money quietly left on the table. */
  unsent: number;
};

export function changeOrderTotals(orders: ChangeOrder[]): ChangeOrderTotals {
  const sum = (status: ChangeOrderStatus) =>
    Math.round(orders.filter((o) => o.status === status).reduce((total, o) => total + (Number(o.amount) || 0), 0) * 100) / 100;
  return { approved: sum('approved'), awaiting: sum('sent'), declined: sum('declined'), unsent: sum('draft') };
}

/** The job's quoted amount once approved change orders are counted. */
export function jobTotalWithChangeOrders(quotedAmount: number, orders: ChangeOrder[]): number {
  const approved = orders.filter((order) => order.status === 'approved').reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  return Math.round(((Number(quotedAmount) || 0) + approved) * 100) / 100;
}
