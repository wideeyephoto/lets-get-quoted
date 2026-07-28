import type { ImportField } from '@/lib/smart-import';

// Single source of truth for each importable entity's column-mapping field set,
// shared by the single-entity importers and the "migrate from another CRM"
// wizard. Declaration order = rule-based match priority (list more-specific
// fields first).

export const CLIENT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', keywords: ['name', 'client', 'customer', 'contact', 'first', 'last'], hint: "the customer's name", compose: 'space' },
  { key: 'phone', label: 'Phone', keywords: ['phone', 'mobile', 'cell', 'tel', 'number'], hint: "the customer's phone number" },
  { key: 'email', label: 'Email', keywords: ['email', 'e-mail', 'mail'], hint: "the customer's email" },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'city', 'location', 'addr', 'zip', 'state'], hint: 'the address', compose: 'comma' },
];

export const SERVICE_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', keywords: ['name', 'service', 'item', 'product', 'title'], hint: 'the service or product name', required: true },
  { key: 'unit_price', label: 'Price', keywords: ['unit price', 'price', 'rate', 'amount', 'cost', 'fee', 'charge'], hint: 'the price per unit in US dollars' },
  { key: 'unit', label: 'Unit', keywords: ['unit', 'uom', 'per', 'measure'], hint: 'the unit sold in — one of each, hour, sqft, visit, job' },
  { key: 'description', label: 'Description', keywords: ['description', 'desc', 'details', 'notes'], hint: 'a longer description of the service' },
];

export const JOB_FIELDS: ImportField[] = [
  { key: 'clientName', label: 'Customer', keywords: ['client', 'customer', 'name', 'contact', 'bill to'], hint: "the customer's name", required: true, compose: 'space' },
  { key: 'clientPhone', label: 'Phone', keywords: ['phone', 'mobile', 'cell', 'tel'], hint: "the customer's phone number" },
  { key: 'clientEmail', label: 'Email', keywords: ['email', 'e-mail', 'mail'], hint: "the customer's email" },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'city', 'location', 'addr', 'zip', 'postal'], hint: 'the job / service address', compose: 'comma' },
  { key: 'scope', label: 'Job / scope', keywords: ['scope', 'job', 'service', 'work', 'project', 'description', 'summary', 'details'], hint: 'what the job is (the scope of work)' },
  { key: 'status', label: 'Status', keywords: ['status', 'stage'], hint: 'the job status (new, in progress, complete, archived)' },
  { key: 'scheduledFor', label: 'Date', keywords: ['date', 'scheduled', 'appointment', 'service date', 'start'], hint: 'the scheduled date' },
  { key: 'estimatedHours', label: 'Est. hours', keywords: ['hours', 'hrs', 'duration', 'estimated hours'], hint: 'estimated labor hours' },
  { key: 'quotedAmount', label: 'Amount', keywords: ['amount', 'total', 'price', 'quote', 'value', 'revenue', 'invoice total', 'job total'], hint: 'the quoted / job dollar amount' },
];

export const INVOICE_FIELDS: ImportField[] = [
  { key: 'clientName', label: 'Customer', keywords: ['client', 'customer', 'name', 'contact', 'bill to'], hint: "the customer's name", required: true, compose: 'space' },
  { key: 'clientPhone', label: 'Phone', keywords: ['phone', 'mobile', 'cell', 'tel'], hint: "the customer's phone number" },
  { key: 'clientEmail', label: 'Email', keywords: ['email', 'e-mail', 'mail'], hint: "the customer's email" },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'city', 'location', 'zip', 'postal'], hint: 'the customer / service address', compose: 'comma' },
  { key: 'description', label: 'Description', keywords: ['description', 'item', 'service', 'work', 'scope', 'memo', 'details', 'line'], hint: 'what the invoice is for' },
  { key: 'date', label: 'Date', keywords: ['date', 'invoice date', 'issued', 'created'], hint: 'the invoice date' },
  { key: 'total', label: 'Total', keywords: ['total', 'amount', 'balance', 'grand total', 'invoice total', 'price'], hint: 'the invoice total in US dollars' },
  { key: 'status', label: 'Status', keywords: ['status', 'stage', 'state'], hint: 'the invoice status — paid, sent, draft, or void' },
];
