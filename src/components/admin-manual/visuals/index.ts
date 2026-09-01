import React from 'react';
import { SystemLandscapeVisual } from './SystemLandscapeVisual';
import { RoutesTrustBoundariesVisual } from './RoutesTrustBoundariesVisual';
import { LeadToPaidLifecycleVisual } from './LeadToPaidLifecycleVisual';
import { PaymentRailsVisual } from './PaymentRailsVisual';
import { AuthTenancyMfaVisual } from './AuthTenancyMfaVisual';
import { SmsConsentDeliveryVisual } from './SmsConsentDeliveryVisual';
import { ScheduledJobsHealthVisual } from './ScheduledJobsHealthVisual';
import { IncidentInvestigationVisual } from './IncidentInvestigationVisual';
import { AiOperatorCopilotVisual } from './AiOperatorCopilotVisual';
import { AdBillingWalletVisual } from './AdBillingWalletVisual';
import { SpeedToLeadTcpaVisual } from './SpeedToLeadTcpaVisual';

export const ADMIN_MANUAL_VISUAL_COMPONENTS: Record<string, React.FC> = {
  'system-landscape': SystemLandscapeVisual,
  'routes-trust-boundaries': RoutesTrustBoundariesVisual,
  'lead-to-paid-lifecycle': LeadToPaidLifecycleVisual,
  'payment-rails': PaymentRailsVisual,
  'auth-tenancy-mfa': AuthTenancyMfaVisual,
  'sms-consent-delivery': SmsConsentDeliveryVisual,
  'scheduled-jobs-health': ScheduledJobsHealthVisual,
  'incident-investigation': IncidentInvestigationVisual,
  'ai-operator-copilot': AiOperatorCopilotVisual,
  'ad-billing-wallet': AdBillingWalletVisual,
  'speed-to-lead-tcpa': SpeedToLeadTcpaVisual,
};

export {
  SystemLandscapeVisual,
  RoutesTrustBoundariesVisual,
  LeadToPaidLifecycleVisual,
  PaymentRailsVisual,
  AuthTenancyMfaVisual,
  SmsConsentDeliveryVisual,
  ScheduledJobsHealthVisual,
  IncidentInvestigationVisual,
  AiOperatorCopilotVisual,
  AdBillingWalletVisual,
  SpeedToLeadTcpaVisual,
};
