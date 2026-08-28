'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './website-capability-matrix.module.css';

interface MatrixFeature {
  id: string;
  category: string;
  name: string;
  icon: string;
  desc: string;
  tags: string[];
  subBullets: string[];
}

interface MatrixCategory {
  id: string;
  label: string;
  icon: string;
}

const CATEGORIES: MatrixCategory[] = [
  { id: 'all', label: 'All Capabilities', icon: '✨' },
  { id: 'design', label: 'Themes & Design', icon: '🎨' },
  { id: 'video', label: 'Video & Media', icon: '🎬' },
  { id: 'intake', label: 'AI Intake & Forms', icon: '⚡' },
  { id: 'seo', label: 'Local SEO & Reviews', icon: '📍' },
  { id: 'hosting', label: 'Domains & Hosting', icon: '🌐' },
  { id: 'conversion', label: 'Conversion & Suite', icon: '🔄' },
];

const MATRIX_FEATURES: MatrixFeature[] = [
  // Pillar 1: Themes & Design
  {
    id: 'trade-themes',
    category: 'design',
    name: '8 Trade-Matched Design Archetypes',
    icon: '🏛️',
    desc: 'Bespoke design themes crafted for contractors with specialized typography, hero treatments, and motion.',
    tags: ['Design', 'Themes'],
    subBullets: [
      'Tailored themes: Forge, Guild, Vista, Haven, Foundry, Tinker, Blueprint, Lustre.',
      'Archetypes include Full-Bleed Video Hero, Split-Screen, High-Contrast Industrial, and Clean Architectural.',
      'Google Font pairings specifically selected for blue-collar trade branding and crystal-clear readability.',
    ],
  },
  {
    id: 'color-schemes',
    category: 'design',
    name: '10+ Accessible Color Schemes',
    icon: '🎨',
    desc: 'Curated dark and light color systems paired with custom accent color selection across the entire website.',
    tags: ['Colors', 'Branding'],
    subBullets: [
      'Palettes: Midnight, Porcelain, Harbor, Evergreen, Steel, Sandstone, Copper, Concrete, Snow, Tuxedo, and Blueprint.',
      'Compliant WCAG contrast ratios ensure all text and call-to-action buttons are easily readable in direct sunlight.',
      'Single-click switch repaints headers, hero cards, service borders, and intake buttons harmoniously.',
    ],
  },
  {
    id: 'header-styles',
    category: 'design',
    name: '7 Navigation & Header Architectures',
    icon: '🧭',
    desc: 'Modular navigation headers tailored to your business profile, service density, and contact preference.',
    tags: ['Navigation', 'Layout'],
    subBullets: [
      'Styles: Refined Baseline, Floating Glass Bar, Editorial Uppercase, Utility Bar, Centered Stack, Segmented Chips, and CTA Edge Block.',
      'Sticky mobile call bar and customizable hamburger menu treatments (Bars, Thin, Pill, Dots, Labeled).',
      'Optional phone number, operating hours, license badge, and instant quote button in header.',
    ],
  },
  {
    id: 'brand-identity-tools',
    category: 'design',
    name: 'Vector Brand Marks & Wordmark Styling',
    icon: '✒️',
    desc: 'Automated trade monogram logo generator plus 10 distinct typographic wordmark treatments.',
    tags: ['Logo', 'Identity'],
    subBullets: [
      'Generates vector tool-marks or monogram icons if your business does not have an existing logo.',
      '10 wordmark treatments: All-Caps Wide, Initial Accent, Boxed, Brackets, Pill, Stamp, and Raised Plate.',
      'Coordinated across website headers, mobile app icons, browser favicons, and downloadable print assets.',
    ],
  },
  {
    id: 'modular-sections',
    category: 'design',
    name: 'Toggleable & Reorderable Page Sections',
    icon: '🧱',
    desc: 'Enable, disable, and rearrange core sections to spotlight seasonal promotions, reviews, or core specialties.',
    tags: ['Sections', 'Modular'],
    subBullets: [
      '8 core section types: Services Grid, How It Works, Before/After Sliders, Project Galleries, Key Metrics, FAQs, Testimonials, and Service Area Maps.',
      'Edit words, upload photos, or reorder the flow at any time before and after publishing.',
      'Curated trade stock photography automatically placed until real job site photos are uploaded.',
    ],
  },

  // Pillar 2: Video & Media
  {
    id: 'video-studio-layouts',
    category: 'video',
    name: '6 Dedicated Video Section Layouts',
    icon: '🎬',
    desc: 'Showcase real craftsmanship, project stories, and crew introductions across six purpose-built arrangements.',
    tags: ['Video', 'Craftsmanship'],
    subBullets: [
      'Six dedicated video layouts: Hero Loop, Split Video + Copy, Project Story, Reel Showcase, Video Testimonial, and Step-by-Step Process.',
      'Embed up to 4 video bands per page with full control over autoplay, looping, sound, and darkening overlays.',
      'Switching layouts preserves your uploaded clips and written descriptions automatically.',
    ],
  },
  {
    id: 'native-video-uploads',
    category: 'video',
    name: 'Native File Uploads & YouTube Embeds',
    icon: '📹',
    desc: 'Upload MP4, MOV, and WebM files directly from your phone (up to 50 MB) or link public YouTube videos.',
    tags: ['Uploads', 'Media'],
    subBullets: [
      'Upload jobsite footage directly from iPhone or Android in the field.',
      'Automatic video poster frame extraction ensures fast rendering before playback begins.',
      'Dedicated standalone /videos gallery page with rich search engine schema automatically generated.',
    ],
  },
  {
    id: 'video-auditing-checks',
    category: 'video',
    name: 'Built-in Codec & Mobile Data Checks',
    icon: '🛡️',
    desc: 'Pre-upload checks advise when clips are oversized or use incompatible codecs before going live.',
    tags: ['Performance', 'Quality'],
    subBullets: [
      'Advises when video loops exceed 12 MB to prevent heavy cellular data costs for homeowners.',
      'Warns if Apple HEVC codecs need standard web formatting and provides 1-tap conversion steps.',
      'Automatic mobile data saver delivers crisp still frames with play buttons on cellular connections.',
    ],
  },
  {
    id: 'before-after-sliders',
    category: 'video',
    name: 'Interactive Before & After Sliders',
    icon: '📸',
    desc: 'Draggable comparison sliders allowing homeowners to slide between pre-existing damage and completed work.',
    tags: ['Proof', 'Galleries'],
    subBullets: [
      'Interactive touch, mouse, and keyboard arrow controls for seamless reveal.',
      '3 project showcase styles: Slideshow Crossfade, Coverflow 3D Carousel, and Spotlight Thumbnail Strip.',
      'Highlight repairs, remodels, restorations, and installations with side-by-side proof.',
    ],
  },

  // Pillar 3: AI Intake & Quote Forms
  {
    id: 'ai-smart-intake',
    category: 'intake',
    name: '24/7 AI Smart Intake Estimator',
    icon: '⚡',
    desc: 'Conversational estimating widget that asks trade questions, accepts job photos, and returns ballpark ranges.',
    tags: ['AI Intake', 'Estimates'],
    subBullets: [
      'Embedded directly onto your homepage and service landing pages.',
      'Asks trade-tailored questions based on project scope, square footage, materials, and urgency.',
      'Gives visitors an instant ballpark range while interest is peak, then packages the lead for your review.',
    ],
  },
  {
    id: 'quote-form-styling',
    category: 'intake',
    name: '4 Quote Card Design Styles & Radii',
    icon: '🎛️',
    desc: 'Customize the aesthetic of your instant estimate card with modern glassmorphism, glows, and custom fields.',
    tags: ['Customization', 'Forms'],
    subBullets: [
      '4 visual styles: Clean & Crisp, Bold Accent, Frosted Glass, and Electric Glow.',
      'Field background modes: Crisp White (high contrast), Dark/Subtle Tint, or Theme Default.',
      '4 corner radius presets (Sharp 4px to Ultra Pill 26px) and 4 progress steppers (Badges, Bar, Dots, Hidden).',
    ],
  },
  {
    id: 'trust-badges-cues',
    category: 'intake',
    name: '13 Floating Hero Badges & Trust Cues',
    icon: '🛡️',
    desc: 'Reassure homeowners right at the point of inquiry with verified credentials and response speed badges.',
    tags: ['Trust', 'Conversion'],
    subBullets: [
      '13 badge presets: Free Estimates, Licensed & Insured, 24/7 Emergency, $2M Liability, Financing Available, etc.',
      '7 badge finishes: Gold Trust Foil, Aurora Iridescent Glass, Dark Glass, Light Glass, Theme Accent.',
      'On-card trust cues: 100% Private, Fast Reply, No Obligation, Licensed & Insured, No Hidden Fees.',
    ],
  },
  {
    id: 'service-area-gatekeeper',
    category: 'intake',
    name: 'Service Territory Gatekeeper & Triage',
    icon: '🗺️',
    desc: 'Validates homeowner addresses against your exact service territory and auto-scores incoming leads.',
    tags: ['Lead Triage', 'Routing'],
    subBullets: [
      'Google Places address autocomplete validates street addresses and travel radius.',
      'Out-of-territory inquiries are flagged to protect crew drive time.',
      'Instant Hot/Warm/Low lead scoring with high-dollar SMS alerts sent straight to your phone.',
    ],
  },

  // Pillar 4: Local SEO & Reviews
  {
    id: 'google-reviews-sync',
    category: 'seo',
    name: 'Google Places API Sync & Reviews',
    icon: '⭐',
    desc: 'Direct integration with Google Business Profile pulling verified star ratings and customer reviews.',
    tags: ['Google', 'Reviews'],
    subBullets: [
      'Direct Google Places API connection imports your latest verified 5-star reviews with author attribution.',
      'Display styles: Responsive Review Grid, Auto-Sliding Carousel, or Spotlight Single Review.',
      'Honest reputation compliance: supports public Google reviews and private feedback without gating.',
    ],
  },
  {
    id: 'schema-org-jsonld',
    category: 'seo',
    name: 'Automated Local SEO & Rich Structured Data',
    icon: '🔍',
    desc: 'Pre-configured JSON-LD Schema.org markup designed to help you dominate local "near me" searches.',
    tags: ['SEO', 'Structured Data'],
    subBullets: [
      'Dynamic Schema.org rich snippets for LocalBusiness, Service, AggregateRating, BreadcrumbList, and VideoObject.',
      'Automated meta titles, meta descriptions, OpenGraph social cards, and canonical tags generated for every page.',
      'Sub-second load times engineered for high Google Core Web Vitals scores.',
    ],
  },
  {
    id: 'local-service-pages',
    category: 'seo',
    name: 'Town-by-Town Local Landing Pages',
    icon: '📍',
    desc: 'Dedicated local landing pages generated automatically for every municipality in your service territory.',
    tags: ['Local SEO', 'Landing Pages'],
    subBullets: [
      'Generates localized service pages tailored to each town and city you operate in.',
      'Captures high-intent homeowners searching for "[Trade] near me" or "[Trade] in [City]".',
      'Pairs with service area maps and verified local project descriptions.',
    ],
  },
  {
    id: 'ai-blog-generator',
    category: 'seo',
    name: 'AI Blog Engine & Content Freshness',
    icon: '📝',
    desc: 'On-brand SEO articles drafted automatically for your approval with scheduled publishing.',
    tags: ['AI Content', 'SEO'],
    subBullets: [
      'Generates trade-specific articles referencing your exact services, cities served, and seasonal homeowner tips.',
      'Automated 2, 4, or 8-week content freshness reminders to keep your Google rankings climbing.',
      'Full markdown editor to review, customize, or insert job photos before publishing.',
    ],
  },

  // Pillar 5: Domains & Hosting
  {
    id: 'custom-domains-ssl',
    category: 'hosting',
    name: 'Custom Domain & Free Subdomain',
    icon: '🌐',
    desc: 'Publish on your custom domain (yourcompany.com) or a free included yourcompany.letsgetquoted.com subdomain.',
    tags: ['Domains', 'SSL'],
    subBullets: [
      'Your domain stays 100% yours—you own your registrar and build permanent brand equity.',
      'Live DNS CNAME verification (domains.letsgetquoted.com) and zero-config SSL certificate provisioning.',
      'Publish and unpublish toggle allows you to take your site live or make draft changes safely.',
    ],
  },
  {
    id: 'legal-pages',
    category: 'hosting',
    name: 'Auto-Generated Legal & Compliance Pages',
    icon: '⚖️',
    desc: 'Compliant Privacy Policy and Terms of Service customized automatically to your registered business entity.',
    tags: ['Compliance', 'Legal'],
    subBullets: [
      'Pre-built, editable Privacy Policy and Terms of Service linked in every website footer.',
      'Incorporates your business entity name, state jurisdiction, and contact email automatically.',
      'Complies with consumer data protection standards and carrier SMS messaging guidelines.',
    ],
  },
  {
    id: 'hide-number-mode',
    category: 'hosting',
    name: 'Hide-Your-Number Contractor Privacy',
    icon: '🔒',
    desc: 'Shield your personal cell phone from web scrapers and telemarketers while maintaining direct texting.',
    tags: ['Privacy', 'Security'],
    subBullets: [
      'Option to hide personal mobile numbers from public scrapers and robocallers.',
      'Routes customer inquiries through secure AI intake while allowing direct outbound texting from your business line.',
      'Honeypot fields and rate-limiting shield your inbox from spam bots.',
    ],
  },

  // Pillar 6: Visitor Conversion & Full Suite
  {
    id: 'floating-chat-button',
    category: 'conversion',
    name: '1-Tap Direct SMS & WhatsApp Chat',
    icon: '💬',
    desc: 'Floating quick-action message button opening the homeowner’s native texting app directly with your team.',
    tags: ['Messaging', 'Speed to Lead'],
    subBullets: [
      'Homeowners tap once to launch an SMS or WhatsApp conversation without filling out long forms.',
      'Configurable custom greeting and channel selection (SMS or WhatsApp).',
      'All incoming homeowner texts flow directly into your centralized back-office two-way SMS inbox.',
    ],
  },
  {
    id: 'online-booking-page',
    category: 'conversion',
    name: 'Public Online Booking & Self-Scheduling',
    icon: '📅',
    desc: 'Embed a self-service booking page on your website for homeowners to reserve arrival windows.',
    tags: ['Booking', 'Calendar'],
    subBullets: [
      'Allows clients to request or reserve open arrival windows directly from your website.',
      'Respects your live calendar availability, crew buffers, and service area rules.',
      'Automated SMS appointment confirmations and 24-hour reminder texts sent automatically.',
    ],
  },
  {
    id: 'client-portal-integration',
    category: 'conversion',
    name: 'Client Portal Link in Header & Footer',
    icon: '🔑',
    desc: 'Provide past and active clients with direct access to their quotes, job timeline, photos, and invoices.',
    tags: ['Portal', 'Client Experience'],
    subBullets: [
      'Seamless "Client Login" button in your website navigation header and footer.',
      'Homeowners access all their approved quotes, signed agreements, scheduled dates, and payment history.',
      'Zero password friction: secure one-time magic link authentication via email or phone.',
    ],
  },
  {
    id: 'connected-suite-flow',
    category: 'conversion',
    name: 'Full Back-Office Integration (No Retyping)',
    icon: '🚀',
    desc: 'Every website inquiry immediately creates an actionable job record connected to quoting, scheduling, and Stripe.',
    tags: ['Workflow', 'Automation'],
    subBullets: [
      'Job description, intake answers, photos, and estimate ranges arrive together ready to quote.',
      'Send interactive itemized quotes with e-signatures, progress deposits, and card-on-file billing.',
      'Convert approved quotes directly to calendar dispatch, morning crew texts, and review requests.',
    ],
  },
];

export default function WebsiteCapabilityMatrix() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredFeatures =
    selectedCategory === 'all'
      ? MATRIX_FEATURES
      : MATRIX_FEATURES.filter((f) => f.category === selectedCategory);

  return (
    <div className={styles.matrixContainer}>
      {/* Header */}
      <div className={styles.matrixHeader}>
        <span className={styles.badge}>🌐 Complete Website System</span>
        <h3 className={styles.matrixTitle}>
          Everything your trade website needs to win and run the work.
        </h3>
        <p className={styles.matrixSubtitle}>
          Other builders give you an empty template and leave you to figure out copywriting, SEO, forms, and video.
          Let’s Get Quoted gives you a complete, high-converting contractor website connected directly to your back office.
        </p>
      </div>

      {/* Category Filter Tabs */}
      <div className={styles.categoryTabs} role="tablist" aria-label="Filter feature capabilities by category">
        {CATEGORIES.map((cat) => {
          const count =
            cat.id === 'all'
              ? MATRIX_FEATURES.length
              : MATRIX_FEATURES.filter((f) => f.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`${styles.categoryTab} ${selectedCategory === cat.id ? styles.categoryTabActive : ''}`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className={styles.countChip}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Feature Cards Grid */}
      <div className={styles.featureGrid}>
        {filteredFeatures.map((feat) => (
          <div key={feat.id} className={styles.featureCard}>
            <div className={styles.cardHead}>
              <div className={styles.cardTopRow}>
                <span className={styles.cardIcon}>{feat.icon}</span>
                <div className={styles.tagGroup}>
                  {feat.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <h4 className={styles.cardTitle}>{feat.name}</h4>
              <p className={styles.cardDesc}>{feat.desc}</p>
            </div>

            <ul className={styles.bulletList}>
              {feat.subBullets.map((bullet, idx) => (
                <li key={idx} className={styles.bulletItem}>
                  <span className={styles.bulletCheck}>✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer Banner */}
      <div className={styles.matrixFooter}>
        <p className={styles.footerText}>
          All website builder capabilities are included on the <strong>$0/month Flex base plan</strong> with no monthly subscription required.
        </p>
        <Link href="/pricing" className={styles.footerLink}>
          View full plan details &amp; pricing &rarr;
        </Link>
      </div>
    </div>
  );
}
