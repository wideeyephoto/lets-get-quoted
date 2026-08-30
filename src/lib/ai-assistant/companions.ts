export type CompanionId = 'assistant' | 'diesel' | 'echo' | 'sparky' | 'nova';

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

export const COMPANIONS: CompanionProfile[] = [
  {
    id: 'assistant',
    name: 'AI Assistant',
    role: 'Contractor AI Sidekick & Copilot',
    species: 'Energy Orbit',
    tagline: 'Focused, intelligent energy orbit delivering instant estimates, specs, and schedule intelligence.',
    avatarSrc: '/brand/companions/spark.jpg',
    thinkingSrc: '/brand/companions/spark.jpg',
    accentColor: '#2563eb',
    badgeLabel: 'Energy Orbit',
    introMessage:
      "AI Assistant online. Energy orbit synchronized. I'm ready to calculate job scopes, draft instant quotes, analyze receipts, and coordinate your schedule. What are we tackling?",
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
];

export const DEFAULT_COMPANION_ID: CompanionId = 'assistant';

export function getCompanion(id?: string | null, trade?: string | null): CompanionProfile {
  const normalizedId = id === 'nova' || id === 'sparky' ? 'assistant' : id;
  const match = COMPANIONS.find((c) => c.id === normalizedId) || COMPANIONS[0];
  return match;
}
