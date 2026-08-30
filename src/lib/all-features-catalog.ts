export type FeatureItem = {
  id: string;
  name: string;
  desc: string;
  tags?: string[];
  subBullets: string[];
};

export type FeatureCatalogCategory = {
  num: string;
  slug: string;
  title: string;
  icon: string;
  intro: string;
  features: FeatureItem[];
};

export const ALL_FEATURES_CATALOG: FeatureCatalogCategory[] = [
  {
    num: '01',
    slug: 'website-builder',
    title: 'Hosted Website Builder & Online Presence',
    icon: '🌐',
    intro: 'A complete, high-converting marketing website for your trade on your own domain in minutes.',
    features: [
      {
        id: 'hosted-site',
        name: 'Trade-Specific Hosted Websites',
        desc: 'Instant launch of a modern, responsive contractor website on your custom domain or a free subdomain.',
        tags: ['Web', 'Branding', 'Instant Launch'],
        subBullets: [
          'One-click publishing on your custom domain (e.g., acmecustomroofing.com) or a free yourname.letsgetquoted.com subdomain.',
          'Automated DNS verification, root/wildcard routing, and zero-config SSL certificate provisioning.',
          'Instant publish/unpublish toggle to take sites live or make offline edits safely.',
        ],
      },
      {
        id: 'templates-themes',
        name: 'Trade-Specific Design Themes',
        desc: 'Handcrafted design themes tailored for every trade with curated typography and color schemes.',
        tags: ['Design', 'Themes'],
        subBullets: [
          'Tailored themes for roofing, plumbing, electrical, HVAC, painting, masonry, landscaping, carpentry, and general contracting.',
          '5 foundational UX archetypes: Full-Bleed Video Hero, Split-Screen Hero, Minimalist Modern, Centered-Clean, and Data/Stat-driven.',
          'Handpicked Google Font pairings and accessible HSL color palettes tailored to blue-collar trade branding.',
        ],
      },
      {
        id: 'video-sections',
        name: 'Video Hero & Section Layouts',
        desc: 'Rich video sections to showcase real craftsmanship, project stories, and crew introductions.',
        tags: ['Video', 'Media'],
        subBullets: [
          'Six dedicated video layouts: Background Hero Loop, Side-by-Side Video + Copy, Project Story, Reel Showcase, Video Testimonial, and Step-by-Step Process.',
          'Native support for MP4, MOV, WebM uploads (up to 50 MB) and YouTube embeds.',
          'Embed up to four separate video sections per page to showcase craftsmanship and crew introductions.',
        ],
      },
      {
        id: 'media-auditing',
        name: 'Built-in Video & Image Auditing',
        desc: 'Automatic pre-upload checks for file size, mobile data overhead, playback codecs, and still-frame fallbacks.',
        tags: ['Performance', 'Quality'],
        subBullets: [
          'Automated pre-upload scanner detects oversized clips and heavy mobile data loads (enforces ≤12 MB for background loops).',
          'Codec verification alerts for incompatible formats (e.g., Apple HEVC .mov) with step-by-step instructions to convert.',
          'Automatic video poster frame generation so videos look crisp before playing on slower connections.',
        ],
      },
      {
        id: 'modular-sections',
        name: 'Modular Drag-and-Drop Section Customization',
        desc: 'Toggleable and reorderable sections to highlight seasonal specials, galleries, and core services.',
        tags: ['Customization'],
        subBullets: [
          '8 core section types: Services Grid, How It Works, Before/After Image Sliders, Project Galleries, Key Metrics, FAQs, Testimonials, and Service Area Maps.',
          'Instant toggle on/off and reordering to highlight specific seasonal promotions or core specialties.',
          '7 distinct header navigation bars and 4 footer variations with social media links and certification badges.',
        ],
      },
      {
        id: 'auto-logo-generator',
        name: 'Automated Brand Mark & Vector Logo Creator',
        desc: 'Instant trade-tailored vector logo generator for contractors without existing branding assets.',
        tags: ['Branding'],
        subBullets: [
          'Generates a trade-tailored monogram or tool-mark logo if the contractor lacks existing artwork.',
          'Automatically coordinates your logo mark across website headers, footers, mobile app icons, and browser favicons.',
          'Downloadable high-res vector and PNG files for work trucks, business cards, and yard signs.',
        ],
      },
      {
        id: 'stock-photos',
        name: 'Smart Stock Photo Library',
        desc: 'Curated trade photography library placed automatically until real job site photos are uploaded.',
        tags: ['Media'],
        subBullets: [
          'Curated library of real, trade-specific stock photography categorized by industry and service type.',
          'Automatically populates placeholder hero images and service cards until real job site photos are uploaded.',
          'Unsplash/Pexels license compliance and attribution handling baked in.',
        ],
      },
      {
        id: 'auto-seo-jsonld',
        name: 'Automatic Local SEO & Rich Structured Data',
        desc: 'Pre-configured meta tags and Schema.org rich-snippet structured data for standout Google rankings.',
        tags: ['SEO', 'Google'],
        subBullets: [
          'Auto-generated SEO meta titles, meta descriptions, OpenGraph social sharing preview cards, and canonical URLs.',
          'Dynamic JSON-LD Schema.org markup for LocalBusiness, Service, AggregateRating, and BreadcrumbList.',
          'Optimizes Google search appearance for "near me" local contractor searches.',
        ],
      },
      {
        id: 'ai-blog-generator',
        name: 'AI Blog Post Generator & Content Scheduler',
        desc: 'On-brand SEO articles drafted automatically for your approval with scheduled publishing.',
        tags: ['AI', 'Content', 'SEO'],
        subBullets: [
          'Generates SEO-optimized blog articles referencing your exact services, cities served, and seasonal tips.',
          'Configurable auto-publish schedules with configurable 2, 4, or 8-week content freshness reminders.',
          'Full markdown editor to review, customize, or add job photos before going live.',
        ],
      },
      {
        id: 'reputation-speed-badges',
        name: 'Reputation & Response Speed Badges',
        desc: 'Trust badges showing your verified Google rating and real response times.',
        tags: ['Trust', 'Social Proof'],
        subBullets: [
          'Embedded Google Review badge displaying aggregate star rating and total review count.',
          'Dynamic "Typically replies within X minutes" badge calculated from your real lead response history.',
        ],
      },
      {
        id: 'legal-pages-privacy',
        name: 'Compliant Legal Pages',
        desc: 'Auto-generated Privacy Policy and Terms of Service customized to your business entity.',
        tags: ['Compliance'],
        subBullets: [
          'Pre-built, editable Privacy Policy and Terms of Service linked in every website footer.',
          'Automatically incorporates your registered business name, state jurisdiction, and contact email.',
        ],
      },
      {
        id: 'hide-number-mode',
        name: 'Hide-Your-Number Mode',
        desc: 'Route web inquiries through secure forms while maintaining direct texting from your business line.',
        tags: ['Privacy'],
        subBullets: [
          'Option to hide your personal mobile number from public web scrapers and spam callers.',
          'Routes all customer communications through secure web forms and AI intake while allowing direct outbound texting from your business line.',
        ],
      },
    ],
  },
  {
    num: '02',
    slug: 'ai-lead-intake',
    title: 'AI Lead Capture, Smart Intake & Triage',
    icon: '⚡',
    intro: 'Turn web visitors into qualified leads with 24/7 conversational estimating and automated scoring.',
    features: [
      {
        id: 'ai-smart-intake',
        name: 'Interactive AI Smart Intake',
        desc: '24/7 conversational estimating widget that asks trade questions and returns instant budget ranges.',
        tags: ['AI', 'Leads', 'Estimating'],
        subBullets: [
          '24/7 conversational estimating widget embedded directly into your website.',
          'Asks dynamic follow-up questions based on the homeowner’s selected trade, project scope, and urgency.',
          'Delivers a realistic, ballpark price range on the spot to set clear budget expectations.',
        ],
      },
      {
        id: 'estimate-posture',
        name: 'Configurable Estimate Posture',
        desc: 'Tune the AI estimator between budget-friendly, balanced, or high-margin pricing tiers.',
        tags: ['Pricing', 'AI'],
        subBullets: [
          'Adjustable pricing personality: Budget/Competitive, Balanced, or High-Margin/Premium.',
          'Multipliers allow you to tune how aggressively or conservatively the AI prices initial ranges.',
        ],
      },
      {
        id: 'lead-scoring-triage',
        name: 'Instant Lead Scoring & Triage',
        desc: 'Automated Hot, Warm, and Low lead scoring based on project scope, timeline, and budget.',
        tags: ['Automation', 'Scoring'],
        subBullets: [
          'Scored automatically into Hot, Warm, or Low categories upon submission.',
          'Evaluation engine weighs project budget, immediate readiness to hire, job complexity, and travel distance.',
          'Flags high-margin projects so you can call the homeowner back within minutes.',
        ],
      },
      {
        id: 'high-value-lead-alerts',
        name: 'High-Value Lead SMS Alerts',
        desc: 'Urgent mobile notifications triggered immediately when high-dollar opportunities arrive.',
        tags: ['Alerts', 'SMS'],
        subBullets: [
          'Sends urgent SMS alerts and high-priority emails directly to the owner’s phone when big-ticket leads arrive.',
          'Configurable threshold (e.g., alert immediately on any project estimated over $3,000).',
        ],
      },
      {
        id: 'noise-filtering-spam-guard',
        name: 'Noise Filtering & Spam Shield',
        desc: 'Mutes low-quality leads and filters automated bots with honeypot fields and submission timing.',
        tags: ['Security', 'Filtering'],
        subBullets: [
          'Low-scoring or out-of-scope inquiries are silently logged to the dashboard without sending push/SMS notifications.',
          'Bot prevention using hidden honeypot fields, submission timing analysis, and IP rate limiting.',
        ],
      },
      {
        id: 'custom-quote-forms',
        name: 'Custom Lead Intake Forms',
        desc: 'Classic multi-field intake forms with custom trade fields and Google Places autocomplete.',
        tags: ['Forms'],
        subBullets: [
          'Customizable fields allowing you to request square footage, building age, job photos, or gate access codes.',
          'Google Places address autocomplete to ensure accurate, validated street addresses.',
        ],
      },
      {
        id: 'service-area-gatekeeper',
        name: 'Service Area Filtering & Gatekeeper',
        desc: 'Validates homeowner addresses against your exact service radius to protect crew travel time.',
        tags: ['Routing', 'Map'],
        subBullets: [
          'Configurable radius or list of allowed postal/ZIP codes and municipalities.',
          'Inquiries outside your service territory are flagged with an "Out of Service Area" tag to protect drive time.',
        ],
      },
      {
        id: 'phone-verification',
        name: 'SMS Phone Number Verification',
        desc: 'One-time SMS passcode to eliminate fake phone numbers and unqualified submissions.',
        tags: ['SMS', 'Verification'],
        subBullets: [
          'Optional one-time SMS verification passcode (OTP) required from homeowners before form submission.',
          'Eliminates fake phone numbers, typos, and tire-kickers.',
        ],
      },
      {
        id: 'lead-deduplication',
        name: 'Automated Lead De-duplication',
        desc: 'Merges repeat submissions into a single unified client record instead of creating duplicates.',
        tags: ['CRM'],
        subBullets: [
          'Automatically detects matching phone numbers or email addresses from existing leads or clients.',
          'Appends new notes and photos to the existing record instead of creating duplicate clutter.',
        ],
      },
    ],
  },
  {
    num: '03',
    slug: 'ai-vision',
    title: 'AI Vision & Photo Job Estimator',
    icon: '📸',
    intro: 'Inspect homeowner job photos with GPT-4o vision to detect equipment specs, failure points, and parts needed.',
    features: [
      {
        id: 'gpt4o-vision-inspection',
        name: 'GPT-4o Vision Photo Inspection',
        desc: 'AI visual analysis of homeowner-uploaded job photos to identify issues before arriving on site.',
        tags: ['AI Vision', 'Diagnostics'],
        subBullets: [
          'Scans homeowner-uploaded photos directly from quote requests or SMS threads.',
          'Analyzes up to 4 job photos simultaneously to detect system layouts, clearances, and visible damage.',
        ],
      },
      {
        id: 'badge-detection',
        name: 'Equipment & Model Badge Detection',
        desc: 'Extracts equipment brand, model number, specifications, and estimated age from data plates.',
        tags: ['AI Vision', 'Equipment'],
        subBullets: [
          'Reads and transcribes manufacturer data plates, serial tags, and warning stickers.',
          'Identifies equipment type (e.g., 50-Gallon Gas Water Heater, 200A Electrical Panel, 3-Ton Heat Pump).',
          'Estimates approximate equipment age to help you pitch replacements vs. repairs.',
        ],
      },
      {
        id: 'defect-logging',
        name: 'Observed Failure & Defect Logging',
        desc: 'Highlights corrosion, leaks, rot, burn marks, or cracked masonry in a crisp technical summary.',
        tags: ['AI Vision'],
        subBullets: [
          'Extracts visible defects: rust corrosion, active leaks, cracked shingles, scorched wiring, or drywall water stains.',
          'Generates a clear 1–2 sentence diagnostic summary ready to paste into your quote.',
        ],
      },
      {
        id: 'supply-house-picklist',
        name: 'Automated Supply House Pick-Lists',
        desc: 'Generates an itemized list of required parts, fittings, and supplies needed for the job.',
        tags: ['Inventory', 'Supplies'],
        subBullets: [
          'Generates an itemized list of required parts, fittings, pipe lengths, breakers, and supplies needed for the job.',
          'Groups items by category (e.g., Valves, Pipes & Fittings, Fasteners, Electrical) with estimated quantities.',
        ],
      },
      {
        id: 'safety-code-flags',
        name: 'Safety Hazard & Code Violation Flags',
        desc: 'Automatically spots code violations and hazards (missing expansion tanks, ungrounded wiring, unvented lines).',
        tags: ['Safety', 'Compliance'],
        subBullets: [
          'Flags non-compliant installations (e.g., missing expansion tanks, unvented lines, ungrounded Romex, missing drip edges).',
          'Gives you immediate talking points during the estimate to explain why code upgrades are required.',
        ],
      },
    ],
  },
  {
    num: '04',
    slug: 'ai-voice-assistant',
    title: 'AI Voice Assistant & 24/7 Receptionist',
    icon: '📞',
    intro: '24/7 automated telephone answering, intelligent call screening, real-time booking, and audio transcripts.',
    features: [
      {
        id: '247-phone-answering',
        name: '24/7 Inbound Phone Answering',
        desc: 'AI receptionist answers calls when you are on a roof, on a jobsite, or after business hours.',
        tags: ['AI Voice', 'Receptionist'],
        subBullets: [
          'Answers customer phone calls instantly when your crew is working, driving, or after business hours.',
          'Zero hold times, high-fidelity conversational voice synthesis, and natural interruption handling.',
        ],
      },
      {
        id: 'business-grounded-calls',
        name: 'Business-Grounded Call Flow',
        desc: 'Grounded strictly in your services, pricing guidelines, operating hours, and service territory.',
        tags: ['AI Voice', 'Customization'],
        subBullets: [
          'Grounded strictly in your business profile: services offered, operating hours, emergency rates, and service towns.',
          'Politely screens out solicitations, robo-callers, and out-of-scope inquiries.',
        ],
      },
      {
        id: 'phone-appointment-booking',
        name: 'Automated Phone Appointment Booking',
        desc: 'Checks live calendar availability and books appointments directly into your schedule over the phone.',
        tags: ['AI Voice', 'Booking'],
        subBullets: [
          'Checks live calendar availability in real time during the conversation.',
          'Proposes open arrival windows to the caller and locks the appointment directly onto your schedule.',
        ],
      },
      {
        id: 'post-call-sms',
        name: 'Post-Call SMS Follow-ups',
        desc: 'Automatically texts the caller a booking confirmation, quote link, or recap as soon as the call ends.',
        tags: ['SMS', 'Automation'],
        subBullets: [
          'Automatically texts the caller a personalized booking confirmation, quote link, or intake recap as soon as the call ends.',
          'Keeps the conversation moving forward even after the customer hangs up.',
        ],
      },
      {
        id: 'call-transcripts-recordings',
        name: 'Call Transcripts & Audio Recordings',
        desc: 'Full audio playback, searchable text transcripts, and structured call summaries in your dashboard.',
        tags: ['Audio', 'CRM'],
        subBullets: [
          'Complete audio playback and full searchable text transcripts for every inbound call.',
          'Generates structured summaries with caller name, address, service needed, and urgency level.',
        ],
      },
      {
        id: 'missed-call-textback',
        name: 'Instant Missed-Call Text-Back',
        desc: 'Automatically texts unanswered callers within seconds to capture leads before they call a competitor.',
        tags: ['SMS', 'Speed to Lead'],
        subBullets: [
          'If a call is ever unanswered, the system triggers an immediate SMS: "Hi, sorry we missed your call at [Business Name]. How can we help you today?"',
          'Captures leads before they dial the next contractor on Google.',
        ],
      },
    ],
  },
  {
    num: '05',
    slug: 'contractor-voice-actions',
    title: 'Contractor Voice Actions & Hands-Free Tools',
    icon: '🎙️',
    intro: 'Speak naturally while driving or on-site to create leads, update line items, or draft change orders hands-free.',
    features: [
      {
        id: 'sparky-ai-sidekick',
        name: 'In-App AI Copilot & Trade Companions',
        desc: 'In-app AI assistant with live screen awareness and customizable trade avatars (Sparky, Diesel, Echo, and AI Spark). Text site photos, notes, and voice memos—your copilot sorts them to the right job and reminds you later.',
        tags: ['AI Copilot', 'AI Sidekick', 'Text-to-Job', 'Photo Sorting', 'Voice & Text'],
        subBullets: [
          'Text-to-Job photo & note sorting: text site photos or receipts via SMS and your AI Copilot files them directly into the right job record.',
          'Automated follow-up reminders: tell your Copilot when to remind you to send quotes, order materials, or follow up with clients.',
          'In-context workspace awareness pre-hydrates active job and client files on your screen.',
          'Natural language quote builder calculates line items, materials, labor, and add-on up-sells.',
          'Live punch list updater adds and manages tasks on active jobs on the fly.',
          'Cash flow watchdog queries overdue invoices and dispatches 1-tap SMS payment links.',
        ],
      },
      {
        id: 'speech-to-action',
        name: 'Speech-to-Action Field Dictation',
        desc: 'Transcribes spoken audio into clean, structured database updates using specialized trade prompts.',
        tags: ['AI Voice', 'Mobile'],
        subBullets: [
          'Built-in microphone button on the dashboard and field app for voice-driven data entry.',
          'Transcribes spoken audio into clean, structured database updates using specialized trade prompts.',
        ],
      },
      {
        id: 'voice-lead-creation',
        name: 'Voice-Powered Lead Creation',
        desc: 'Dictate client name, phone number, address, and scope to instantly generate a scored lead.',
        tags: ['AI Voice', 'Leads'],
        subBullets: [
          'Dictate: "Got a call from Mike Smith at 142 Elm St, needs a 200 amp panel upgrade next Tuesday, mark it hot."',
          'AI automatically parses the name, normalized phone, address, scope, schedule date, and sets the lead score to Hot.',
        ],
      },
      {
        id: 'voice-quote-updates',
        name: 'Voice Job Scope & Pricing Updates',
        desc: 'Dictate line items, quantities, and pricing while walking the jobsite to update quotes in real time.',
        tags: ['AI Voice', 'Quotes'],
        subBullets: [
          'Dictate line items, quantities, and pricing while walking the jobsite.',
          'Translates spoken phrases (e.g., "Add 30 feet of 4-inch PVC at $15 a foot and 2 hours of labor") into itemized quote lines.',
        ],
      },
      {
        id: 'voice-change-orders',
        name: 'Voice Change Orders & Checklists',
        desc: 'Dictate unforeseen issues on-site to draft an instant change order or add tasks to the crew checklist.',
        tags: ['AI Voice', 'Change Orders'],
        subBullets: [
          'Dictate unforeseen issues on-site to draft an instant change order or add tasks to the crew checklist.',
          'Logs crisp, 1–2 sentence feed notes for the office team to review.',
        ],
      },
    ],
  },
  {
    num: '06',
    slug: 'quotes-proposals',
    title: 'Quotes, Proposals & E-Signatures',
    icon: '📝',
    intro: 'Send branded interactive quotes, multi-tier options, and collect e-signatures from any phone.',
    features: [
      {
        id: 'itemized-quotes',
        name: 'Itemized Interactive Quotes',
        desc: 'Create detailed proposals with labor, materials, service packages, tax rates, and discounts.',
        tags: ['Quotes', 'Estimating'],
        subBullets: [
          'Create detailed proposals with services, materials, unit quantities, tax rates, and optional discounts.',
          'Reusable line-item presets from your trade price book for rapid, 60-second estimating.',
        ],
      },
      {
        id: 'good-better-best',
        name: 'Multi-Tier "Good / Better / Best" Proposals',
        desc: 'Present interactive package tiers and optional add-on upsells that homeowners can toggle on screen.',
        tags: ['Upselling', 'Proposals'],
        subBullets: [
          'Present interactive multi-option packages (e.g., Standard Repair vs. Full Replacement vs. Premium System).',
          'Interactive checkboxes let homeowners add optional upgrades (e.g., surge protectors, extended warranties).',
        ],
      },
      {
        id: 'esignatures',
        name: 'Legally-Binding E-Signatures',
        desc: 'Homeowners type or draw their legal signature with timestamped, locked audit records.',
        tags: ['E-Sign', 'Legal'],
        subBullets: [
          'Mobile-friendly signing screen where homeowners type or draw their legal signature.',
          'Locks signature timestamp, signer full name, IP address, and contract terms into an unalterable audit log.',
        ],
      },
      {
        id: 'deposit-gate',
        name: 'Mandatory Deposit Gate',
        desc: 'Enforce required deposits (fixed dollar or percentage) before a job can be scheduled or started.',
        tags: ['Payments', 'Scheduling'],
        subBullets: [
          'Enforce required deposits (e.g., 50% upfront or fixed $500) before a quote is officially booked or scheduled.',
          'Direct checkout flow prompts for payment immediately after signature is captured.',
        ],
      },
      {
        id: 'quote-followups',
        name: 'Automatic Quote Follow-ups',
        desc: 'Polite, automated SMS and email reminders sent to clients with unapproved quotes.',
        tags: ['Automation', 'SMS'],
        subBullets: [
          'Sends automated, polite SMS and email nudges to clients with open quotes after 24 and 72 hours.',
          'Automatically ceases follow-up sequences the moment the quote is approved or declined.',
        ],
      },
      {
        id: 'monthly-financing-display',
        name: 'Integrated Monthly Financing Options',
        desc: 'Display estimated monthly payment breakdowns next to full totals to close larger jobs.',
        tags: ['Financing', 'Closing'],
        subBullets: [
          'Displays estimated monthly payment breakdowns (e.g., "As low as $89/mo") next to large estimates.',
          'Helps homeowners comfortably approve high-ticket replacements and extensive remodels.',
        ],
      },
    ],
  },
  {
    num: '07',
    slug: 'payments-billing',
    title: 'Invoicing, Payments & Stripe Direct Billing',
    icon: '💳',
    intro: 'Collect card, ACH, and installment payments through Stripe directly into your business bank account.',
    features: [
      {
        id: 'stripe-connect-payments',
        name: 'Direct Stripe Merchant Processing',
        desc: 'Direct card and bank payouts into your checking account with decreasing platform fees on higher plans.',
        tags: ['Stripe', 'Payouts'],
        subBullets: [
          'Fast merchant onboarding via Stripe Connect; funds deposit directly into your business checking account.',
          'Platform fees scale down with volume (Flex tier starts at 1.25%, decreasing on higher plans).',
        ],
      },
      {
        id: 'deposits-progress-payments',
        name: 'Deposits, Progress & Milestone Draws',
        desc: 'Request partial deposits, 30/30/40 milestone draws, or final balances with 1-click links.',
        tags: ['Invoicing', 'Milestones'],
        subBullets: [
          'Request partial deposits, 30/30/40 milestone draws, or final balances with one click.',
          'Generates unique, secure payment links (/pay/[id]) with Apple Pay, Google Pay, credit/debit cards, and ACH.',
        ],
      },
      {
        id: 'installment-payment-plans',
        name: '0% Interest Installment Payment Plans',
        desc: 'Split quotes into automated recurring installments charged to the customer’s saved card.',
        tags: ['Financing', 'Installments'],
        subBullets: [
          'Split invoices into customizable monthly or bi-weekly installments charged automatically to the card on file.',
          'Full dashboard tracking of upcoming, settled, and overdue installment schedules.',
        ],
      },
      {
        id: 'ach-bank-transfer',
        name: 'ACH Bank Transfer (Low-Fee Processing)',
        desc: 'Auto-offered on payments of $1,000+ to eliminate credit card interchange fees on high-ticket jobs.',
        tags: ['ACH', 'Low Fee'],
        subBullets: [
          'Automatically offered on invoices of $1,000+ to avoid 3% card processing fees on major projects.',
          'Instant bank verification via Stripe Financial Connections.',
        ],
      },
      {
        id: 'card-on-file',
        name: 'Secure Card on File',
        desc: 'Tokenizes customer credit cards during deposit checkout for 1-click future billing and change orders.',
        tags: ['Security', 'Auto-Pay'],
        subBullets: [
          'Securely tokenizes client credit cards during deposit checkout for future balance settlements.',
          '1-click charging for approved change orders or recurring maintenance without re-requesting card details.',
        ],
      },
      {
        id: 'pdf-invoices',
        name: 'Itemized Invoices with PDF Generation',
        desc: 'Professional downloadable PDF invoices with sequential numbering, tax calculations, and receipts.',
        tags: ['PDF', 'Invoicing'],
        subBullets: [
          'Automatically creates professional, downloadable PDF invoices with your logo, license info, and line items.',
          'Sequential invoice numbering, tax calculation, discount tracking, and payment receipts.',
        ],
      },
      {
        id: 'customer-tipping',
        name: 'Customer Tipping',
        desc: 'Satisfied homeowners can add tips during checkout, with itemized rollups per crew member.',
        tags: ['Tips', 'Crew'],
        subBullets: [
          'Optional tip prompt on checkout screens allowing satisfied homeowners to tip the crew (10%, 15%, 20%, or custom).',
          'Itemized tipping reports help distribute tips directly to assigned crew members.',
        ],
      },
      {
        id: 'smart-dunning',
        name: 'Smart Dunning & Failed Payment Recovery',
        desc: 'Automatic retry logic for card declines and automated SMS links for customers to update expired cards.',
        tags: ['Dunning', 'Recovery'],
        subBullets: [
          'Automatic retry logic for soft card declines (insufficient funds, temporary holds).',
          'Sends an automated SMS with a secure link for the customer to update their card details when a card expires.',
        ],
      },
      {
        id: 'offline-payments',
        name: 'Offline Payment Reconciliation',
        desc: 'Log cash, check, or wire payments with instant invoice reconciliation and receipt generation.',
        tags: ['Accounting'],
        subBullets: [
          'Easily record cash, paper check, or bank wire payments to balance the invoice.',
          'Generates and emails a "Paid in Full" receipt PDF to the customer.',
        ],
      },
      {
        id: 'refunds-disputes',
        name: 'Refund Management & Dispute Tracking',
        desc: 'Issue full or partial refunds with automatic client notifications and integrated dispute alerts.',
        tags: ['Refunds', 'Stripe'],
        subBullets: [
          'Issue full or partial refunds directly from the dashboard with automatic ledger balancing.',
          'Integrated Stripe dispute webhooks alert you immediately if a chargeback is ever filed.',
        ],
      },
    ],
  },
  {
    num: '08',
    slug: 'scheduling-routing',
    title: 'Smart Scheduling, Routing & Capacity Planning',
    icon: '📅',
    intro: 'Visual calendar, day labor load capacity engine, client self-scheduling, and route optimization.',
    features: [
      {
        id: 'drag-drop-calendar',
        name: 'Interactive Drag-and-Drop Calendar',
        desc: 'Day, week, and month calendar views with multi-day job spans and visual status indicators.',
        tags: ['Calendar', 'Scheduling'],
        subBullets: [
          'Day, Week, and 12-Month timeline views showing scheduled jobs, estimate visits, and crew availability.',
          'Multi-day job spans automatically expand across consecutive calendar days.',
        ],
      },
      {
        id: 'day-capacity-planner',
        name: 'Day Capacity & Labor Load Engine',
        desc: 'Computes daily crew labor hours against capacity to prevent overbooking and schedule bottlenecks.',
        tags: ['Capacity', 'Planning'],
        subBullets: [
          'Tracks total estimated labor hours against your configurable daily capacity (e.g., 8 hrs/day/truck).',
          'Visual color-coded load indicators warn the office before a day is double-booked or overloaded.',
        ],
      },
      {
        id: 'self-scheduling-links',
        name: 'Client Self-Scheduling Links',
        desc: 'Text up to 3 arrival windows to the client; their selection reserves the slot on your calendar.',
        tags: ['SMS', 'Self-Serve'],
        subBullets: [
          'Send clients an SMS/email link with up to 3 available arrival windows (e.g., "Tuesday 8–10 AM, Wednesday 1–3 PM").',
          'Client clicks their preferred slot; calendar reserves the time and confirms automatically without phone tag.',
        ],
      },
      {
        id: 'online-booking-page',
        name: 'Public Online Booking Page',
        desc: 'Embed a self-service booking page on your website for instant appointment requests.',
        tags: ['Online Booking', 'Web'],
        subBullets: [
          'Embed a self-service booking page on your website for instant appointment requests.',
          'Respects buffer times, lead time rules, and blackout dates.',
        ],
      },
      {
        id: 'appointment-reminders',
        name: 'Multi-Channel Appointment Reminders',
        desc: 'Automated 24-hour and 2-hour SMS/email reminders with "Reply C to confirm" functionality.',
        tags: ['Reminders', 'SMS'],
        subBullets: [
          'Automated SMS and email reminders sent 24 hours and 2 hours prior to arrival.',
          'Homeowners reply "C" to confirm or click a link to request a reschedule.',
        ],
      },
      {
        id: 'route-density-optimization',
        name: 'Route Density & Travel Time Optimization',
        desc: 'Google Maps vector integration displaying scheduled stops and calculating travel times.',
        tags: ['Maps', 'Routing'],
        subBullets: [
          'Google Maps vector integration displaying color-coded pins for scheduled jobs across the region.',
          'Calculates drive times between stops to group nearby jobs and minimize fuel costs.',
        ],
      },
      {
        id: 'quick-stops-engine',
        name: 'Quick Stops (Route Fill-In Jobs)',
        desc: 'Flags micro-jobs located along your active daily route to fill schedule gaps and boost revenue.',
        tags: ['Route Fill', 'Revenue'],
        subBullets: [
          'Flags small, 15–30 minute jobs (gutter clear, outlet swap, filter change) located along your active daily route.',
          '1-tap dispatch to fill schedule gaps between major jobs and maximize daily billable hours.',
        ],
      },
    ],
  },
  {
    num: '09',
    slug: 'crew-field-app',
    title: 'Crew Management, Field App & Time Clock',
    icon: '👷',
    intro: 'Equip technicians with a dedicated mobile web app, GPS geofenced time clock, and job costing in the field.',
    features: [
      {
        id: 'mobile-field-app',
        name: 'Mobile Field App for Technicians',
        desc: 'Touch-friendly mobile interface for field crews to view job scopes, customer notes, and gate codes.',
        tags: ['Mobile', 'Crew'],
        subBullets: [
          'Fast, touch-friendly web app optimized for iOS and Android phones in the field.',
          'Technicians view assigned jobs, scopes of work, gate access codes, and customer notes.',
        ],
      },
      {
        id: 'geofenced-time-clock',
        name: 'GPS Geofenced Time Clock',
        desc: 'Crew clock-in and clock-out with geolocation verification to ensure staff are physically on site.',
        tags: ['GPS', 'Time Clock'],
        subBullets: [
          'Technicians clock in, start drive time, begin work, and clock out directly from the job screen.',
          'Geolocation verification flags if a clock-in occurred outside the designated jobsite perimeter.',
        ],
      },
      {
        id: 'crew-assignment-dispatch',
        name: 'Crew Job Assignment & SMS Dispatch',
        desc: 'Assign technicians to jobs with real-time schedule syncing and instant dispatch texts.',
        tags: ['Dispatch', 'SMS'],
        subBullets: [
          'Assign lead techs and helpers to specific jobs with real-time schedule syncing.',
          'Dispatches an automatic SMS alert to technicians when new work is added to their schedule.',
        ],
      },
      {
        id: 'field-photos-docs',
        name: 'On-Site Photo & Document Capture',
        desc: 'Field crew snaps and tags Before, In-Progress, and After photos directly to the job record.',
        tags: ['Photos', 'Field'],
        subBullets: [
          'Field crew snaps and tags "Before", "In-Progress", and "After" photos directly to the job record.',
          'Fast image compression ensures rapid uploads even in low-reception areas.',
        ],
      },
      {
        id: 'field-cost-logging',
        name: 'Material & Labor Cost Logging in the Field',
        desc: 'Crew members log used materials and on-site labor hours for live job profitability tracking.',
        tags: ['Job Costing', 'Materials'],
        subBullets: [
          'Crew members log materials taken from truck stock and actual on-site labor hours.',
          'Real-time sync ensures job profitability calculations reflect actual field costs.',
        ],
      },
      {
        id: 'crew-pay-rollups',
        name: 'Crew Pay & Labor Rollups',
        desc: 'Summaries of total hours worked, hourly rates, and labor costs per crew member across pay periods.',
        tags: ['Payroll', 'Reports'],
        subBullets: [
          'Tracks total hours worked, hourly pay rates, and overtime by technician across pay periods.',
          'Export clean timesheet summaries for payroll processing (Gusto, ADP, QuickBooks).',
        ],
      },
    ],
  },
  {
    num: '10',
    slug: 'morning-briefing',
    title: 'Automated Morning Crew Briefings & Dispatch',
    icon: '☀️',
    intro: 'Automated 7:00 AM dispatch SMS with 1-tap Google/Apple/Waze navigation and truck packing checklists.',
    features: [
      {
        id: '7am-dispatch-sms',
        name: 'Automated 7:00 AM Dispatch SMS',
        desc: 'Generates and dispatches a comprehensive morning schedule text to technicians at 7:00 AM daily.',
        tags: ['Automation', 'SMS', 'Dispatch'],
        subBullets: [
          'Generates and dispatches a comprehensive morning schedule text to technicians at 7:00 AM daily.',
          'Lists stop sequence, scheduled times, client names, and scope summaries.',
        ],
      },
      {
        id: '1tap-navigation-links',
        name: '1-Tap Navigation Links (Google, Apple, Waze)',
        desc: 'Direct destination links supporting Google Maps, Apple Maps, and Waze for turn-by-turn routing.',
        tags: ['Maps', 'Navigation'],
        subBullets: [
          'Formats individual destination links for each stop supporting Google Maps, Apple Maps, and Waze.',
          'Techs tap once to open turn-by-turn directions without manually copying and pasting addresses.',
        ],
      },
      {
        id: 'master-route-chaining',
        name: 'Full-Day Master Route Navigation',
        desc: 'Assembles a multi-stop master navigation URL routing technicians from shop to all stops in order.',
        tags: ['Routing', 'Maps'],
        subBullets: [
          'Assembles an optimized multi-stop master navigation URL (/dir/homebase/stop1/stop2/stop3).',
          'Routes the technician efficiently from their shop or home base through all daily appointments.',
        ],
      },
      {
        id: 'truck-packing-checklist',
        name: 'Truck Packing & Materials Checklist',
        desc: 'Aggregates material scopes across all scheduled jobs into a morning truck-loading list.',
        tags: ['Supplies', 'Checklist'],
        subBullets: [
          'Aggregates material scopes across all scheduled jobs into a morning truck-loading list.',
          'Prevents forgotten parts and unnecessary mid-day supply house runs.',
        ],
      },
      {
        id: 'weather-briefing-integration',
        name: 'Weather Briefing Integration',
        desc: 'Appends localized weather forecasts (temperature, precipitation, wind) to the morning dispatch.',
        tags: ['Weather', 'Planning'],
        subBullets: [
          'Appends localized weather forecasts (temperature, precipitation chances, wind) to the morning briefing.',
          'Helps crew dress appropriately and prepare weather protection for tools and materials.',
        ],
      },
      {
        id: 'shareable-runsheets',
        name: 'Printable / Shareable Text Run-Sheets',
        desc: 'Formats clean, multi-line run-sheets ready for 1-click copying to WhatsApp, iMessage, or printer.',
        tags: ['Run-Sheets', 'Print'],
        subBullets: [
          'Formats clean, multi-line text summaries formatted for 1-click sharing via WhatsApp, iMessage, or email.',
          'Printable layout for office dispatch boards.',
        ],
      },
    ],
  },
  {
    num: '11',
    slug: 'job-command-center',
    title: 'Job Command Center & Live Job Feed',
    icon: '🎯',
    intro: 'One connected record tracking scope, conversation, photos, milestones, and real-time profit margins.',
    features: [
      {
        id: 'job-activity-feed',
        name: 'Centralized Job Timeline (Job Feed)',
        desc: 'Unified chronological activity log tracking every quote sent, e-sign captured, payment, and photo added.',
        tags: ['Activity', 'Audit Log'],
        subBullets: [
          'Unified chronological activity log tracking every quote sent, e-sign captured, payment made, and photo added.',
          'Undo capabilities for accidental status changes, payment requests, and completions.',
        ],
      },
      {
        id: 'feed-visibility-controls',
        name: 'Granular Feed Visibility Controls',
        desc: 'Categorize updates into Internal (crew/office), Client Visible, or Client Financial.',
        tags: ['Privacy', 'Permissions'],
        subBullets: [
          'Categorize updates into Internal (crew/office only), Client Visible (shown on client portal), or Client Financial.',
          'Keeps internal notes, subcontractor rates, and private photos completely hidden from homeowners.',
        ],
      },
      {
        id: 'job-profit-margin-engine',
        name: 'Real-Time Job Profit & Margin Engine',
        desc: 'Live financial calculation of Revenue − (Labor + Materials + Subs + Receipts) = Net Profit.',
        tags: ['Profitability', 'Finance'],
        subBullets: [
          'Live financial formula: Total Quoted Revenue − (Labor + Materials + Subcontractors + Receipts) = Net Profit / Margin %.',
          'Visual profit badges highlight whether a job is running ahead or behind margin targets.',
        ],
      },
      {
        id: 'checklists-milestones',
        name: 'Task Checklists & Workflow Milestones',
        desc: 'Customizable milestone stages from New Lead through Completion with quality control checklists.',
        tags: ['Workflows', 'Checklists'],
        subBullets: [
          'Customizable milestone stages: New Lead → Quoted → Deposit Paid → In Progress → Complete → Invoiced → Paid.',
          'Mandatory task checklists ensure quality control before a job can be marked complete.',
        ],
      },
      {
        id: 'document-vault',
        name: 'Centralized Document Vault',
        desc: 'Stores PDF quotes, signed contracts, permits, inspection reports, and receipts in one place.',
        tags: ['Docs', 'Vault'],
        subBullets: [
          'Stores PDF quotes, signed contracts, building permits, inspection reports, material receipts, and photos in one place.',
        ],
      },
    ],
  },
  {
    num: '12',
    slug: 'client-hub-portal',
    title: 'Homeowner Client Hub & Real-Time Job Portal',
    icon: '🏠',
    intro: 'Passwordless tokenized portal where homeowners review quotes, watch progress, and make payments.',
    features: [
      {
        id: 'passwordless-portal',
        name: 'Secure, Passwordless Client Portal',
        desc: 'Tokenized public link (/client/jobs/[token]) allowing homeowners instant access without passwords.',
        tags: ['Client Hub', 'Security'],
        subBullets: [
          'Tokenized public link (/client/jobs/[token]) allowing homeowners instant access without passwords or app downloads.',
          'Revocable access links ensure total security and privacy.',
        ],
      },
      {
        id: 'live-progress-tracker',
        name: 'Live Job Progress Tracker',
        desc: 'Homeowners follow project milestones, view verified progress, and browse shared photos.',
        tags: ['Transparency', 'Photos'],
        subBullets: [
          'Homeowners follow project status, view verified milestone completions, and browse shared progress photos.',
          'Enhances transparency and dramatically reduces inbound "What’s the status?" phone calls.',
        ],
      },
      {
        id: 'all-in-one-doc-hub',
        name: 'All-in-One Document Hub',
        desc: 'Centralized dashboard where homeowners can view and download signed proposals, PDF invoices, and warranties.',
        tags: ['Docs', 'PDF'],
        subBullets: [
          'Centralized dashboard where homeowners can view and download signed proposals, PDF invoices, and warranties.',
        ],
      },
      {
        id: 'portal-payments',
        name: '1-Click Online Payments',
        desc: 'Integrated payment buttons allowing homeowners to settle balances or pay installments in seconds.',
        tags: ['Payments', 'Apple Pay'],
        subBullets: [
          'Integrated payment buttons allowing homeowners to settle balances or pay installments in seconds.',
        ],
      },
      {
        id: 'on-my-way-eta',
        name: 'Live "On-My-Way" Arrival Alerts',
        desc: 'Automated SMS sent when the crew departs for the job, providing an accurate, real-time arrival ETA.',
        tags: ['SMS', 'Live ETA'],
        subBullets: [
          'Automated SMS sent when the crew departs for the job, providing an accurate, real-time arrival ETA.',
        ],
      },
    ],
  },
  {
    num: '13',
    slug: 'change-orders-subcontractors',
    title: 'Change Orders, Warranties & Subcontractor Dispatch',
    icon: '📋',
    intro: 'Digital change orders with e-sign approvals, subcontractor work orders, and automated lien waivers.',
    features: [
      {
        id: 'digital-change-orders',
        name: 'Digital Change Order Generator',
        desc: 'Create change orders on-site when unforeseen issues arise, adjusting project balances automatically.',
        tags: ['Change Orders', 'Estimating'],
        subBullets: [
          'Create change orders on-site when unforeseen rotten decking, faulty wiring, or customer scope additions occur.',
          'Calculates price additions/credits and adjusts the total project balance automatically.',
        ],
      },
      {
        id: 'change-order-signatures',
        name: 'Client Change Order E-Signatures',
        desc: 'Homeowners receive an instant link to review explanations, photos, and price before signing.',
        tags: ['E-Sign', 'Compliance'],
        subBullets: [
          'Homeowners receive an instant SMS/email link to review the change order explanation, photos, and price.',
          'Requires digital signature before extra work begins, preventing end-of-job billing disputes.',
        ],
      },
      {
        id: 'subcontractor-dispatch',
        name: 'Subcontractor Dispatch & Work Orders',
        desc: 'Assign specialized trade phases to third-party subcontractors with dedicated work order scopes.',
        tags: ['Subcontractors', 'Dispatch'],
        subBullets: [
          'Assign specialized trade phases to third-party subcontractors with dedicated work order scopes and agreed rates.',
          'Tracks subcontractor costs against job profit margins.',
        ],
      },
      {
        id: 'lien-waiver-generator',
        name: 'Automated Lien Waiver Management',
        desc: 'Generates, tracks, and signs Conditional and Unconditional Lien Waivers for owners and subcontractors.',
        tags: ['Legal', 'Lien Waivers'],
        subBullets: [
          'Generates, tracks, and signs Conditional and Unconditional Lien Waivers for both homeowners and subcontractors.',
          'Protects general contractors and property owners against mechanics’ liens.',
        ],
      },
      {
        id: 'warranty-management',
        name: 'Warranty Certificate Management',
        desc: 'Configure warranty terms and automatically deliver branded PDF warranty certificates upon completion.',
        tags: ['Warranties', 'Certificates'],
        subBullets: [
          'Configure custom warranty terms (e.g., 10-Year Workmanship, 25-Year Manufacturer Shingle Guarantee).',
          'Automatically issues a personalized, PDF warranty certificate to the customer upon final invoice payment.',
        ],
      },
    ],
  },
  {
    num: '14',
    slug: 'permit-property-intel',
    title: 'Permit Intel, Property Data & Measurements',
    icon: '🏛️',
    intro: 'Building code intelligence across US/CA/MX, automated permit applications, and satellite roof measurements.',
    features: [
      {
        id: 'permit-requirement-engine',
        name: 'Municipal Code & Permit Requirement Engine',
        desc: 'Comprehensive database of building code requirements across all 50 US states, Canada, and Mexico.',
        tags: ['Permits', 'Building Code'],
        subBullets: [
          'Comprehensive database of building code requirements across all 50 US states, Canada, and Mexico.',
          'Evaluates project scope against local thresholds to inform you if a building, electrical, or plumbing permit is required.',
        ],
      },
      {
        id: 'permit-application-generator',
        name: 'Automated Permit Application Generator',
        desc: 'Pre-fills municipal permit paperwork with contractor license details, valuations, and property specs.',
        tags: ['Permits', 'PDF'],
        subBullets: [
          'Pre-fills municipal permit paperwork with contractor license details, project valuation, scopes, and owner info.',
          'Generates submission-ready PDF applications to streamline city hall or online portal submissions.',
        ],
      },
      {
        id: 'coi-generator',
        name: 'Certificate of Insurance (COI) Generator',
        desc: 'Generates project-specific COI requests and documents naming municipalities or owners as additional insured.',
        tags: ['Insurance', 'COI'],
        subBullets: [
          'Generates project-specific COI requests and documents naming the municipality or homeowner as additional insured.',
        ],
      },
      {
        id: 'inspection-tracker',
        name: 'Municipal Inspection Tracker',
        desc: 'Schedules and tracks rough-in, electrical, plumbing, and final municipal inspections.',
        tags: ['Inspections'],
        subBullets: [
          'Schedules and tracks rough-in, electrical, plumbing, and final municipal inspections.',
          'Logs inspector sign-offs and punch-list notes directly to the job feed.',
        ],
      },
      {
        id: 'roof-measurement-engine',
        name: 'Roof Measurement Engine & Solar Intel',
        desc: 'Google Solar API integration calculates roof square footage, pitch slope, and sunlight exposure.',
        tags: ['Google Solar', 'Measurements'],
        subBullets: [
          'Google Solar API integration calculates total roof area, pitch slope, facet azimuth, and sunlight exposure from satellite data.',
          'Generates estimated square counts to produce rough roofing and solar quotes in minutes.',
        ],
      },
      {
        id: 'property-records-rentcast',
        name: 'Property Records & Valuation Intel',
        desc: 'RentCast property data integration pulls square footage, year built, lot size, and parcel details.',
        tags: ['Property Data'],
        subBullets: [
          'RentCast property data integration pulls square footage, year built, lot size, bedroom/bath counts, and parcel IDs.',
          'Gives estimators valuable structural context before setting foot on the property.',
        ],
      },
    ],
  },
  {
    num: '15',
    slug: 'rebates-weather',
    title: 'Rebates & Weather-Driven Rescheduling',
    icon: '🌦️',
    intro: 'Clean energy rebate engine for heat pumps/solar and NWS weather tracking with 1-tap batch reschedule.',
    features: [
      {
        id: 'clean-energy-rebate-engine',
        name: 'Clean Energy & Utility Rebate Engine',
        desc: 'Database of federal IRA, state, and local utility rebates for heat pumps, solar, and panel upgrades.',
        tags: ['Rebates', 'Clean Energy'],
        subBullets: [
          'Database of federal IRA (Inflation Reduction Act), state, and local electric/gas utility rebates.',
          'Instant lookup for heat pump HVAC, heat pump water heaters, panel upgrades, insulation, and solar incentives.',
          'Helps you show homeowners how to save thousands on high-efficiency equipment upgrades.',
        ],
      },
      {
        id: 'nws-weather-intelligence',
        name: 'National Weather Service (NWS) Intelligence',
        desc: 'Monitored precipitation, wind gusts, and freezing temperature forecasts for active job locations.',
        tags: ['Weather', 'NWS'],
        subBullets: [
          'Monitored precipitation, wind gusts, and freezing temperature forecasts for all active job zip codes.',
          'Automatically flags outdoor jobs (roofing, painting, masonry, concrete) at risk of weather delays.',
        ],
      },
      {
        id: '1tap-weather-reschedule',
        name: '1-Tap Weather Reschedule Engine',
        desc: 'Batch-identifies outdoor jobs impacted by weather and sends automated reschedule links to homeowners.',
        tags: ['Weather', 'SMS', 'Reschedule'],
        subBullets: [
          'Batch-selects weather-impacted jobs and generates custom reschedule options.',
          'Sends automated SMS to all affected homeowners: "Due to tomorrow’s rain forecast, click here to choose a new dry date."',
        ],
      },
    ],
  },
  {
    num: '16',
    slug: 'sms-messaging',
    title: 'Two-Way SMS & Customer Messaging Inbox',
    icon: '💬',
    intro: 'Centralized customer messaging inbox, A2P 10DLC carrier compliance, quick replies, and thread search.',
    features: [
      {
        id: 'unified-sms-inbox',
        name: 'Unified Customer Messaging Inbox',
        desc: 'Two-way SMS conversation center connecting all inbound customer replies and outbound notifications.',
        tags: ['SMS', 'Inbox'],
        subBullets: [
          'Two-way SMS conversation center connecting all inbound customer replies and outbound notifications.',
          'Eliminates lost text messages on personal technician phones.',
        ],
      },
      {
        id: 'smart-thread-lookup',
        name: 'Smart Thread Identification',
        desc: 'Resolves unknown numbers by searching active client names, job street addresses, or town names.',
        tags: ['CRM', 'Search'],
        subBullets: [
          'Resolves unknown numbers by searching active client names, job street addresses, or town names.',
          'Displays client profile, active quotes, and balance due directly alongside the chat thread.',
        ],
      },
      {
        id: 'a2p-10dlc-compliance',
        name: 'A2P 10DLC Carrier Compliance',
        desc: 'Dedicated verified business numbers with automated opt-in, opt-out (STOP/START), and vetting.',
        tags: ['Compliance', 'Carrier'],
        subBullets: [
          'Built-in campaign registration, carrier vetting, and automatic STOP / START opt-out enforcement.',
          'High carrier delivery rates without spam filtering or blocked messages.',
        ],
      },
      {
        id: 'quick-starter-replies',
        name: 'Quick Starter Replies & Templates',
        desc: '1-tap pre-written responses for common scenarios: arrival updates, quote links, and receipts.',
        tags: ['Templates', 'Productivity'],
        subBullets: [
          '1-tap pre-written responses for common scenarios: arrival updates, quote links, receipt confirmations, and parking questions.',
          'Personalizes templates automatically with the client’s first name and project reference.',
        ],
      },
      {
        id: 'isolated-lanes',
        name: 'Isolated Dispatch & Marketing Lanes',
        desc: 'Separates internal crew dispatch traffic from customer-facing billing and promotional SMS streams.',
        tags: ['Security', 'Routing'],
        subBullets: [
          'Separates internal crew dispatch traffic from customer-facing billing and promotional SMS streams.',
        ],
      },
    ],
  },
  {
    num: '17',
    slug: 'marketing-campaigns',
    title: 'Automated Marketing, Campaigns & Seasonal Recalls',
    icon: '📣',
    intro: 'Re-engage past clients with targeted SMS/email blasts, AI campaign audits, and annual service recalls.',
    features: [
      {
        id: 'smart-segmentation',
        name: 'Smart Customer Segmentation',
        desc: 'Filter customer lists by All Contacts, Past Jobs, Repeat Clients, High-Spenders, or Lapsed Accounts.',
        tags: ['Audiences', 'Marketing'],
        subBullets: [
          'Filter customer lists by All Contacts, Past Jobs, Repeat Clients, High-Value Spenders, or Lapsed Customers.',
          'Live reach counter shows exact audience size before launching campaigns.',
        ],
      },
      {
        id: 'personalized-campaigns',
        name: 'Personalized SMS & Email Campaigns',
        desc: 'Broadcast seasonal promotions (Spring AC checkups, Fall roof tune-ups) with personalization tags.',
        tags: ['Campaigns', 'SMS'],
        subBullets: [
          'Broadcast seasonal promotions (e.g., "Spring AC Checkups", "Fall Roof Tune-ups", "Winterization Special").',
          'Automatically merges customer first names and past service history for higher response rates.',
        ],
      },
      {
        id: 'ai-campaign-guard',
        name: 'AI Campaign Guard',
        desc: 'Pre-send scanner audits marketing copy for spam keywords, opt-out disclosures, and carrier rules.',
        tags: ['AI', 'Compliance'],
        subBullets: [
          'Pre-send scanner audits marketing copy for spam keywords, opt-out disclosures, message segment length, and tone.',
          'Ensures compliance with carrier messaging guidelines.',
        ],
      },
      {
        id: 'automated-rebooking-reminders',
        name: 'Automated Rebooking Reminders',
        desc: 'Detects when past clients approach service anniversaries and sends 1-tap rebooking invites.',
        tags: ['Rebook', 'Retention'],
        subBullets: [
          'System detects when a past client is approaching their 6-month or 12-month service anniversary.',
          'Sends an automated SMS invite allowing the client to rebook with one tap.',
        ],
      },
      {
        id: 'daily-morning-digest',
        name: 'Daily Morning Digest',
        desc: 'Morning email briefing for the owner summarizing collections, today’s jobs, hot leads, and open quotes.',
        tags: ['Digest', 'Email'],
        subBullets: [
          'Daily email briefing delivered to the business owner summarizing yesterday’s collections, today’s schedule, new hot leads, and open quotes.',
        ],
      },
    ],
  },
  {
    num: '18',
    slug: 'recurring-plans',
    title: 'Recurring Service Agreements & Auto-Billing',
    icon: '🔁',
    intro: 'Set up repeating maintenance agreements that automatically schedule jobs and charge saved cards.',
    features: [
      {
        id: 'recurring-agreements',
        name: 'Recurring Service Agreements',
        desc: 'Configure repeating service plans (weekly, bi-weekly, monthly, quarterly, semi-annual, or annual).',
        tags: ['Recurring', 'Maintenance'],
        subBullets: [
          'Configure repeating service plans (weekly, bi-weekly, monthly, quarterly, semi-annual, or annual visits).',
          'Ideal for HVAC maintenance contracts, pool service, landscaping, commercial cleaning, and pest control.',
        ],
      },
      {
        id: 'auto-job-spawning',
        name: 'Automated Job Spawning',
        desc: 'Automatically places new jobs and dispatches work orders onto the calendar each billing cycle.',
        tags: ['Automation', 'Calendar'],
        subBullets: [
          'Automatically places new jobs and dispatches work orders onto the calendar when each billing cycle approaches.',
        ],
      },
      {
        id: 'hands-off-autobilling',
        name: 'Hands-Off Auto-Billing',
        desc: 'Automatically charges the customer’s saved card upon visit completion and emails a paid receipt.',
        tags: ['Payments', 'Auto-Pay'],
        subBullets: [
          'Automatically charges the customer’s saved credit card on file upon visit completion.',
          'Generates and emails a paid itemized invoice receipt automatically.',
        ],
      },
      {
        id: 'fixed-term-contracts',
        name: 'Fixed-Term Service Contracts',
        desc: 'Cap recurring agreements at a set number of visits (e.g., 12-month prepaid plans) with renewal alerts.',
        tags: ['Contracts'],
        subBullets: [
          'Cap recurring agreements at a set number of visits (e.g., 12-month prepaid plan) with automated renewal reminders.',
        ],
      },
    ],
  },
  {
    num: '19',
    slug: 'reviews-reputation',
    title: 'Reviews, Reputation & Testimonial Engine',
    icon: '⭐',
    intro: 'Automated post-job Google review requests, private feedback resolution, and website review showcasing.',
    features: [
      {
        id: 'auto-review-requests',
        name: 'Automated Post-Job Review Requests',
        desc: 'Automatically triggers an SMS and email review invite after a job is marked complete and paid.',
        tags: ['Reviews', 'Automation'],
        subBullets: [
          'Automatically triggers an SMS and email review invite 1 hour after a job is marked complete and paid.',
        ],
      },
      {
        id: 'google-review-routing',
        name: 'Google Review Direct Routing',
        desc: '1-tap direct link directing happy customers straight to your Google Business Profile review screen.',
        tags: ['Google Reviews', 'Local SEO'],
        subBullets: [
          'One-tap direct link opens your Google Business Profile review screen with 5 stars pre-selected.',
          'Dramatically increases review volume and boosts local Google Map pack rankings.',
        ],
      },
      {
        id: 'private-feedback-channel',
        name: 'Private Customer Feedback Channel',
        desc: 'Provides a private outlet for unhappy customers to resolve concerns directly with the owner.',
        tags: ['Feedback', 'Reputation'],
        subBullets: [
          'Disgruntled or unsatisfied clients are given a private feedback channel to communicate concerns directly to the owner.',
          'Resolves customer complaints privately before they turn into public 1-star negative reviews.',
        ],
      },
      {
        id: 'google-review-import',
        name: 'Google Review Website Import & Sync',
        desc: 'Pulls existing 5-star Google reviews directly onto your website with Schema.org AggregateRating markup.',
        tags: ['Social Proof', 'SEO'],
        subBullets: [
          'Pulls your real 5-star Google reviews directly onto your hosted website with verified Google badges.',
          'Schema.org AggregateRating markup helps display rich star snippets on Google search results.',
        ],
      },
      {
        id: 'reputation-dashboard',
        name: 'Reputation Analytics Dashboard',
        desc: 'Tracks total review invites sent, response rates, average star ratings, and review velocity.',
        tags: ['Analytics', 'Reputation'],
        subBullets: [
          'Tracks total invitations sent, conversion rate, average star rating, and review velocity trends over time.',
        ],
      },
    ],
  },
  {
    num: '20',
    slug: 'inventory-price-book',
    title: 'Inventory, Price Book & Receipt Expense OCR',
    icon: '📦',
    intro: 'Standard trade price books, stock level tracking, and AI camera OCR scanning for paper receipts.',
    features: [
      {
        id: 'trade-price-book',
        name: 'Trade Price Book & Service Catalog',
        desc: 'Pre-built and customizable library of services, standard labor rates, and material costs for fast quoting.',
        tags: ['Price Book', 'Estimating'],
        subBullets: [
          'Pre-built and customizable library of services, standard labor rates, and material costs.',
          'Speeds up estimating by allowing 1-click addition of standard packages to quotes.',
        ],
      },
      {
        id: 'stock-inventory-tracking',
        name: 'Stock & Inventory Tracking',
        desc: 'Track material quantities, warehouse and truck stock levels, unit costs, and reorder thresholds.',
        tags: ['Inventory', 'Supplies'],
        subBullets: [
          'Track material quantities, truck stock levels, warehouse inventory, and unit costs.',
          'Low-stock warnings alert you when essential supplies fall below minimum thresholds.',
        ],
      },
      {
        id: 'receipt-photo-ocr',
        name: 'Receipt Photo OCR & Expense Scanner',
        desc: 'Snap a photo of supply house receipts; AI extracts vendor names, totals, and line items into job costing.',
        tags: ['AI Vision', 'Receipts', 'Expenses'],
        subBullets: [
          'Snap a photo of physical supply house paper receipts with your phone camera.',
          'AI OCR extracts vendor name, purchase date, line items, and total amount, auto-attaching expenses to the job ledger.',
        ],
      },
    ],
  },
  {
    num: '21',
    slug: 'cash-flow-insights',
    title: 'Cash Flow Forecasting, Reporting & Accounting',
    icon: '📈',
    intro: 'Predictive 30/60/90-day cash outlook, job conversion analytics, and QuickBooks-ready CSV exports.',
    features: [
      {
        id: 'cash-flow-forecaster',
        name: 'Interactive Cash Flow Forecaster',
        desc: 'Predictive cash outlook factoring in expected receivables, scheduled job values, contracts, and payroll.',
        tags: ['Cash Flow', 'Forecasting'],
        subBullets: [
          '30-, 60-, and 90-day predictive cash outlook factoring in expected receivables, scheduled job values, recurring contracts, and payroll.',
          'Visual runway graphs help plan upcoming equipment purchases, crew hiring, and tax reserves.',
        ],
      },
      {
        id: 'business-insights-analytics',
        name: 'Business Insights Dashboard',
        desc: 'Visual analytics tracking lead conversion rates, win rates, average job size, gross revenue, and margins.',
        tags: ['Analytics', 'KPIs'],
        subBullets: [
          'Real-time metrics on Lead Conversion Rate, Average Job Size, Win/Loss Ratios, and Revenue per Crew Member.',
          'Compares performance against previous months and quarters to identify growth opportunities.',
        ],
      },
      {
        id: 'quickbooks-export-sync',
        name: 'QuickBooks Online Export & Sync',
        desc: 'Import-ready CSVs and two-way sync for sales, customer profiles, invoices, and expense transactions.',
        tags: ['QuickBooks', 'Accounting'],
        subBullets: [
          'One-click export of sales, customer records, paid invoices, and categorized expenses in QuickBooks-ready CSV formats.',
          'Direct synchronization for streamlined bookkeeping.',
        ],
      },
      {
        id: 'tax-ready-pl-reports',
        name: 'Tax-Ready P&L Reports',
        desc: 'Cash-basis Profit & Loss statements categorized by IRS expense schedules for your accountant.',
        tags: ['Tax', 'Accounting'],
        subBullets: [
          'Generates clean Cash-Basis Profit & Loss statements grouped by standard IRS expense categories.',
          'Eliminates hours of tax-season paperwork for your CPA or accountant.',
        ],
      },
    ],
  },
  {
    num: '22',
    slug: 'team-roles-security',
    title: 'Team Roles, Multi-Seat Access & Security',
    icon: '🔒',
    intro: 'Role-based access control, granular office staff permissions, PostgreSQL RLS data isolation, and magic codes.',
    features: [
      {
        id: 'role-based-access-control',
        name: 'Role-Based Access Control (RBAC)',
        desc: 'Pre-configured roles for Owner, Office Dispatcher, Field Crew Member, and Subcontractor.',
        tags: ['Permissions', 'Security'],
        subBullets: [
          'Pre-configured roles: Owner, Office Dispatcher / Admin, Crew Member / Field Tech, and Subcontractor.',
          'Restricts crew and office members from viewing bank accounts, owner payouts, platform billing, or tax reports.',
        ],
      },
      {
        id: 'office-team-invitations',
        name: 'Office Team Invitations',
        desc: 'Invite office staff via email with granular capability toggles (edit schedule, restrict financial view).',
        tags: ['Team', 'Invites'],
        subBullets: [
          'Invite office staff via email with granular capability toggles (e.g., can edit schedule, cannot issue refunds).',
        ],
      },
      {
        id: 'row-level-security-multi-tenancy',
        name: 'Row-Level Security (RLS) & Multi-Tenancy',
        desc: 'Enterprise-grade PostgreSQL Row-Level Security ensuring full data isolation between accounts.',
        tags: ['PostgreSQL', 'Security'],
        subBullets: [
          'Enterprise-grade PostgreSQL Row-Level Security ensuring full data isolation between contractor accounts.',
          'High-speed Supabase data architecture backed by real-time sync.',
        ],
      },
      {
        id: 'passwordless-auth',
        name: 'Secure Passwordless Authentication',
        desc: 'One-time SMS and email magic codes for fast login on mobile and desktop without passwords.',
        tags: ['Auth', 'Security'],
        subBullets: [
          'Secure, one-time SMS and email magic codes for fast login on mobile and desktop without passwords to manage or lose.',
        ],
      },
    ],
  },
  {
    num: '23',
    slug: 'ai-advertising-neighborhood-halo',
    title: 'AI Advertising Autopilot, Neighborhood Halo & Satellite Sizing',
    icon: '📍',
    intro: 'Automated 1-mile geofenced micro-campaigns, instant aerial satellite property sizing, street cluster pricing, and closed-loop Meta & Google conversion sync.',
    features: [
      {
        id: 'neighborhood-halo-ads',
        name: 'Neighborhood Halo 1-Mile Geofenced Micro-Ads',
        desc: 'Automatically launches 1-mile hyper-local ad campaigns around completed job sites using site photos and privacy-sanitized street copy.',
        tags: ['AI Advertising', 'Geofencing', 'Lead Gen'],
        subBullets: [
          'Automatic geofence calculation targeting homeowners within a tight 1.0-mile radius of recently completed projects.',
          'Strips exact house numbers to protect customer privacy while maintaining powerful street recognition (e.g., "Just completed on Maple Ave").',
          'Allocates an automated $25 / 5-day micro-budget capped at $250/mo with daily pacing and 72-hour auto-kill protection.',
        ],
      },
      {
        id: 'satellite-property-sizing',
        name: 'Instant Satellite Property Sizing Engine',
        desc: 'Calculates true roof squares, pitch multipliers, siding wall area, gutter linear footage, and HVAC tonnage directly from aerial footprint data.',
        tags: ['Satellite', 'AI Estimating', 'Computer Vision'],
        subBullets: [
          'Calculates roof pitch multipliers (flat to 10/12) and true roof surface area in squares (100 sq ft) with standard overhang and waste factors.',
          'Estimates perimeter linear footage for seamless gutters and net wall area for siding replacement.',
          'Provides instant low-to-high price brackets for homeowners before booking.',
        ],
      },
      {
        id: 'neighbor-cluster-discount-engine',
        name: 'Street Cluster Group Pricing & Viral Link Generator',
        desc: 'Unlocks tiered group discounts when neighbors on the same street book estimates, coordinating same-day batching for estimators.',
        tags: ['Group Discounts', 'Viral Growth', 'Route Density'],
        subBullets: [
          'Tiered street discounts: $100 off (2 homes), $250 off (3+ homes), and $500 off (5+ homes / HOA rate).',
          'Generates custom viral share links with pre-drafted copy for homeowners to post in their neighborhood SMS threads or HOA Facebook groups.',
          'Coordinates same-day appointment batching windows, allowing estimators to visit 3–5 homes in a single afternoon.',
        ],
      },
      {
        id: 'halo-speed-to-lead-sms',
        name: 'Halo-Aware Speed-to-Lead SMS with TCPA Quiet Hours',
        desc: 'Dispatches personalized sub-60-second text messages referencing the neighbor\'s street, with 9 PM–8 AM quiet hours protection.',
        tags: ['SMS', 'Speed-to-Lead', 'TCPA Compliance'],
        subBullets: [
          'Sub-60s automated SMS response referencing the specific street and active cluster discounts.',
          'Built-in TCPA quiet hours protection queues overnight inquiries for compliant 8:01 AM local time morning dispatch.',
          '15-minute idempotency lock prevents duplicate text blasts if a homeowner submits multiple forms.',
        ],
      },
      {
        id: 'closed-loop-conversion-sync',
        name: 'Closed-Loop Conversion Revenue Sync (Meta CAPI & Google)',
        desc: 'Syncs verified signed quote values and Stripe invoice revenue back to Google Ads and Meta Conversions API for AI Smart Bidding.',
        tags: ['Meta CAPI', 'Google Ads', 'ROAS Optimization'],
        subBullets: [
          'SHA-256 hashes customer emails and E.164-normalized phone numbers for high-match-rate audience optimization.',
          'Uploads offline click conversions (gclid) and Meta Purchase events with order IDs for zero-leakage deduplication.',
          'Calculates verified ROAS and CAC from real Stripe settlement data instead of estimated clicks.',
        ],
      },
      {
        id: 'storm-damage-halo-surge',
        name: 'Dynamic Storm Damage Halo Mode',
        desc: 'Automatically upgrades active halos to emergency restoration and insurance inspection angles during severe hail and storm events.',
        tags: ['Weather Surge', 'Storm Damage', 'Insurance Claims'],
        subBullets: [
          'Detects severe weather events (hail, 50+ mph winds, freeze alerts) and boosts halo budgets by +25%–35%.',
          'Automatically updates ad copy and headlines to free drone storm damage inspection and insurance claim assistance angles.',
        ],
      },
    ],
  },
];

export const TOTAL_CATALOG_FEATURE_COUNT = ALL_FEATURES_CATALOG.reduce(
  (sum, cat) => sum + cat.features.length,
  0
);
