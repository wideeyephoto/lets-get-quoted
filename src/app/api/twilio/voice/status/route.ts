// Permanent alias for /api/sms/voice/status. See the note in ../route.ts: a
// call that arrived on the /api/twilio/voice alias is told to send its
// dial-completion callback here, so this path stays reachable for exactly as
// long as that one does.
export const runtime = 'nodejs';
export { POST } from '@/app/api/sms/voice/status/route';
