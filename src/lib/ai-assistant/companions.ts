export type CompanionId = 'sparky' | 'diesel' | 'echo' | 'assistant' | 'nova';

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
    id: 'echo',
    name: 'Echo',
    role: 'Lead Code & Safety Auditor',
    species: 'Great Horned Owl',
    tagline: 'Eagle-eyed inspector who catches permit requirements, code compliance & safety fine print.',
    avatarSrc: '/brand/companions/echo.jpg',
    thinkingSrc: '/brand/companions/echo.jpg',
    accentColor: '#0284c7',
    badgeLabel: 'Safety Inspector',
    introMessage:
      "Echo on site. Inspection clipboard ready. I'll verify building codes, check jurisdiction permits, audit safety checklists, and review contract fine print before you sign off. What project are we reviewing?",
  },
  {
    id: 'assistant',
    name: 'AI Assistant',
    role: 'Core AI Copilot',
    species: 'Energy Spark',
    tagline: 'Focused, modern energy spark delivering instant estimates, specs, and schedule intelligence.',
    avatarSrc: '/brand/companions/spark.jpg',
    thinkingSrc: '/brand/companions/spark.jpg',
    accentColor: '#38bdf8',
    badgeLabel: 'Energy Spark',
    introMessage:
      "AI Assistant online. Energy spark synchronized. I'm ready to calculate job scopes, draft instant quotes, analyze receipts, and coordinate your schedule. What are we tackling?",
  },
];

export const DEFAULT_COMPANION_ID: CompanionId = 'sparky';

export function getCompanion(id?: string | null, trade?: string | null): CompanionProfile {
  const normalizedId = id === 'nova' ? 'assistant' : id;
  const match = COMPANIONS.find((c) => c.id === normalizedId) || COMPANIONS[0];
  
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
