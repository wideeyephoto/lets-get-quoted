import { buildStartUrl } from '@/lib/signup-intent';

export const AI_RECEPTIONIST_SIGNUP_URL = buildStartUrl({
  goal: 'feature',
  feature: 'ai_receptionist',
  source: 'feature_page',
});

export const AI_RECEPTIONIST_AVAILABILITY =
  'AI call answering requires an eligible plan or voice add-on and a ready business phone line. Your setup screen shows the activation steps for your workspace before you switch it on.';

export const RECEPTIONIST_CALL_EXAMPLE = [
  { speaker: 'AI Receptionist', text: 'Thanks for calling Northline Home Services. I’m the AI receptionist. How can I help?' },
  { speaker: 'Homeowner', text: 'I’d like an estimate to replace my kitchen faucet.' },
  { speaker: 'AI Receptionist', text: 'I can take the details for the team. What’s your name, what area is the job in, and when is a good time for a callback?' },
  { speaker: 'Homeowner', text: 'I’m Sarah. The job is in Royal Oak. Tomorrow morning is best for a callback.' },
  { speaker: 'AI Receptionist', text: 'Thanks, Sarah. I’ll pass your request and callback preference to the team. Your appointment isn’t booked yet.' },
] as const;
