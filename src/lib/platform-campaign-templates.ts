import type { EmailThemeId } from '@/emails/brand';

export type PlatformCampaignTemplate = {
  id: string;
  name: string;
  category: 'announcement' | 'education' | 'promotion' | 'advisory' | 'blank';
  description: string;
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  theme: EmailThemeId;
  defaultSenderName: string;
};

export const PLATFORM_CAMPAIGN_TEMPLATES: PlatformCampaignTemplate[] = [
  {
    id: 'feature-launch',
    name: 'New Feature Launch',
    category: 'announcement',
    description: 'Announce major product updates, new tools, and workflow improvements to all contractors.',
    subject: "New on Let's Get Quoted: Instant Client Approvals & Live Tracking",
    preheader: 'See what is new in your dashboard today to win more jobs faster.',
    eyebrow: 'Product Update',
    heading: 'Exciting new features are now live in your account',
    body: `Hi {{first_name}},\n\nWe have just released a series of updates designed to help {{business_name}} close jobs faster and save hours on administration each week.\n\nHere is what is new:\n\n• One-Click Quote Approvals: Homeowners can now approve and sign estimates directly from their phone in seconds.\n• Live Arrival Tracking: Automated SMS notifications let your customers see when your crew is on their way.\n• Instant Payment Receipts: Clean, branded PDFs automatically delivered when deposits and invoices are cleared.\n\nThese updates are already available in your workspace — no setup required.`,
    ctaLabel: 'Open your dashboard & explore',
    ctaUrl: 'https://letsgetquoted.com/dashboard',
    theme: 'spotlight',
    defaultSenderName: "Let's Get Quoted Product Team",
  },
  {
    id: 'founder-letter',
    name: 'Founder Letter / Roadmap',
    category: 'announcement',
    description: 'A personal note from founder Brett regarding the roadmap, contractor stories, and tips.',
    subject: "A quick update on where we're headed (and what's next for your trade)",
    preheader: "Behind the scenes at Let's Get Quoted and what we are building for you.",
    eyebrow: 'From the Founder',
    heading: 'Building the fastest software for trade businesses',
    body: `Hi {{first_name}},\n\nI wanted to share a quick personal note to thank you for building your business with Let's Get Quoted.\n\nOver the past quarter, we have listened closely to feedback from hundreds of trade contractors across roofing, plumbing, HVAC, electrical, and general contracting. Your insights have directly shaped our upcoming roadmap:\n\n1. Smarter Scheduling: Intelligent calendar route planning to cut drive time between jobs.\n2. AI Voice Intake: Automated 24/7 call answering that turns missed calls into structured estimate requests.\n3. Deeper Accounting Sync: Seamless two-way integration with QuickBooks Online.\n\nIf there is anything specific you would like to see us build next, hit reply to this email. I read every response.`,
    ctaLabel: 'View your business overview',
    ctaUrl: 'https://letsgetquoted.com/dashboard',
    theme: 'studio',
    defaultSenderName: "Brett at Let's Get Quoted",
  },
  {
    id: 'growth-playbook',
    name: 'Contractor Growth Playbook',
    category: 'education',
    description: 'Share actionable tips, pricing strategies, and best practices to help contractors grow.',
    subject: '3 ways top contractors are increasing quote conversion by 30%',
    preheader: 'Actionable tips from top-performing trades on our platform.',
    eyebrow: 'Growth Playbook',
    heading: 'How to win more high-margin jobs this season',
    body: `Hi {{first_name}},\n\nWhen we analyzed the contractors with the highest win rates on Let's Get Quoted, three clear patterns stood out:\n\n1. Send the quote within 2 hours: Quotes sent within 120 minutes of a site visit are 2.8x more likely to be approved on the spot.\n2. Provide good-better-best options: Offering an upgraded tier increases average job value by 22% without adding sales pressure.\n3. Request deposits upfront: Locking in 25-50% deposit before scheduling reduces cancellations to near zero.\n\nYou can implement all three strategies directly inside your quote builder with standard presets.`,
    ctaLabel: 'Create a quote now',
    ctaUrl: 'https://letsgetquoted.com/dashboard/jobs/new',
    theme: 'blueprint',
    defaultSenderName: "Let's Get Quoted Advisor",
  },
  {
    id: 'upgrade-promotion',
    name: 'Special Promotion / Plan Upgrade',
    category: 'promotion',
    description: 'Incentivize free and trial users to upgrade with feature highlights and special offers.',
    subject: 'Unlock unlimited estimates, crew seats, and custom branding',
    preheader: 'Upgrade your workspace to scale your business with zero limits.',
    eyebrow: 'Special Offer',
    heading: 'Upgrade {{business_name}} to unlock full platform power',
    body: `Hi {{first_name}},\n\nReady to take {{business_name}} to the next level? Upgrading to a paid plan unlocks everything you need to run high-volume operations smoothly:\n\n• Unlimited quotes and invoices every month\n• Custom website builder on your own branded domain\n• Team & crew access with dedicated field dispatch\n• Automated customer review generation and Google Business sync\n\nUpgrade today and lock in our premier pricing for your business.`,
    ctaLabel: 'Explore upgrade plans',
    ctaUrl: 'https://letsgetquoted.com/dashboard/billing',
    theme: 'spotlight',
    defaultSenderName: "Let's Get Quoted",
  },
  {
    id: 'service-advisory',
    name: 'Service Advisory & System Notice',
    category: 'advisory',
    description: 'Important updates regarding tax rules, carrier regulations, maintenance, or security.',
    subject: 'Important advisory: Carrier messaging compliance & account updates',
    preheader: 'Please review these important compliance requirements for your business.',
    eyebrow: 'Operational Notice',
    heading: 'Important system and compliance information for your account',
    body: `Hello {{first_name}},\n\nWe are sharing an important update regarding regulatory messaging guidelines and system security best practices for trade contractors.\n\nAll automated SMS reminders, customer arrival alerts, and quote notifications sent through Let's Get Quoted adhere strictly to US telecom 10DLC compliance standards.\n\nTo ensure uninterrupted delivery of all outbound customer communications from {{business_name}}, please confirm that your legal business name and contact information are up to date in your workspace settings.`,
    ctaLabel: 'Review account settings',
    ctaUrl: 'https://letsgetquoted.com/dashboard/settings',
    theme: 'letterhead',
    defaultSenderName: "Let's Get Quoted Support",
  },
  {
    id: 'blank',
    name: 'Start from Scratch',
    category: 'blank',
    description: 'A clean slate to write your custom broadcast or announcement.',
    subject: 'Announcement for {{business_name}}',
    preheader: 'Important update from Let’s Get Quoted.',
    eyebrow: 'Announcement',
    heading: 'Update from Let’s Get Quoted',
    body: `Hi {{first_name}},\n\nWe are writing to share an update regarding {{business_name}} and your Let's Get Quoted workspace.\n\nPlease feel free to reply directly to this email if you have any questions.`,
    ctaLabel: 'Visit dashboard',
    ctaUrl: 'https://letsgetquoted.com/dashboard',
    theme: 'studio',
    defaultSenderName: "Let's Get Quoted",
  },
];
