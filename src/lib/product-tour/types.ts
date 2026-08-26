/**
 * Shared product tour domain types.
 *
 * Provides a pure, framework-independent domain model for both:
 * 1. Public prospect evaluation tours (fictional data, zero mutations).
 * 2. Signed-in workspace orientations (cross-device progress, spotlight coachmarks).
 */

export type TourStatus = 'active' | 'dismissed' | 'completed';

export type TourAudience = 'anonymous' | 'owner' | 'office';

export type CoachmarkPlacement = 'top' | 'right' | 'bottom' | 'left' | 'auto';

export type TourStep = {
  /** Stable textual step identifier, e.g. 'dashboard-overview', 'lead-inbox' */
  id: string;
  /** Route where the step lives, e.g. '/dashboard', '/dashboard/leads' */
  route: string;
  /** Target DOM attribute [data-tour-id="..."] */
  targetId?: string;
  /** Title displayed in the coachmark */
  title: string;
  /** Body explanation */
  body: string;
  /** Preferred coachmark placement relative to target */
  placement?: CoachmarkPlacement;
  /** Required office capabilities (if any) */
  requiredCapabilities?: readonly string[];
  /** Flag if step is strictly owner-only */
  ownerOnly?: boolean;
  /** Whether this step requires opening the mobile navigation drawer to locate target */
  openNavigation?: boolean;
  /** Perspective label for public tours (e.g. 'Homeowner Perspective') */
  perspective?: 'homeowner' | 'contractor' | 'summary';
};

export type TourDefinition = {
  /** Stable tour identifier, e.g. 'dashboard-orientation' */
  key: string;
  /** Numeric version for schema & suppression invalidation */
  version: number;
  /** Human-readable title */
  title: string;
  /** Estimated duration in minutes */
  estimatedMinutes: number;
  /** Allowed audience roles */
  audience: readonly TourAudience[];
  /** Sequence of steps in order */
  steps: readonly TourStep[];
};

export type TourProgressRecord = {
  account_id: string;
  user_id: string;
  tour_key: string;
  tour_version: number;
  status: TourStatus;
  current_step_id: string;
  started_at: string;
  updated_at: string;
  dismissed_at: string | null;
  completed_at: string | null;
};

export type TourUserContext = {
  userId?: string | null;
  accountId?: string | null;
  role: TourAudience;
  capabilities?: ReadonlySet<string>;
};

export type TourEventName =
  | 'tour_offered'
  | 'tour_started'
  | 'step_viewed'
  | 'step_interacted'
  | 'step_skipped'
  | 'step_completed'
  | 'action_simulated'
  | 'quote_option_changed'
  | 'signature_applied'
  | 'deposit_simulated'
  | 'cross_device_handoff_opened'
  | 'step_target_missing'
  | 'tour_exited'
  | 'tour_dismissed'
  | 'tour_completed'
  | 'tour_restarted'
  | 'signup_clicked'
  | 'cta_clicked'
  | 'setup_action_clicked';

export type TourEventRecord = {
  id?: string;
  client_event_id: string;
  tour_key: string;
  tour_version: number;
  event_type: TourEventName;
  step_id?: string;
  account_id?: string | null;
  user_id?: string | null;
  anonymous_session_id?: string;
  role?: TourAudience;
  source?: string;
  pathname?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  created_at?: string;
};
