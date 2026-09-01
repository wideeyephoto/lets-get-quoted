'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './hero-job-simulator.module.css';

export type TradeId = 'electrical' | 'plumbing' | 'hvac' | 'roofing' | 'remodeling';

export type StageData = {
  number: string;
  label: string;
  navKey: string;
  statusBadge: string;
  statusTone: 'hot' | 'approved' | 'scheduled' | 'work' | 'paid';
  title: string;
  amountMain: string;
  amountSub: string;
  facts: [
    { label: string; value: string },
    { label: string; value: string },
    { label: string; value: string },
  ];
  copilotText: string;
  smsPreview: {
    label: string;
    to: string;
    body: string;
    highlight?: string;
  };
  footerStatus: string;
  actionHref: string;
  actionText: string;
};

export type TradePreset = {
  id: TradeId;
  label: string;
  icon: string;
  sampleId: string;
  customerName: string;
  location: string;
  tradeKicker: string;
  stages: StageData[];
};

export const TRADE_PRESETS: Record<TradeId, TradePreset> = {
  electrical: {
    id: 'electrical',
    label: 'Electrical',
    icon: '⚡',
    sampleId: 'SAMPLE #2081',
    customerName: 'Taylor Vance',
    location: 'Royal Oak, MI',
    tradeKicker: 'ELECTRICAL SERVICES',
    stages: [
      {
        number: '01',
        label: 'Request',
        navKey: 'request',
        statusBadge: 'HOT · 94% FIT',
        statusTone: 'hot',
        title: 'Panel upgrade + Level 2 EV charger',
        amountMain: '$8,000–$9,500',
        amountSub: 'Preliminary Smart Intake range',
        facts: [
          { label: 'Location', value: 'Royal Oak · In service area' },
          { label: 'Timeline', value: 'Within 30 days · Urgency high' },
          { label: 'Contact', value: 'Taylor Vance · Phone verified' },
        ],
        copilotText: 'Smart Intake captured electrical panel photos & scored service-area match.',
        smsPreview: {
          label: 'INSTANT ESTIMATE SENT',
          to: 'Taylor',
          body: 'Thanks Taylor! We received your panel upgrade request. Preliminary estimate is $8,000–$9,500. Reviewing details now.',
          highlight: '$8,000–$9,500',
        },
        footerStatus: 'Needs contractor review · Ready to quote',
        actionHref: '#workflow',
        actionText: 'Review intake details →',
      },
      {
        number: '02',
        label: 'Quote',
        navKey: 'quote',
        statusBadge: 'APPROVED · E-SIGNED',
        statusTone: 'approved',
        title: '200A Square D Panel + EV NEMA 14-50',
        amountMain: '$8,950.00',
        amountSub: '$2,500.00 deposit collected via Stripe',
        facts: [
          { label: 'Scope', value: '200A panel + surge protector' },
          { label: 'Payment', value: 'Deposit paid · $6,450 balance' },
          { label: 'Signature', value: 'Taylor Vance · Timestamped' },
        ],
        copilotText: 'Quote approved on customer’s phone. $2,500 deposit automatically processed.',
        smsPreview: {
          label: 'QUOTE CONFIRMATION',
          to: 'Taylor',
          body: 'Quote approved! Your $2,500 deposit is confirmed. Select your preferred installation arrival window here: portal.letsgetquoted.com/j2081',
          highlight: 'portal.letsgetquoted.com/j2081',
        },
        footerStatus: 'Deposit in Stripe · Ready to schedule crew',
        actionHref: '#workflow',
        actionText: 'See quote & deposit step →',
      },
      {
        number: '03',
        label: 'Scheduled',
        navKey: 'scheduled',
        statusBadge: 'CONFIRMED · VAN 2',
        statusTone: 'scheduled',
        title: 'Confirmed: Tue, Mar 11 · 9–11 AM',
        amountMain: '$8,950.00',
        amountSub: 'Mike & Tanya assigned · Route optimized',
        facts: [
          { label: 'Arrival window', value: 'Tue, Mar 11 · 9:00–11:00 AM' },
          { label: 'Crew', value: 'Mike D. & Tanya R. (Lead)' },
          { label: 'Equipment', value: '200A main breaker + 50A EV run' },
        ],
        copilotText: 'Arrival window booked by homeowner. Job specs & photos synced to crew app.',
        smsPreview: {
          label: 'AUTOMATED ARRIVAL REMINDER',
          to: 'Taylor',
          body: 'Hi Taylor, Harbor Electric is scheduled for tomorrow between 9–11 AM. Mike & Tanya are assigned to your panel job.',
          highlight: 'tomorrow between 9–11 AM',
        },
        footerStatus: 'Scheduled on calendar · On-my-way primed',
        actionHref: '#workflow',
        actionText: 'Explore scheduling flow →',
      },
      {
        number: '04',
        label: 'Work',
        navKey: 'work',
        statusBadge: 'ON SITE · SPARKY ACTIVE',
        statusTone: 'work',
        title: 'Installation + $350 approved change order',
        amountMain: '$9,300.00',
        amountSub: '13.5 hrs logged · $3,400 projected margin',
        facts: [
          { label: 'Labor logged', value: '13.5h total · Mike + Tanya' },
          { label: 'Change order', value: '+$350 extra conduit approved' },
          { label: 'Materials', value: '$3,900 tracked with receipts' },
        ],
        copilotText: 'Text-to-Job: Sparky logged voice memo into an approved $350 conduit change order.',
        smsPreview: {
          label: 'CHANGE ORDER APPROVED',
          to: 'Taylor',
          body: 'Approved: $350 change order for additional conduit run added to Panel job. Total updated to $9,300.',
          highlight: '$350 change order',
        },
        footerStatus: 'Work complete · Inspection passed · Ready to bill',
        actionHref: '#workflow',
        actionText: 'See Text-to-Job in action →',
      },
      {
        number: '05',
        label: 'Paid',
        navKey: 'paid',
        statusBadge: 'PAID · COMPLETED',
        statusTone: 'paid',
        title: 'Paid in full · Review request sent',
        amountMain: '$9,300.00',
        amountSub: '100% collected · $3,400 realized margin',
        facts: [
          { label: 'Payout', value: 'Stripe instant deposit to bank' },
          { label: 'Reviews', value: '5-star review request delivered' },
          { label: 'Recurring', value: 'Enrolled in annual inspection' },
        ],
        copilotText: 'Final payment received. Receipt emailed and automated 5-star review request sent.',
        smsPreview: {
          label: 'PAYMENT RECEIPT & REVIEW',
          to: 'Taylor',
          body: 'Thank you Taylor! Your $6,800 final balance is paid in full. How was your experience with Mike & Tanya today?',
          highlight: 'paid in full',
        },
        footerStatus: 'Closed out · Realized margin $3,400 · Rebooked',
        actionHref: '#workflow',
        actionText: 'Follow next job to payment →',
      },
    ],
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plumbing',
    icon: '🚰',
    sampleId: 'SAMPLE #1904',
    customerName: 'Marcus Chen',
    location: 'Birmingham, MI',
    tradeKicker: 'PLUMBING & WATER SYSTEMS',
    stages: [
      {
        number: '01',
        label: 'Request',
        navKey: 'request',
        statusBadge: 'HOT · HIGH VALUE',
        statusTone: 'hot',
        title: 'Navien tankless water heater + whole-house repipe',
        amountMain: '$6,500–$8,200',
        amountSub: 'Instant Smart Intake preliminary estimate',
        facts: [
          { label: 'Location', value: 'Birmingham · 3.8 miles away' },
          { label: 'Issue', value: 'Galvanized pipe leak + no hot water' },
          { label: 'Contact', value: 'Marcus Chen · Verified SMS' },
        ],
        copilotText: 'Intake scanned basement piping photos and flagged high-urgency water leak.',
        smsPreview: {
          label: 'INTAKE CONFIRMATION',
          to: 'Marcus',
          body: 'Marcus, Apex Plumbing received your tankless water heater request. Preliminary estimate is $6,500–$8,200.',
          highlight: '$6,500–$8,200',
        },
        footerStatus: 'Urgent priority lead · Ready for 1-click quote',
        actionHref: '#workflow',
        actionText: 'See Smart Intake steps →',
      },
      {
        number: '02',
        label: 'Quote',
        navKey: 'quote',
        statusBadge: 'APPROVED · DEPOSIT PAID',
        statusTone: 'approved',
        title: 'Navien NPE-240A2 + Uponor PEX Repipe',
        amountMain: '$7,400.00',
        amountSub: '$2,000.00 deposit collected via Stripe',
        facts: [
          { label: 'Scope', value: 'Navien NPE-240A2 + gas venting' },
          { label: 'Payment terms', value: '$2,000 deposit · Balance at finish' },
          { label: 'E-sign', value: 'Marcus Chen · Signed on iPhone' },
        ],
        copilotText: 'Homeowner e-signed quote and paid $2,000 deposit within 12 minutes of receipt.',
        smsPreview: {
          label: 'DEPOSIT CONFIRMATION',
          to: 'Marcus',
          body: 'Deposit received! Your Navien Tankless installation is locked in. Select your arrival date at portal.letsgetquoted.com/j1904',
          highlight: '$2,000 deposit',
        },
        footerStatus: 'Signed & funded · Dispatching technician',
        actionHref: '#workflow',
        actionText: 'Explore quote approvals →',
      },
      {
        number: '03',
        label: 'Scheduled',
        navKey: 'scheduled',
        statusBadge: 'BOOKED · VAN 1',
        statusTone: 'scheduled',
        title: 'Confirmed: Thu, Mar 13 · 8–10 AM',
        amountMain: '$7,400.00',
        amountSub: 'Lead Tech Carlos assigned · Parts loaded',
        facts: [
          { label: 'Window', value: 'Thu, Mar 13 · 8:00–10:00 AM' },
          { label: 'Technician', value: 'Carlos R. · Master Plumber' },
          { label: 'Parts', value: 'Navien NPE + Uponor fittings' },
        ],
        copilotText: 'Auto-reminder sent 24h prior. Carlos alerted with gate code and water shutoff map.',
        smsPreview: {
          label: 'ON-MY-WAY ALERT',
          to: 'Marcus',
          body: 'Carlos from Apex Plumbing is en route! Estimated arrival 8:25 AM. Track arrival: track.letsgetquoted.com/carlos',
          highlight: 'Estimated arrival 8:25 AM',
        },
        footerStatus: 'Confirmed with customer · En route to job',
        actionHref: '#workflow',
        actionText: 'View field dispatch →',
      },
      {
        number: '04',
        label: 'Work',
        navKey: 'work',
        statusBadge: 'ON SITE · TESTED',
        statusTone: 'work',
        title: 'Tankless installed + water pressure tested',
        amountMain: '$7,750.00',
        amountSub: '+$350 expansion tank upgrade approved',
        facts: [
          { label: 'Labor logged', value: '8.0h · Carlos R. on site' },
          { label: 'Add-on', value: 'Thermal expansion tank (+$350)' },
          { label: 'Inspection', value: 'Gas test & flow rate certified' },
        ],
        copilotText: 'Carlos texted photo of pressure valve; Sparky appended expansion tank to bill.',
        smsPreview: {
          label: 'FIELD UPGRADE APPROVED',
          to: 'Marcus',
          body: 'Approved: Thermal expansion tank (+$350) added to comply with local code. Updated total: $7,750.',
          highlight: '+$350',
        },
        footerStatus: 'Installed & tested · Ready for balance payment',
        actionHref: '#workflow',
        actionText: 'See Text-to-Job workflow →',
      },
      {
        number: '05',
        label: 'Paid',
        navKey: 'paid',
        statusBadge: 'PAID IN FULL',
        statusTone: 'paid',
        title: 'Closed out · $7,750 collected · 5★ Review',
        amountMain: '$7,750.00',
        amountSub: 'Direct Stripe payout · $3,150 gross margin',
        facts: [
          { label: 'Collection', value: '$5,750 balance paid on mobile' },
          { label: 'Review', value: '5-star Google review posted' },
          { label: 'Follow up', value: 'Annual filter flush scheduled' },
        ],
        copilotText: 'Balance cleared instantly. Review request generated a 5-star Google review.',
        smsPreview: {
          label: 'PAID RECEIPT',
          to: 'Marcus',
          body: 'Apex Plumbing receipt: $7,750 paid in full for Navien Tankless System. Thank you for your 5-star review!',
          highlight: '$7,750 paid in full',
        },
        footerStatus: 'Paid & complete · Gross margin 40.6%',
        actionHref: '#workflow',
        actionText: 'See invoicing workflow →',
      },
    ],
  },
  hvac: {
    id: 'hvac',
    label: 'HVAC',
    icon: '❄️',
    sampleId: 'SAMPLE #3140',
    customerName: 'Sarah Jenkins',
    location: 'Troy, MI',
    tradeKicker: 'HEATING & COOLING',
    stages: [
      {
        number: '01',
        label: 'Request',
        navKey: 'request',
        statusBadge: 'HOT · REPLACEMENT',
        statusTone: 'hot',
        title: '4-Ton Carrier heat pump system replacement',
        amountMain: '$9,800–$12,400',
        amountSub: 'Smart Intake Preliminary Estimate',
        facts: [
          { label: 'Location', value: 'Troy · In service radius' },
          { label: 'System', value: '18-year AC failed · 2,400 sq ft' },
          { label: 'Timing', value: 'ASAP · No cooling in home' },
        ],
        copilotText: 'Smart Intake parsed tonnage requirements, outdoor unit photo, and thermostat type.',
        smsPreview: {
          label: 'ESTIMATE RANGE SENT',
          to: 'Sarah',
          body: 'Hi Sarah, ClimatePro received your AC replacement request. Estimated range: $9,800–$12,400. Quote is preparing.',
          highlight: '$9,800–$12,400',
        },
        footerStatus: 'Emergency replacement intake · Ready to quote',
        actionHref: '#workflow',
        actionText: 'Explore intake features →',
      },
      {
        number: '02',
        label: 'Quote',
        navKey: 'quote',
        statusBadge: 'APPROVED · 0% INSTALLMENT',
        statusTone: 'approved',
        title: 'Carrier Infinity 18 SEER2 Heat Pump + Ecobee',
        amountMain: '$11,200.00',
        amountSub: '$3,000.00 deposit paid via Stripe',
        facts: [
          { label: 'Rebate', value: '$2,000 IRA Federal Tax Credit eligible' },
          { label: 'Financing', value: '0%-interest installment plan chosen' },
          { label: 'Approved', value: 'Sarah Jenkins · E-signed' },
        ],
        copilotText: 'Quote accepted with 0%-interest installment schedule and manufacturer rebate certificate.',
        smsPreview: {
          label: 'QUOTE APPROVAL',
          to: 'Sarah',
          body: 'Your Carrier Heat Pump quote is approved! $3,000 deposit processed. Your installation is scheduled for Monday.',
          highlight: '$3,000 deposit',
        },
        footerStatus: 'Deposit received · Equipment pulled from warehouse',
        actionHref: '#workflow',
        actionText: 'See quote options →',
      },
      {
        number: '03',
        label: 'Scheduled',
        navKey: 'scheduled',
        statusBadge: 'CONFIRMED · 2 TECHS',
        statusTone: 'scheduled',
        title: 'Mon, Mar 17 · 8:00 AM – 12:00 PM',
        amountMain: '$11,200.00',
        amountSub: 'Techs Dave & Eric · Crane scheduled',
        facts: [
          { label: 'Window', value: 'Mon, Mar 17 · 8:00 AM – 12:00 PM' },
          { label: 'Assigned', value: 'Dave K. & Eric M. (HVAC Certified)' },
          { label: 'Delivery', value: 'Carrier condenser & air handler staged' },
        ],
        copilotText: 'Automated on-my-way reminder prepared. Customer reminded of attic access requirement.',
        smsPreview: {
          label: 'APPOINTMENT REMINDER',
          to: 'Sarah',
          body: 'Reminder: ClimatePro arrives tomorrow at 8:00 AM for your heat pump replacement. Lead tech Dave is on the way.',
          highlight: 'tomorrow at 8:00 AM',
        },
        footerStatus: 'Confirmed on schedule · Dispatch active',
        actionHref: '#workflow',
        actionText: 'Explore dispatch tools →',
      },
      {
        number: '04',
        label: 'Work',
        navKey: 'work',
        statusBadge: 'COMMISSIONED · ON SITE',
        statusTone: 'work',
        title: 'Refrigerant line vacuumed & airflow tested',
        amountMain: '$11,200.00',
        amountSub: '14.0 hrs logged · Static pressure tested',
        facts: [
          { label: 'Diagnostics', value: 'Subcooling & airflow certified' },
          { label: 'Smart T-Stat', value: 'Ecobee Premium configured' },
          { label: 'Warranty', value: '10-Year parts & labor registered' },
        ],
        copilotText: 'Dave snapped photo of testing gauge; Sparky logged warranty serial number to job.',
        smsPreview: {
          label: 'JOB COMPLETION UPDATE',
          to: 'Sarah',
          body: 'System installation complete! Cooling active at 68°F. View testing report & warranty at portal.letsgetquoted.com/j3140',
          highlight: 'Cooling active at 68°F',
        },
        footerStatus: 'System commissioned · Ready for final balance',
        actionHref: '#workflow',
        actionText: 'Explore field app →',
      },
      {
        number: '05',
        label: 'Paid',
        navKey: 'paid',
        statusBadge: 'PAID · RECURRING PLAN',
        statusTone: 'paid',
        title: '$11,200 Paid in full · Maintenance plan active',
        amountMain: '$11,200.00',
        amountSub: '$4,600 owner gross margin (41.1%)',
        facts: [
          { label: 'Settlement', value: 'Stripe balance deposited to bank' },
          { label: 'Recurring', value: '$19/mo VIP Filter & Tune Club' },
          { label: 'Review', value: '5-Star Google review captured' },
        ],
        copilotText: 'Full balance settled. Customer subscribed to $19/mo automated recurring maintenance.',
        smsPreview: {
          label: 'PAID RECEIPT & VIP CLUB',
          to: 'Sarah',
          body: 'Final invoice paid: $11,200. Welcome to the ClimatePro VIP Maintenance Club! Your receipt is ready.',
          highlight: '$11,200',
        },
        footerStatus: 'Complete & recurring revenue locked in',
        actionHref: '#workflow',
        actionText: 'See payment flow →',
      },
    ],
  },
  roofing: {
    id: 'roofing',
    label: 'Roofing',
    icon: '🔨',
    sampleId: 'SAMPLE #4022',
    customerName: 'Robert Vance',
    location: 'Rochester Hills, MI',
    tradeKicker: 'ROOFING & EXTERIORS',
    stages: [
      {
        number: '01',
        label: 'Request',
        navKey: 'request',
        statusBadge: 'HOT · STORM FIT',
        statusTone: 'hot',
        title: '32-Square architectural shingle tear-off & replacement',
        amountMain: '$14,500–$18,000',
        amountSub: 'Smart Intake estimate based on square footage',
        facts: [
          { label: 'Pitch/Size', value: '6/12 pitch · 32 squares · 2-story' },
          { label: 'Condition', value: 'Wind damage + missing ridge caps' },
          { label: 'Service area', value: 'Rochester Hills · Verified fit' },
        ],
        copilotText: 'Satellite address lookup & drone photo parsed into initial estimate range.',
        smsPreview: {
          label: 'INSTANT ESTIMATE',
          to: 'Robert',
          body: 'Thanks Robert! Apex Roofing calculated your 32-square preliminary roof estimate at $14,500–$18,000.',
          highlight: '$14,500–$18,000',
        },
        footerStatus: 'High value roof lead · Ready to build itemized quote',
        actionHref: '#workflow',
        actionText: 'See intake qualification →',
      },
      {
        number: '02',
        label: 'Quote',
        navKey: 'quote',
        statusBadge: 'APPROVED · $5,000 DEPOSIT',
        statusTone: 'approved',
        title: 'GAF Timberline HDZ + Ice & Water Shield',
        amountMain: '$16,200.00',
        amountSub: '$5,000 deposit paid · Material drop staged',
        facts: [
          { label: 'Materials', value: 'GAF Timberline HDZ (Charcoal)' },
          { label: 'Deposit', value: '$5,000 processed via Stripe' },
          { label: 'Warranty', value: 'GAF Golden Pledge 50-year warranty' },
        ],
        copilotText: 'Homeowner e-signed proposal. Deposit cleared and supplier PO drafted.',
        smsPreview: {
          label: 'QUOTE CONFIRMATION',
          to: 'Robert',
          body: 'Roofing contract signed! $5,000 deposit confirmed. Material delivery is set for Thursday morning.',
          highlight: '$5,000 deposit',
        },
        footerStatus: 'Funded & confirmed · Crew assigned',
        actionHref: '#workflow',
        actionText: 'See quote & deposit step →',
      },
      {
        number: '03',
        label: 'Scheduled',
        navKey: 'scheduled',
        statusBadge: 'CONFIRMED · 6-MAN CREW',
        statusTone: 'scheduled',
        title: 'Fri, Mar 21 · 7:00 AM start',
        amountMain: '$16,200.00',
        amountSub: 'Dumpster staged · Crew lead Javier',
        facts: [
          { label: 'Date', value: 'Fri, Mar 21 · 1-day complete tear-off' },
          { label: 'Crew', value: 'Javier Crew (6 certified roofers)' },
          { label: 'Logistics', value: 'Driveway tarping + magnet sweep' },
        ],
        copilotText: 'Weather forecast validated clear. Dumpster drop-off confirmed for driveway.',
        smsPreview: {
          label: 'PRE-ARRIVAL LOGISTICS',
          to: 'Robert',
          body: 'Apex Roofing arrives Friday at 7:00 AM. Please move vehicles from driveway for dumpster placement.',
          highlight: 'Friday at 7:00 AM',
        },
        footerStatus: 'Scheduled & weather-cleared · On track',
        actionHref: '#workflow',
        actionText: 'View job scheduling →',
      },
      {
        number: '04',
        label: 'Work',
        navKey: 'work',
        statusBadge: 'IN PROGRESS · 4 SHEETS PLYWOOD',
        statusTone: 'work',
        title: 'Tear-off complete + $480 rotten decking change',
        amountMain: '$16,680.00',
        amountSub: 'Sparky texted change order approval to homeowner',
        facts: [
          { label: 'Tear-off', value: 'Complete by 11:30 AM · Underlayment on' },
          { label: 'Change order', value: '+$480 for 4 rotted CDX plywood sheets' },
          { label: 'Nail sweep', value: 'Magnetic roller cleanup verified' },
        ],
        copilotText: 'Javier texted photo of rotted plywood; Sparky texted homeowner for instant $480 SMS approval.',
        smsPreview: {
          label: 'INSTANT CHANGE ORDER SMS',
          to: 'Robert',
          body: 'Javier found 4 sheets of rotted decking over the garage ($480). Reply YES to approve and keep work moving.',
          highlight: 'Reply YES to approve',
        },
        footerStatus: 'Change order approved via SMS · Shingling in progress',
        actionHref: '#workflow',
        actionText: 'See Text-to-Job with Sparky →',
      },
      {
        number: '05',
        label: 'Paid',
        navKey: 'paid',
        statusBadge: 'PAID IN FULL · CLOSED',
        statusTone: 'paid',
        title: '$16,680 collected · 50-Year warranty issued',
        amountMain: '$16,680.00',
        amountSub: '$6,200 gross margin · GAF certificate sent',
        facts: [
          { label: 'Final balance', value: '$11,680 paid via Stripe ACH' },
          { label: 'Warranty', value: 'GAF 50-Year Certificate PDF delivered' },
          { label: 'Review', value: '5-star review with drone photo' },
        ],
        copilotText: 'ACH final balance received. Drone completion photos attached to receipt & warranty packet.',
        smsPreview: {
          label: 'PAID RECEIPT & WARRANTY',
          to: 'Robert',
          body: 'Apex Roofing: $16,680 paid in full. Your GAF 50-Year Warranty & inspection photos: portal.letsgetquoted.com/j4022',
          highlight: 'paid in full',
        },
        footerStatus: 'Job closed out · Realized margin $6,200',
        actionHref: '#workflow',
        actionText: 'Follow another job to payment →',
      },
    ],
  },
  remodeling: {
    id: 'remodeling',
    label: 'Remodeling',
    icon: '🏡',
    sampleId: 'SAMPLE #5218',
    customerName: 'Elena Rostova',
    location: 'Bloomfield Hills, MI',
    tradeKicker: 'RESIDENTIAL REMODELING',
    stages: [
      {
        number: '01',
        label: 'Request',
        navKey: 'request',
        statusBadge: 'HOT · LUXURY FIT',
        statusTone: 'hot',
        title: 'Primary bathroom gut renovation & curbless walk-in shower',
        amountMain: '$22,000–$28,000',
        amountSub: 'Smart Intake Preliminary Scope & Estimate',
        facts: [
          { label: 'Scope', value: 'Curbless shower + double vanity' },
          { label: 'Budget', value: '$25,000+ indicated by homeowner' },
          { label: 'Timing', value: 'Flexible start within 60 days' },
        ],
        copilotText: 'Intake captured tile inspirations, fixture specs, and plumbing relocation requirements.',
        smsPreview: {
          label: 'INTAKE CONFIRMATION',
          to: 'Elena',
          body: 'Elena, Prestige Remodeling received your bathroom project. Estimated budget range: $22,000–$28,000.',
          highlight: '$22,000–$28,000',
        },
        footerStatus: 'High-value design intake · Ready to itemize',
        actionHref: '#workflow',
        actionText: 'Explore intake process →',
      },
      {
        number: '02',
        label: 'Quote',
        navKey: 'quote',
        statusBadge: 'APPROVED · $7,500 DEPOSIT',
        statusTone: 'approved',
        title: 'Custom Curbless Shower + Quartz Double Vanity',
        amountMain: '$24,850.00',
        amountSub: '3-stage milestone payment plan ($7,500 deposit)',
        facts: [
          { label: 'Milestones', value: '$7.5k deposit / $8.5k rough-in / balance' },
          { label: 'Add-on', value: 'Heated Schluter Ditra floor (+$1,450)' },
          { label: 'E-sign', value: 'Elena Rostova · Signed & deposit paid' },
        ],
        copilotText: 'Proposal approved with milestone billing terms & heated flooring upgrade.',
        smsPreview: {
          label: 'CONTRACT & DEPOSIT APPROVED',
          to: 'Elena',
          body: 'Contract signed! $7,500 milestone deposit received. Tile and plumbing fixtures ordered.',
          highlight: '$7,500 milestone deposit',
        },
        footerStatus: 'Deposit funded · Materials staged with suppliers',
        actionHref: '#workflow',
        actionText: 'See quote & payment setup →',
      },
      {
        number: '03',
        label: 'Scheduled',
        navKey: 'scheduled',
        statusBadge: 'STAGED · 2-WEEK SPRINT',
        statusTone: 'scheduled',
        title: 'Sprint start: Mon, Apr 07 · 8:00 AM',
        amountMain: '$24,850.00',
        amountSub: 'Project Lead Ryan · Tile specialist Marco',
        facts: [
          { label: 'Duration', value: '10 business days total duration' },
          { label: 'Crew', value: 'Ryan P. (Lead) & Marco G. (Tile)' },
          { label: 'Protection', value: 'Dust barriers & floor runners staged' },
        ],
        copilotText: 'Calendar scheduled and homeowner sent preparation guide for dust containment.',
        smsPreview: {
          label: 'PROJECT KICKOFF NOTICE',
          to: 'Elena',
          body: 'Prestige Remodeling arrives Monday at 8:00 AM for Demo Day! Ryan & Marco are assigned to your home.',
          highlight: 'Monday at 8:00 AM',
        },
        footerStatus: 'Scheduled · Customer portal active for messages',
        actionHref: '#workflow',
        actionText: 'See scheduling system →',
      },
      {
        number: '04',
        label: 'Work',
        navKey: 'work',
        statusBadge: 'MILESTONE 2 REACHED',
        statusTone: 'work',
        title: 'Schluter waterproofing + custom tile set',
        amountMain: '$24,850.00',
        amountSub: '$8,500 rough-in milestone invoice cleared',
        facts: [
          { label: 'Inspection', value: 'Rough plumbing & electrical passed' },
          { label: 'Waterproofing', value: '24-hour flood test passed 100%' },
          { label: 'Time tracking', value: '62.5 total crew hours logged' },
        ],
        copilotText: 'Flood test certificate photographed; milestone invoice automatically dispatched.',
        smsPreview: {
          label: 'PORTAL PHOTO UPDATE',
          to: 'Elena',
          body: 'Flood test passed! Tile installation starting tomorrow. Check progress photos: portal.letsgetquoted.com/j5218',
          highlight: 'Flood test passed!',
        },
        footerStatus: 'Tile in progress · On budget & on schedule',
        actionHref: '#workflow',
        actionText: 'See client portal feature →',
      },
      {
        number: '05',
        label: 'Paid',
        navKey: 'paid',
        statusBadge: 'COMPLETED · $24,850 PAID',
        statusTone: 'paid',
        title: 'Bathroom transformation complete & paid',
        amountMain: '$24,850.00',
        amountSub: '100% paid · $9,800 realized margin (39.4%)',
        facts: [
          { label: 'Final balance', value: '$8,850 final balance collected' },
          { label: 'Punch list', value: '100% completed & homeowner approved' },
          { label: 'Reviews', value: '5-star Houzz & Google review' },
        ],
        copilotText: 'Final payment collected. 5-star review posted and portfolio photos uploaded.',
        smsPreview: {
          label: 'PROJECT SIGN-OFF & RECEIPT',
          to: 'Elena',
          body: 'Thank you Elena! Final $8,850 balance cleared. Your full warranty and before/after gallery are ready.',
          highlight: 'Final $8,850 balance cleared',
        },
        footerStatus: 'Project complete · Margin $9,800 · 5★ review',
        actionHref: '#workflow',
        actionText: 'Follow one job to payment →',
      },
    ],
  },
};

const TRADES: Array<{ id: TradeId; label: string; icon: string }> = [
  { id: 'electrical', label: 'Electrical', icon: '⚡' },
  { id: 'plumbing', label: 'Plumbing', icon: '🚰' },
  { id: 'hvac', label: 'HVAC', icon: '❄️' },
  { id: 'roofing', label: 'Roofing', icon: '🔨' },
  { id: 'remodeling', label: 'Remodeling', icon: '🏡' },
];

export default function HeroJobSimulator() {
  const [activeTrade, setActiveTrade] = useState<TradeId>('electrical');
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const timerRef = useRef<number | null>(null);
  const isHoveredRef = useRef(false);

  const preset = TRADE_PRESETS[activeTrade] || TRADE_PRESETS.electrical;
  const currentStage = preset.stages[activeStageIndex] || preset.stages[0];

  const nextStage = useCallback(() => {
    setActiveStageIndex((prev) => (prev + 1) % 5);
  }, []);

  // Auto-cycle timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = window.setInterval(() => {
      if (!isHoveredRef.current) {
        nextStage();
      }
    }, 4500);

    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [isPlaying, nextStage]);

  const selectStage = (index: number) => {
    setActiveStageIndex(index);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleStageKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % 5;
    else if (e.key === 'ArrowLeft') next = (index - 1 + 5) % 5;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 4;
    else return;

    e.preventDefault();
    selectStage(next);
  };

  return (
    <aside
      className={styles.heroJobSimulator}
      aria-label={`Illustrative ${preset.label} job moving through Let’s Get Quoted`}
      onMouseEnter={() => {
        isHoveredRef.current = true;
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
      }}
    >
      {/* Trade Selector Switcher */}
      <div className={styles.tradeSelectorBar} role="tablist" aria-label="Select contractor trade sample">
        {TRADES.map((trade) => {
          const isActive = activeTrade === trade.id;
          return (
            <button
              key={trade.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tradeTab} ${isActive ? styles.tradeTabActive : ''}`}
              onClick={() => {
                setActiveTrade(trade.id);
                setActiveStageIndex(0);
              }}
            >
              <span aria-hidden="true">{trade.icon}</span>
              <span>{trade.label}</span>
            </button>
          );
        })}
      </div>

      {/* Card Header Top */}
      <div className={styles.heroJobTop}>
        <div className={styles.metaWrap}>
          <span className={styles.sampleTag}>{preset.sampleId}</span>
          <span aria-hidden="true">·</span>
          <span>{preset.customerName} ({preset.location})</span>
        </div>
        <div className={styles.controlsWrap}>
          <span className={styles.stageBadge} data-tone={currentStage.statusTone}>
            <span aria-hidden="true">●</span> {currentStage.statusBadge}
          </span>
          <button
            type="button"
            className={styles.playToggle}
            onClick={togglePlay}
            title={isPlaying ? 'Pause interactive preview' : 'Play interactive preview'}
            aria-label={isPlaying ? 'Pause stage cycle' : 'Play stage cycle'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      {/* Main Title & Financial Snapshot */}
      <div className={styles.heroJobTitle}>
        <div>
          <div className={styles.tradeEyebrow}>
            <strong>{preset.tradeKicker}</strong>
            <span aria-hidden="true">/</span>
            <span>STAGE {currentStage.number} OF 05</span>
          </div>
          <h2>{currentStage.title}</h2>
        </div>
        <div className={styles.amountBox}>
          <span className={styles.amountMain}>{currentStage.amountMain}</span>
          <span className={styles.amountSub}>{currentStage.amountSub}</span>
        </div>
      </div>

      {/* 3-Card Facts Grid */}
      <dl className={styles.heroJobFacts}>
        {currentStage.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>
              <span className={factCheckClass} aria-hidden="true">✓</span>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Real-time AI Copilot / Automation Pulse Bar */}
      <div className={styles.copilotBar}>
        <span className={styles.copilotBadge}>⚡ AI COPILOT</span>
        <span className={styles.copilotText}>{currentStage.copilotText}</span>
      </div>

      {/* Customer SMS / Portal Live Snapshot */}
      <div className={styles.smsCard}>
        <div className={styles.smsHeader}>
          <span>{currentStage.smsPreview.label}</span>
          <span>✓ Delivered to {currentStage.smsPreview.to}</span>
        </div>
        <p className={styles.smsBubble}>
          {currentStage.smsPreview.highlight && currentStage.smsPreview.body.includes(currentStage.smsPreview.highlight) ? (
            <>
              {currentStage.smsPreview.body.split(currentStage.smsPreview.highlight)[0]}
              <strong className={styles.smsHighlight}>{currentStage.smsPreview.highlight}</strong>
              {currentStage.smsPreview.body.split(currentStage.smsPreview.highlight)[1]}
            </>
          ) : (
            currentStage.smsPreview.body
          )}
        </p>
      </div>

      {/* Interactive 5-Step Stepper Tabs */}
      <div className={styles.journeyWrap}>
        <div className={styles.progressBarTrack} aria-hidden="true">
          <div
            className={styles.progressBarFill}
            style={{ width: `${(activeStageIndex / 4) * 100}%` }}
          />
        </div>
        <ol className={styles.journeyList} role="tablist" aria-label="Five connected job stages">
          {preset.stages.map((st, idx) => {
            const isCompleted = idx < activeStageIndex;
            const isActive = idx === activeStageIndex;
            const state = isActive ? 'active' : isCompleted ? 'completed' : 'upcoming';

            return (
              <li key={st.label}>
                <button
                  type="button"
                  role="tab"
                  id={`journey-tab-${st.navKey}`}
                  aria-selected={isActive}
                  className={styles.journeyBtn}
                  data-state={state}
                  onClick={() => selectStage(idx)}
                  onKeyDown={(e) => handleStageKeyDown(e, idx)}
                >
                  <span className={styles.journeyNode}>
                    {isCompleted ? '✓' : idx + 1}
                  </span>
                  <span className={styles.journeyLabel}>{st.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Status Footer */}
      <div className={styles.statusFooter}>
        <div className={styles.statusIndicator}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{currentStage.footerStatus}</span>
        </div>
        <a className={styles.nextStepAction} href={currentStage.actionHref}>
          {currentStage.actionText}
        </a>
      </div>
    </aside>
  );
}

const factCheckClass = styles.factCheck;
