// Permanent alias for /api/sms/inbound. Not a transition step.
//
// This path is not ours to retire. It becomes real only when a human pastes it
// into a provider console, and the code cannot see whether that ever happened —
// the same blindness that made accounts.call_tracking_verified_at necessary.
// Deleting it would be a bet that every console, on every number, on every
// account, was updated. The bet costs two lines to decline, and losing it means
// customer texts arriving at a 404 while the inbox looks quiet.
//
// It also covers a window nothing else can: messages already handed to the
// provider carry whatever StatusCallback the previous deploy wrote, and they
// keep calling it for hours after the deploy that stopped writing it.
export const runtime = 'nodejs';
export { POST } from '@/app/api/sms/inbound/route';
