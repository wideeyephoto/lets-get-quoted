export type CompanionId = 'sparky' | 'diesel' | 'nova';

export interface CompanionTradeOption {
  id: string;
  name: string;
  avatarSrc: string;
  emoji: string;
}

export interface CompanionProfile {
  id: CompanionId;
  name: string;
  role: string;
  species: string;
  tagline: string;
  avatarSrc: string;
  thinkingSrc?: string;
  accentColor: string;
  badgeLabel: string;
  introMessage: string;
  tradeOptions?: CompanionTradeOption[];
}

export const SPARKY_TRADE_OPTIONS: CompanionTradeOption[] = [
  { id: 'general', name: 'General Contractor', avatarSrc: '/brand/sparky/sparky-avatar.jpg', emoji: '🔨' },
  { id: 'electrician', name: 'Electrician', avatarSrc: '/brand/sparky/sparky-electrician.jpg', emoji: '⚡' },
  { id: 'plumbing', name: 'Plumber', avatarSrc: '/brand/sparky/sparky-plumber.jpg', emoji: '🔧' },
  { id: 'carpentry', name: 'Carpenter', avatarSrc: '/brand/sparky/sparky-carpenter.jpg', emoji: '🪚' },
  { id: 'roofing', name: 'Roofer', avatarSrc: '/brand/sparky/sparky-roofer.jpg', emoji: '🏠' },
  { id: 'painting', name: 'Painter', avatarSrc: '/brand/sparky/sparky-painter.jpg', emoji: '🎨' },
  { id: 'landscaping', name: 'Lawn & Landscaping', avatarSrc: '/brand/sparky/sparky-lawncare.jpg', emoji: '🌿' },
  { id: 'inspector', name: 'Safety Inspector', avatarSrc: '/brand/sparky/sparky-inspector.jpg', emoji: '🔍' },
];

export const COMPANIONS: CompanionProfile[] = [
  {
    id: 'sparky',
    name: 'Sparky',
    role: 'Contractor AI Sidekick',
    species: 'Jack Russell Terrier',
    tagline: 'Energetic, sharp, and always ready on site or in the van.',
    avatarSrc: '/brand/sparky/sparky-avatar.jpg',
    thinkingSrc: '/brand/sparky/sparky-thinking.jpg',
    accentColor: '#6366f1',
    badgeLabel: 'AI Sidekick',
    introMessage:
      "Hey! I'm Sparky, your AI sidekick. I can draft quotes, add job change orders, check unpaid invoices, look up your schedule, or analyze supply receipts and site photos you attach here. What can I take off your plate?",
    tradeOptions: SPARKY_TRADE_OPTIONS,
  },
  {
    id: 'diesel',
    name: 'Diesel',
    role: 'Jobsite Foreman AI',
    species: 'English Bulldog',
    tagline: 'Tough, dependable jobsite manager who keeps crew & jobs on track.',
    avatarSrc: '/brand/companions/diesel.jpg',
    thinkingSrc: '/brand/companions/diesel.jpg',
    accentColor: '#f59e0b',
    badgeLabel: 'Site Foreman',
    introMessage:
      "Diesel here. Let's get down to business. I'll track your punch lists, calculate material overages, manage job change orders, and keep your crews organized. What job are we tackling?",
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Alive Energy Orb',
    species: 'Neural Plasma Orb',
    tagline: 'Fluid, living iridescent energy orb pulsing with real-time intelligence.',
    avatarSrc: '/brand/companions/nova.jpg',
    thinkingSrc: '/brand/companions/nova.jpg',
    accentColor: '#a855f7',
    badgeLabel: 'Energy Orb',
    introMessage:
      "Nova active. Fluid intelligence linked. I'm ready to calculate job scopes, track punch lists, process receipts, or look up your schedule. What are we working on?",
  },
];

export const DEFAULT_COMPANION_ID: CompanionId = 'sparky';

export function getCompanion(id?: string | null, trade?: string | null): CompanionProfile {
  const match = COMPANIONS.find((c) => c.id === id) || COMPANIONS[0];
  
  if (match.id === 'sparky' && trade && match.tradeOptions) {
    const tradeOption = match.tradeOptions.find((t) => t.id === trade.toLowerCase());
    if (tradeOption) {
      return {
        ...match,
        avatarSrc: tradeOption.avatarSrc,
      };
    }
  }
  
  return match;
}
