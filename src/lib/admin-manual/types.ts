import type { Permission, StaffRole } from '@/lib/staff';

export type ManualRiskLevel = 'general' | 'staging' | 'production';

export type ManualArticleStatus = 'current' | 'draft' | 'historical' | 'superseded' | 'disabled';

export type ManualVisual = {
  id: string;
  title: string;
  questionAnswered: string;
  caption: string;
  textEquivalent: string;
  authoritativeFiles: string[];
  owner: string;
  lastVerified: string;
};

export type ManualStep = {
  stepNumber: number;
  title: string;
  instruction: string;
  caution?: string;
  commandOrAction?: string;
  verification?: string;
};

export type ManualArticle = {
  slug: string;
  chapterId: string;
  chapterTitle: string;
  order: number;
  title: string;
  summary: string;
  keywords: string[];
  status: ManualArticleStatus;
  intendedRoles: StaffRole[];
  requiredPermission?: Permission;
  requiresMfa: boolean;
  requiresDualAuth?: boolean;
  slaMinutes?: number;
  interactiveParams?: Array<{ key: string; label: string; placeholder: string; default?: string }>;
  riskLevel: ManualRiskLevel;
  environment: 'all' | 'staging' | 'production';
  useThisWhen: string;
  desiredOutcome: string;
  prerequisites: string[];
  routes: Array<{ label: string; href: string }>;
  procedure: ManualStep[];
  stopConditions: string[];
  expectedResult: string;
  impact: {
    customer: string;
    business: string;
  };
  evidenceAfterward: string[];
  auditLogExpectation: string;
  recoveryOrRollback: string;
  escalationContact: string;
  relatedArticles: string[];
  owner: string;
  backupOwner: string;
  authoritativeFiles: string[];
  lastVerified: string;
  lastVerifiedCommit: string;
  visualId?: string;
};

/**
 * Sanitized summary payload safe for client-side search index.
 * Strips step-by-step procedures, credentials, and sensitive audit details.
 */
export type ManualArticleSummary = Pick<
  ManualArticle,
  | 'slug'
  | 'chapterId'
  | 'chapterTitle'
  | 'order'
  | 'title'
  | 'summary'
  | 'keywords'
  | 'intendedRoles'
  | 'requiredPermission'
  | 'requiresMfa'
  | 'riskLevel'
  | 'routes'
  | 'owner'
  | 'lastVerified'
  | 'visualId'
>;

export type ManualChapter = {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  summary: string;
  owner: string;
  backupOwner: string;
  primaryRoles: StaffRole[];
  articles: ManualArticleSummary[];
};
