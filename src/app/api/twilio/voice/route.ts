// Permanent alias for /api/sms/voice. See the note in ../../twilio/inbound.
//
// This is the alias most likely to be in use: the Voice URL is pasted into a
// console by a contractor, one number at a time, and until this pass the
// dashboard printed this exact path for them to copy.
//
// The handler builds its dial-completion action URL from the request's own
// pathname, so a call arriving here gets /api/twilio/voice/status and a call
// arriving on the real route gets /api/sms/voice/status. That matters because
// the action URL is inside the signature the provider computes.
export const runtime = 'nodejs';
export { POST } from '@/app/api/sms/voice/route';
