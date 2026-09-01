export interface RevenueMilestoneBadge {
  thresholdDollars: number;
  badgeTitle: string;
  badgeIcon: string;
  congratulatoryHeadline: string;
  rewardDescription: string;
  referralLink: string;
}

export const REVENUE_MILESTONES: RevenueMilestoneBadge[] = [
  {
    thresholdDollars: 10000,
    badgeTitle: '$10,000 Milestone Club',
    badgeIcon: '🥉',
    congratulatoryHeadline: 'Congratulations on crossing $10,000 in quotes & payments!',
    rewardDescription: 'Refer a fellow contractor and you both receive 1 month of Let\'s Get Quoted Growth free.',
    referralLink: 'https://app.letsgetquoted.com/refer?ref=m10k',
  },
  {
    thresholdDollars: 50000,
    badgeTitle: '$50,000 High-Volume Pro',
    badgeIcon: '🥈',
    congratulatoryHeadline: 'Incredible achievement! You have processed over $50,000 on LGQ.',
    rewardDescription: 'Unlock complimentary priority SMS hotline provisioning for your entire crew.',
    referralLink: 'https://app.letsgetquoted.com/refer?ref=m50k',
  },
  {
    thresholdDollars: 100000,
    badgeTitle: '$100,000 Elite Partner',
    badgeIcon: '🥇',
    congratulatoryHeadline: 'Elite status unlocked! Over $100,000 in gross processed volume.',
    rewardDescription: 'Exclusive custom website SEO consultation + $250 Google Ads credit matching.',
    referralLink: 'https://app.letsgetquoted.com/refer?ref=m100k',
  },
];

/**
 * Calculates highest unlocked milestone and progress to the next revenue milestone badge
 */
export function evaluateMilestoneProgress(grossVolumeDollars: number, accountId: string): {
  currentMilestone: RevenueMilestoneBadge | null;
  nextMilestone: RevenueMilestoneBadge | null;
  progressPercent: number;
  dollarsToNext: number;
  referralShareUrl: string;
} {
  let currentMilestone: RevenueMilestoneBadge | null = null;
  let nextMilestone: RevenueMilestoneBadge | null = REVENUE_MILESTONES[0];

  for (let i = 0; i < REVENUE_MILESTONES.length; i++) {
    if (grossVolumeDollars >= REVENUE_MILESTONES[i].thresholdDollars) {
      currentMilestone = REVENUE_MILESTONES[i];
      nextMilestone = REVENUE_MILESTONES[i + 1] || null;
    }
  }

  const prevThreshold = currentMilestone ? currentMilestone.thresholdDollars : 0;
  const targetThreshold = nextMilestone ? nextMilestone.thresholdDollars : prevThreshold;
  const range = Math.max(1, targetThreshold - prevThreshold);
  const currentInRange = Math.max(0, grossVolumeDollars - prevThreshold);
  const progressPercent = nextMilestone ? Math.min(100, Math.round((currentInRange / range) * 100)) : 100;
  const dollarsToNext = nextMilestone ? Math.max(0, targetThreshold - grossVolumeDollars) : 0;

  const referralShareUrl = `https://app.letsgetquoted.com/r/${encodeURIComponent(accountId)}`;

  return {
    currentMilestone,
    nextMilestone,
    progressPercent,
    dollarsToNext,
    referralShareUrl,
  };
}
