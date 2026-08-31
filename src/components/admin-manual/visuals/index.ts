import React from 'react';
import { SystemLandscapeVisual } from './SystemLandscapeVisual';
import { RoutesTrustBoundariesVisual } from './RoutesTrustBoundariesVisual';
import { LeadToPaidLifecycleVisual } from './LeadToPaidLifecycleVisual';
import { PaymentRailsVisual } from './PaymentRailsVisual';
import { AuthTenancyMfaVisual } from './AuthTenancyMfaVisual';
import { SmsConsentDeliveryVisual } from './SmsConsentDeliveryVisual';
import { ScheduledJobsHealthVisual } from './ScheduledJobsHealthVisual';
import { IncidentInvestigationVisual } from './IncidentInvestigationVisual';

export const ADMIN_MANUAL_VISUAL_COMPONENTS: Record<string, React.FC> = {
  'system-landscape': SystemLandscapeVisual,
  'routes-trust-boundaries': RoutesTrustBoundariesVisual,
  'lead-to-paid-lifecycle': LeadToPaidLifecycleVisual,
  'payment-rails': PaymentRailsVisual,
  'auth-tenancy-mfa': AuthTenancyMfaVisual,
  'sms-consent-delivery': SmsConsentDeliveryVisual,
  'scheduled-jobs-health': ScheduledJobsHealthVisual,
  'incident-investigation': IncidentInvestigationVisual,
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
};
