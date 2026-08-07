/**
 * The nine stages a job moves through, named once.
 *
 * WHY THIS FILE EXISTS. The same moment had a different name on every screen.
 * "Quote out", "Needs price", "Awaiting sign-off", "Invoice sent · Awaiting
 * payment", "Work underway", "Ready for invoice" — some of those are the same
 * stage, some are one stage apart, and nothing on screen told you which. A
 * contractor cannot learn a pipeline whose steps are renamed between the page
 * that lists them and the map that plots them.
 *
 * Anything that names a STAGE takes its words from here. Buttons and badges
 * that name the NEXT ACTION ("Send to client", "Assign crew") are a different
 * kind of label and stay as they are — an action is an instruction, a stage is
 * a position, and collapsing the two is what produced the mess.
 *
 * THE NOUNS, likewise fixed:
 *
 *   customer  the person — never "client" or "homeowner"
 *   lead      them, before the work is approved
 *   quote     the document, before approval
 *   invoice   the document, once payment is due
 *
 * So a lead becomes a customer at approval, and a quote becomes an invoice at
 * the same moment. "Instant estimate" is the public-facing name for the
 * on-site pricing tool — never "instant quote", which collides with the noun
 * above.
 */

export type WorkflowStageKey =
  | 'needs_response'
  | 'contacted'
  | 'quote_sent'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'ready_to_invoice'
  | 'invoice_sent'
  | 'complete';

export const WORKFLOW_STAGE_LABEL: Record<WorkflowStageKey, string> = {
  needs_response: 'Needs response',
  contacted: 'Contacted',
  quote_sent: 'Quote sent — awaiting approval',
  approved: 'Approved — needs scheduling',
  scheduled: 'Scheduled',
  in_progress: 'Work in progress',
  ready_to_invoice: 'Ready to invoice',
  invoice_sent: 'Invoice sent — awaiting payment',
  complete: 'Complete',
};

/** In order, for anything that draws the pipeline end to end. */
export const WORKFLOW_STAGES: WorkflowStageKey[] = [
  'needs_response',
  'contacted',
  'quote_sent',
  'approved',
  'scheduled',
  'in_progress',
  'ready_to_invoice',
  'invoice_sent',
  'complete',
];

/**
 * The short form, for somewhere too narrow for the full label.
 *
 * Only the two-part stages differ: the em-dash clause is the half that explains
 * who is being waited on, which is exactly what a wide surface has room to say
 * and a chip does not. Never invent a third wording for the same stage.
 */
export const WORKFLOW_STAGE_SHORT: Record<WorkflowStageKey, string> = {
  needs_response: 'Needs response',
  contacted: 'Contacted',
  quote_sent: 'Quote sent',
  approved: 'Approved',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  ready_to_invoice: 'Ready to invoice',
  invoice_sent: 'Invoice sent',
  complete: 'Complete',
};
