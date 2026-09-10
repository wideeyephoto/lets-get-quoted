import type { EmailThemeId } from '@/emails/brand';
import { CONTRACTOR_LIFECYCLE_STEPS, type ContractorLifecycleStepId } from '@/lib/contractor-lifecycle-content';

export type PlatformCampaignTemplate = {
  id: string; name: string;
  category: 'announcement' | 'education' | 'promotion' | 'advisory' | 'blank';
  description: string; subject: string; preheader: string; eyebrow: string; heading: string;
  body: string; ctaLabel: string; ctaUrl: string; theme: EmailThemeId; defaultSenderName: string;
};

function fromLifecycle(id: string, name: string, stepId: ContractorLifecycleStepId, description: string): PlatformCampaignTemplate {
  const step = CONTRACTOR_LIFECYCLE_STEPS.find((entry) => entry.id === stepId)!;
  return {
    id, name, category: 'education', description,
    subject: step.subject, preheader: step.preheader, eyebrow: step.eyebrow,
    heading: step.heading, body: step.body, ctaLabel: step.ctaLabel,
    ctaUrl: '{{app_url}}' + step.ctaPath.slice('/dashboard'.length),
    theme: 'blueprint', defaultSenderName: step.senderName,
  };
}

export const PLATFORM_CAMPAIGN_TEMPLATES: PlatformCampaignTemplate[] = [
  fromLifecycle("welcome-quickstart", "Welcome & Quick Start Guide", "welcome_day0", "Start with business details, a quote draft, and payment setup."),
  fromLifecycle("first-quote-closing", "Your First Quote", "quote_speed_day2", "Help owners prepare a clear quote."),
  fromLifecycle("stripe-deposit-setup", "Customer Payment Setup", "stripe_payout_day4", "Explain payment setup without guaranteed payout timing."),
  fromLifecycle("google-reviews-flywheel", "Customer Reviews & Feedback", "reviews_reputation_day10", "Invite honest feedback and check request settings."),
  fromLifecycle("ai-voice-intake", "AI Call Answering", "ai_voice_intake_day14", "Review availability, setup, and a test call."),
  {
  "id": "seasonal-surge",
  "name": "Plan for a Busy Season",
  "category": "education",
  "description": "Help owners review availability and follow up on open work.",
  "subject": "A quick check before your busy season",
  "preheader": "Review your schedule, open quotes, and service details.",
  "eyebrow": "Plan ahead",
  "heading": "Make room for the work you want",
  "body": "Hi {{first_name}},\n\nBefore the calendar fills up, take a few minutes to check the basics for {{business_name}}.\n\n1. Review your schedule: Check available days, existing commitments, and the time each job needs.\n2. Revisit open quotes: Follow up where it makes sense and confirm the work is still needed before scheduling it.\n3. Check your website: Make sure your services, service area, and contact details match what you’re offering this season.\n\nKeep your availability realistic. A clear plan is more useful than an overbooked week.",
  "ctaLabel": "Review my schedule",
  "ctaUrl": "{{app_url}}/schedule",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "quick-stops-revenue",
  "name": "Quick Stops: Fill a Schedule Gap",
  "category": "education",
  "description": "Explain optional same-day offers without promising revenue.",
  "subject": "Have a gap in today’s route?",
  "preheader": "See how a nearby Quick Stop could fit your day.",
  "eyebrow": "Quick Stops",
  "heading": "Put a spare appointment to work",
  "body": "Hi {{first_name}},\n\nIf a job finishes early or a customer reschedules, a nearby small job may fit the gap.\n\nQuick Stops lets you review requests and choose whether to offer a visit. Check the location, scope, arrival window, and fee before making an offer. The customer can then review the offer and pay to confirm the visit.\n\nYou stay in control of the work you accept. Availability depends on your setup, schedule, and customer demand.\n\nTake a look at the feature guide to see whether Quick Stops fits the way {{business_name}} works.",
  "ctaLabel": "See how Quick Stops works",
  "ctaUrl": "https://letsgetquoted.com/features/quick-stops",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "feature-launch",
  "name": "Workspace Feature Overview",
  "category": "announcement",
  "description": "An evergreen overview; customize and verify availability before announcing a release.",
  "subject": "A quick look around your Let’s Get Quoted workspace",
  "preheader": "Keep the customer, quote, and job details connected.",
  "eyebrow": "Your workspace",
  "heading": "Keep the details with the job",
  "body": "Hi {{first_name}},\n\nYour workspace brings the main parts of a job together, so it’s easier to pick up where you left off.\n\n• Quotes: Review the scope, pricing, and customer details before sending.\n• Schedule: Keep visits and assignments organized as the work changes.\n• Payments: Review payment requests and recorded activity alongside the job.\n\nOpen your dashboard to see what needs attention at {{business_name}}. Some options depend on your plan and setup.\n\nReply if you need help finding a feature.",
  "ctaLabel": "Open my workspace",
  "ctaUrl": "{{app_url}}",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "founder-letter",
  "name": "A Note from Brett",
  "category": "announcement",
  "description": "Ask for useful feedback without inventing a roadmap or personal response promise.",
  "subject": "What would make your workday easier?",
  "preheader": "A question from Brett, founder of Let’s Get Quoted.",
  "eyebrow": "A note from Brett",
  "heading": "Help us build around your workday",
  "body": "Hi {{first_name}},\n\nBrett here, founder of Let’s Get Quoted. Thanks for using the workspace for {{business_name}}.\n\nThe best feedback starts with a real job: something that went smoothly, something that took too many steps, or a detail that was hard to find.\n\nWhat’s one thing you’d like to make easier in your workday?\n\nReply to share it with our team. Your examples help us understand what matters to the businesses using Let’s Get Quoted.\n\nThanks,\nBrett",
  "ctaLabel": "Open my workspace",
  "ctaUrl": "{{app_url}}",
  "defaultSenderName": "Brett at Let's Get Quoted",
  "theme": "blueprint"
},
  {
  "id": "growth-playbook",
  "name": "Write a Clearer Quote",
  "category": "education",
  "description": "Practical quoting tips without unsupported conversion statistics.",
  "subject": "Three small ways to make your next quote clearer",
  "preheader": "Help customers understand the work and the next step.",
  "eyebrow": "Quoting tips",
  "heading": "Make your quote easy to say yes to",
  "body": "Hi {{first_name}},\n\nA useful quote answers the questions a customer is likely to ask before they commit.\n\n1. Be specific about the scope: Explain what’s included, what isn’t, and anything that could change the price.\n2. Separate optional work: Make add-ons easy to understand so the customer can compare choices.\n3. Explain the next step: State how to accept, what payment is requested, and how scheduling works.\n\nBefore sending, read it as if you were seeing the job for the first time. Does it give the customer enough information to decide?\n\nOpen an existing draft and give it one more look.",
  "ctaLabel": "Review my quotes",
  "ctaUrl": "{{app_url}}/jobs",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "upgrade-promotion",
  "name": "Compare Current Plans",
  "category": "promotion",
  "description": "Invite a plan comparison without invented discounts or unlimited allowances.",
  "subject": "Find the right plan for the work you’re doing",
  "preheader": "Compare current prices, included usage, and team access.",
  "eyebrow": "Plan options",
  "heading": "Pick the plan that fits {{business_name}}",
  "body": "Hi {{first_name}},\n\nIf you’re adding team members or handling more jobs, it may be worth reviewing your plan.\n\nCompare the monthly price, platform fees, included usage, and team capacity against what your business actually needs. Check any additional usage charges before deciding.\n\nYour Plan & usage page shows your account’s current details. There’s no need to change plans if the one you have is still a good fit.\n\nReply if you need help finding those details.",
  "ctaLabel": "Compare my plan options",
  "ctaUrl": "{{app_url}}/settings?tab=plan",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "service-advisory",
  "name": "Messaging Setup Check",
  "category": "advisory",
  "description": "Guide owners to actual messaging readiness without blanket compliance guarantees.",
  "subject": "Check your customer messaging setup",
  "preheader": "Review your business details and texting readiness.",
  "eyebrow": "Messaging setup",
  "heading": "Check before your next customer text",
  "body": "Hi {{first_name}},\n\nBefore relying on automated customer texts, review the messaging status shown in your workspace.\n\n1. Check your business details: Make sure your contact information and business name are current.\n2. Review setup status: Complete any required steps shown for your sending number and messaging registration.\n3. Review the message: Confirm the recipient, purpose, and wording, and honor customer opt-outs.\n\nDelivery depends on your setup and the receiving carrier. The workspace will show any action needed; a completed business profile alone does not confirm messaging is ready.\n\nReply if a setup message is unclear.",
  "ctaLabel": "Review messaging setup",
  "ctaUrl": "{{app_url}}/automations",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
  {
  "id": "blank",
  "name": "Start from Scratch",
  "category": "blank",
  "description": "A neutral starting point for an owner-facing announcement.",
  "subject": "An update for {{business_name}}",
  "preheader": "A note from Let’s Get Quoted.",
  "eyebrow": "From Let’s Get Quoted",
  "heading": "An update for {{business_name}}",
  "body": "Hi {{first_name}},\n\nWe’re writing with an update about your Let’s Get Quoted workspace.\n\nReply to this email if you have a question. Our team is here to help.",
  "ctaLabel": "Open my workspace",
  "ctaUrl": "{{app_url}}",
  "theme": "blueprint",
  "defaultSenderName": "Let's Get Quoted"
},
];
