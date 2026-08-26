import type { TourDefinition, TourProgressRecord, TourStep, TourUserContext } from './types';

/**
 * Validates if a user has access to a specific tour step based on role and capabilities.
 */
export function canAccessStep(step: TourStep, userContext: TourUserContext): boolean {
  if (userContext.role === 'anonymous') {
    return !step.requiredCapabilities && !step.ownerOnly;
  }

  if (userContext.role === 'owner') {
    return true;
  }

  if (userContext.role === 'office') {
    if (step.ownerOnly) return false;
    if (!step.requiredCapabilities || step.requiredCapabilities.length === 0) return true;
    const caps = userContext.capabilities;
    if (!caps) return false;
    return step.requiredCapabilities.every((cap) => caps.has(cap));
  }

  return false;
}

/**
 * Filters a tour definition to only the steps accessible by the given user.
 */
export function filterStepsForUser(tour: TourDefinition, userContext: TourUserContext): TourStep[] {
  return tour.steps.filter((step) => canAccessStep(step, userContext));
}

/**
 * Determines whether a tour should be automatically offered to a user.
 */
export function shouldOfferTour(
  tour: TourDefinition,
  progress: TourProgressRecord | null,
  userContext: TourUserContext,
): boolean {
  // Check audience compatibility
  if (!tour.audience.includes(userContext.role)) {
    return false;
  }

  // If already dismissed or completed, do not auto-offer
  if (progress && (progress.status === 'completed' || progress.status === 'dismissed')) {
    return false;
  }

  // Filter accessible steps
  const available = filterStepsForUser(tour, userContext);
  if (available.length < 2) {
    return false;
  }

  return true;
}
