import type { EmailThemeId } from '@/emails/brand';

export type ContractorLifecycleStepId =
  | 'welcome_day0'
  | 'quote_speed_day2'
  | 'stripe_payout_day4'
  | 'crew_arrival_day7'
  | 'reviews_reputation_day10'
  | 'ai_voice_intake_day14'
  | 'growth_scale_day21'
  | 'founder_checkin_day30'
  | 'nudge_incomplete_stripe'
  | 'nudge_zero_quotes';

export type ContractorLifecycleStep = {
  id: ContractorLifecycleStepId;
  minAgeDays: number;
  maxAgeDays?: number;
  eyebrow: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  theme: EmailThemeId;
  senderName: string;
  replyTo: string;
};

// Pure content shared by the lifecycle sender, broadcast presets, and local previews.
// Keep prices, entitlements, performance claims, and release promises out of evergreen mail.
export const CONTRACTOR_LIFECYCLE_STEPS: ContractorLifecycleStep[] = [
  {
    "id": "welcome_day0",
    "minAgeDays": 0,
    "maxAgeDays": 1,
    "eyebrow": "Welcome to Let’s Get Quoted",
    "subject": "Welcome to Let's Get Quoted — start with one job",
    "preheader": "A simple first step for your website, quotes, and payments.",
    "heading": "Let’s get {{business_name}} set up",
    "body": "Hi {{first_name}},\n\nThanks for joining Let's Get Quoted. Running a small business means wearing a lot of hats. Your workspace gives you one place to keep customer requests, quotes, and jobs organized.\n\n## Start with the basics\n\n1. Check your business details: Review your services, service area, and contact information. If you’re building a website, preview it before you publish or share it.\n2. Create a quote draft: Add a customer, describe the work, and check your pricing. You decide when it’s ready to send.\n3. Set up payments when you’re ready: Open Payments in Settings to connect Stripe and review any setup requirements.\n\nYou don’t need to set everything up today. Start with the next job on your list. Reply if you need a hand.",
    "ctaLabel": "Open my workspace",
    "ctaPath": "/dashboard",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "quote_speed_day2",
    "minAgeDays": 2,
    "maxAgeDays": 4,
    "eyebrow": "Your first quote",
    "subject": "A clear quote makes the next step easier",
    "preheader": "Scope, price, and next steps — all in one place.",
    "heading": "Turn a customer request into a clear quote",
    "body": "Hi {{first_name}},\n\nAfter a site visit or customer call, the details are fresh. Use them to put together a quote that’s easy to understand.\n\n## A useful quote covers three things\n\n1. The work: Describe what’s included and anything you need to confirm.\n2. The price: Check quantities, labor, materials, and any optional work before sending.\n3. The next step: Make it clear how the customer can review and accept your quote.\n\nOpen Jobs to create or review a draft. Check the customer’s contact details and the available sending options, then send it when you’re ready.\n\nNeed help getting your first draft together? Reply and tell us where you’re stuck.",
    "ctaLabel": "Open my quotes and jobs",
    "ctaPath": "/dashboard/jobs",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "stripe_payout_day4",
    "minAgeDays": 4,
    "maxAgeDays": 6,
    "eyebrow": "Customer payments",
    "subject": "Give customers an easier way to pay",
    "preheader": "Review your Stripe connection and payment settings.",
    "heading": "Set up online payments for your jobs",
    "body": "Hi {{first_name}},\n\nKeeping payment details with the job can save another round of calls and paperwork. Let’s Get Quoted uses Stripe for supported online customer payments.\n\n## Check your payment setup\n\n1. Open Payments in Settings: Review your Stripe connection and complete any outstanding requirements.\n2. Review your payment terms: Choose the deposit or balance you want to request for the job.\n3. Check before sending: Confirm the amount and customer details before sharing a payment request.\n\nAvailable payment methods, processing fees, and payout timing depend on your Stripe account and settings. Connecting Stripe does not guarantee next-day deposits.\n\nReply if you need help finding the right setting.",
    "ctaLabel": "Review payment settings",
    "ctaPath": "/dashboard/settings?tab=payments",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "crew_arrival_day7",
    "minAgeDays": 7,
    "maxAgeDays": 10,
    "eyebrow": "Organize the workday",
    "subject": "Keep job details handy for you and your crew",
    "preheader": "Make the address, scope, and arrival plan easy to find.",
    "heading": "Less phone tag on a busy workday",
    "body": "Hi {{first_name}},\n\nWhether you work alone or with a crew, it helps to keep the day’s details attached to the job.\n\n## Before the next visit\n\n1. Check the job notes: Confirm the address, scope, access instructions, and customer contact details.\n2. Review the schedule: Make sure the visit and arrival window reflect your plan.\n3. Coordinate the team: If others help with your jobs, review crew access and assignments. Available seats depend on your plan.\n\nCustomer texts and arrival updates need messaging setup and the relevant options enabled. Check those settings before relying on an automated update.\n\nStart with tomorrow’s jobs and make sure everyone has what they need.",
    "ctaLabel": "Review my schedule",
    "ctaPath": "/dashboard/schedule",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "reviews_reputation_day10",
    "minAgeDays": 10,
    "maxAgeDays": 13,
    "eyebrow": "Customer feedback",
    "subject": "Make room for honest customer feedback",
    "preheader": "Review your review link and follow-up settings.",
    "heading": "Make it easy for customers to share feedback",
    "body": "Hi {{first_name}},\n\nA finished job is a good time to ask how things went. A short, friendly request gives customers a chance to share their experience with {{business_name}}.\n\n## Check your review setup\n\n1. Review your public review link: Make sure it points to the right business.\n2. Check your request settings: Review when requests go out and which channels are enabled.\n3. Keep the request open: Invite honest feedback from customers, without asking only happy customers to leave a public review.\n\nIf someone raises a concern, follow up and help resolve it. Reviews are useful feedback; a request does not guarantee a particular rating or search ranking.",
    "ctaLabel": "Review my review settings",
    "ctaPath": "/dashboard/reviews",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "ai_voice_intake_day14",
    "minAgeDays": 14,
    "maxAgeDays": 18,
    "eyebrow": "AI call answering",
    "subject": "When you can’t pick up, keep the job details",
    "preheader": "See whether AI call answering fits your business.",
    "heading": "Take a look at AI call answering",
    "body": "Hi {{first_name}},\n\nYou can’t always answer the phone while you’re working. AI call answering can help collect a caller’s request so you have details to follow up on.\n\n## Review it before you turn it on\n\n1. Check availability and usage: Review the options, included usage, and any charges shown in your workspace.\n2. Set your business details: Check your greeting, hours, services, and call-handling preferences.\n3. Try your setup: Place a test call and review what appears in your call history before using it with customers.\n\nReview captured details before quoting, scheduling, or making a promise to a customer. Call forwarding and answering behavior depend on your setup.\n\nReply if you’d like help finding the options for your business.",
    "ctaLabel": "Review AI call answering",
    "ctaPath": "/dashboard/automations#ai-receptionist",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "growth_scale_day21",
    "minAgeDays": 21,
    "maxAgeDays": 28,
    "eyebrow": "Choose what fits",
    "subject": "Is your plan still a good fit for {{business_name}}?",
    "preheader": "Compare your actual usage with the current plan options.",
    "heading": "Choose a plan around the work you do",
    "body": "Hi {{first_name}},\n\nYour software should fit the size of your business. If your workload has changed, take a look at your current usage before deciding whether to change plans.\n\n## A few things to compare\n\n• Your team: How many people need access to the workspace?\n• Your usage: What are you using for messages, AI tools, and other metered features?\n• Your costs: How do the monthly price, included allowances, and platform fees compare?\n\nOpen Plan & usage to see the details for your account. Review current prices, limits, and any additional charges before making a change.\n\nIf your current plan is working for you, there’s no need to rush an upgrade.",
    "ctaLabel": "Review my plan and usage",
    "ctaPath": "/dashboard/settings?tab=plan",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "founder_checkin_day30",
    "minAgeDays": 30,
    "maxAgeDays": 45,
    "eyebrow": "A note from Brett",
    "subject": "How is Let’s Get Quoted working for you?",
    "preheader": "What’s helping — and what still feels like extra work?",
    "heading": "How’s it going at {{business_name}}?",
    "body": "Hi {{first_name}},\n\nBrett here, founder of Let’s Get Quoted. Thanks for giving us a place in your workday.\n\nWe’re building tools to help small trade businesses spend less time organizing the work and more time doing it. Hearing where things feel useful — or confusing — helps us improve.\n\nWhat has helped you so far? And what’s one thing that still takes more effort than it should?\n\nReply to this email to share your feedback with our team. A real example from your day is especially helpful.\n\nThanks,\nBrett",
    "ctaLabel": "Open my workspace",
    "ctaPath": "/dashboard",
    "senderName": "Brett at Let's Get Quoted",
    "theme": "blueprint",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "nudge_incomplete_stripe",
    "minAgeDays": 3,
    "maxAgeDays": 14,
    "eyebrow": "Payment setup help",
    "subject": "Need a hand finishing payment setup?",
    "preheader": "Review any remaining Stripe requirements for your business.",
    "heading": "Pick up where you left off with payments",
    "body": "Hi {{first_name}},\n\nIt looks like payment setup for {{business_name}} still needs attention. If you want to accept online payments through Let’s Get Quoted, you can review the remaining steps in your workspace.\n\n## Finish the next step\n\n1. Open Payments in Settings: Check the status of your Stripe connection.\n2. Follow the secure setup link: Review and complete any business, identity, or bank requirements Stripe shows you.\n3. Check the result: Return to your workspace and confirm your payment setup is ready before sending a payment request.\n\nPayout timing and available methods depend on Stripe and your account. Please don’t send bank details by email.\n\nReply if you need help finding the setup screen.",
    "ctaLabel": "Review payment setup",
    "ctaPath": "/dashboard/settings?tab=payments",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  },
  {
    "id": "nudge_zero_quotes",
    "minAgeDays": 5,
    "maxAgeDays": 15,
    "eyebrow": "First quote help",
    "subject": "Need a hand with your first quote?",
    "preheader": "Start with one customer, a short scope, and your price.",
    "heading": "Let’s get your first quote started",
    "body": "Hi {{first_name}},\n\nIt looks like {{business_name}} hasn’t created a priced quote yet. If you have a job to quote, start with the details you already know.\n\n## Build a draft in three steps\n\n1. Add the customer: Check their name and contact details.\n2. Describe the work: Add the services, quantities, and prices for the job. Review any suggested items before using them.\n3. Check and send: Review the scope, total, and terms, then choose an available sending option when you’re ready.\n\nYou can keep it as a draft while you work out the details. Nothing needs to go to a customer until you’re ready to send it.\n\nIf you’re stuck, reply and tell us which step you need help with.",
    "ctaLabel": "Start my first quote",
    "ctaPath": "/dashboard/jobs",
    "theme": "blueprint",
    "senderName": "Let's Get Quoted",
    "replyTo": "hello@letsgetquoted.com"
  }
];
