// Permanent alias for /api/sms/status. See the note in ../inbound/route.ts —
// and note that this one is load-bearing for longer than the others: every
// message sent before the deploy that renamed the route carries
// .../api/twilio/status baked into its StatusCallback, and the provider will
// keep posting delivery results to it until those messages reach a final state.
export const runtime = 'nodejs';
export { POST } from '@/app/api/sms/status/route';
