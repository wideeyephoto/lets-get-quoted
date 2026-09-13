export type CircuitBreakerService = 'ai_intake' | 'sms_outbound' | 'voice_routing' | 'payments_checkout';
export type CircuitBreakerScope = 'global' | 'account';

export const CIRCUIT_BREAKER_SERVICES: Record<
  CircuitBreakerService,
  { label: string; description: string; impact: string }
> = {
  ai_intake: {
    label: 'AI Intake & Receptionist',
    description: 'Gemini conversational intake, SMS parser, and automated quote suggestions.',
    impact: 'Incoming leads bypass AI and divert to the manual review queue.',
  },
  sms_outbound: {
    label: 'Outbound SMS Messaging',
    description: 'Outbound carrier dispatch, appointment reminders, and automated text chasers.',
    impact: 'All outgoing texts are suppressed to protect 10DLC carrier reputation.',
  },
  voice_routing: {
    label: 'Voice Inbound & Routing',
    description: 'Inbound telephony call answering, AI speech pipeline, and carrier call bridges.',
    impact: 'Calls play an automated maintenance notice and end cleanly.',
  },
  payments_checkout: {
    label: 'Payments & Checkout Sessions',
    description: 'Stripe direct payment links, customer checkout sessions, and deposits.',
    impact: 'New checkout sessions refuse with an operational maintenance message.',
  },
};

export type CircuitBreakerRow = {
  id: string;
  service: CircuitBreakerService;
  scope: CircuitBreakerScope;
  account_id: string | null;
  is_tripped: boolean;
  reason: string;
  tripped_by: string;
  tripped_at: string;
  cleared_by: string | null;
  cleared_at: string | null;
  created_at: string;
  updated_at: string;
};
