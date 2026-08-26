import { describe, it, expect } from 'vitest';
import {
  PUBLIC_DEMO_TOUR,
  DASHBOARD_ORIENTATION_TOUR,
  getTourDefinition,
  getStepById,
  getNextStep,
  getPrevStep,
  filterStepsForUser,
} from '@/lib/product-tour/catalog';
import { canAccessStep, shouldOfferTour } from '@/lib/product-tour/access';
import { sanitizeTourEventPayload } from '@/lib/product-tour/events';
import type { TourUserContext, TourProgressRecord } from '@/lib/product-tour/types';

describe('Product Tour Domain Model', () => {
  describe('Tour Catalog & Sequential Step Traversal', () => {
    it('provides public demo and dashboard orientation tours', () => {
      expect(PUBLIC_DEMO_TOUR.key).toBe('demo-job-lifecycle');
      expect(PUBLIC_DEMO_TOUR.steps).toHaveLength(6);

      expect(DASHBOARD_ORIENTATION_TOUR.key).toBe('dashboard-orientation');
      expect(DASHBOARD_ORIENTATION_TOUR.steps).toHaveLength(6);
    });

    it('resolves tours by key and version', () => {
      const demo = getTourDefinition('demo-job-lifecycle', 1);
      expect(demo).not.toBeNull();
      expect(demo?.title).toBe('5-Minute Job Lifecycle Tour');

      const dashboard = getTourDefinition('dashboard-orientation', 1);
      expect(dashboard).not.toBeNull();
      expect(dashboard?.title).toBe('Dashboard Orientation');

      expect(getTourDefinition('unknown-tour')).toBeNull();
    });

    it('finds steps by id, next step, and previous step', () => {
      const tour = DASHBOARD_ORIENTATION_TOUR;
      const step1 = getStepById(tour, 'dashboard-overview');
      expect(step1).not.toBeNull();
      expect(step1?.route).toBe('/dashboard');

      const next = getNextStep(tour, 'dashboard-overview');
      expect(next?.id).toBe('leads-inbox');

      const prev = getPrevStep(tour, 'leads-inbox');
      expect(prev?.id).toBe('dashboard-overview');

      expect(getPrevStep(tour, 'dashboard-overview')).toBeNull();
      expect(getNextStep(tour, 'automations-overview')).toBeNull();
    });
  });

  describe('Role and Capability Access Control', () => {
    it('grants owner access to all dashboard steps including owner-only ones', () => {
      const ownerCtx: TourUserContext = {
        role: 'owner',
        userId: 'user_123',
        accountId: 'acc_456',
      };

      const steps = filterStepsForUser(DASHBOARD_ORIENTATION_TOUR, ownerCtx);
      expect(steps).toHaveLength(6);
      expect(steps.map((s) => s.id)).toEqual([
        'dashboard-overview',
        'leads-inbox',
        'jobs-board',
        'schedule-workbench',
        'website-builder',
        'automations-overview',
      ]);
    });

    it('filters out owner-only steps and capability-gated steps for office users', () => {
      const officeUserWithoutSettings: TourUserContext = {
        role: 'office',
        userId: 'user_office',
        accountId: 'acc_456',
        capabilities: new Set(['leads.read', 'jobs.read']),
      };

      const steps = filterStepsForUser(DASHBOARD_ORIENTATION_TOUR, officeUserWithoutSettings);
      // Excludes owner-only 'dashboard-overview', and 'website-builder' + 'automations-overview' which need settings.write
      expect(steps.map((s) => s.id)).toEqual([
        'leads-inbox',
        'jobs-board',
        'schedule-workbench',
      ]);
    });

    it('correctly evaluates shouldOfferTour based on status and available steps', () => {
      const ownerCtx: TourUserContext = {
        role: 'owner',
        userId: 'user_123',
        accountId: 'acc_456',
      };

      // Unstarted -> offer
      expect(shouldOfferTour(DASHBOARD_ORIENTATION_TOUR, null, ownerCtx)).toBe(true);

      // Active progress -> offer (resume)
      const activeProgress: TourProgressRecord = {
        account_id: 'acc_456',
        user_id: 'user_123',
        tour_key: 'dashboard-orientation',
        tour_version: 1,
        status: 'active',
        current_step_id: 'leads-inbox',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dismissed_at: null,
        completed_at: null,
      };
      expect(shouldOfferTour(DASHBOARD_ORIENTATION_TOUR, activeProgress, ownerCtx)).toBe(true);

      // Completed or dismissed -> do not offer
      expect(
        shouldOfferTour(
          DASHBOARD_ORIENTATION_TOUR,
          { ...activeProgress, status: 'completed' },
          ownerCtx,
        ),
      ).toBe(false);

      expect(
        shouldOfferTour(
          DASHBOARD_ORIENTATION_TOUR,
          { ...activeProgress, status: 'dismissed' },
          ownerCtx,
        ),
      ).toBe(false);
    });
  });

  describe('Event Payload Sanitization and PII Prevention', () => {
    it('accepts valid non-PII telemetry payload', () => {
      const raw = {
        client_event_id: 'cl_12345',
        tour_key: 'dashboard-orientation',
        tour_version: 1,
        event_type: 'step_viewed',
        step_id: 'leads-inbox',
        metadata: {
          stepSlug: 'leads',
          targetId: 'leads:workspace',
        },
      };

      const { valid, sanitized } = sanitizeTourEventPayload(raw);
      expect(valid).toBe(true);
      expect(sanitized?.client_event_id).toBe('cl_12345');
      expect(sanitized?.event_type).toBe('step_viewed');
      expect(sanitized?.metadata?.targetId).toBe('leads:workspace');
    });

    it('strips PII fields from metadata', () => {
      const raw = {
        client_event_id: 'cl_12345',
        event_type: 'step_completed',
        metadata: {
          stepSlug: 'leads',
          email: 'homeowner@example.com',
          phone: '555-123-4567',
          customer_name: 'Jane Doe',
          credit_card: '4111222233334444',
          password: 'secret',
        },
      };

      const { valid, sanitized } = sanitizeTourEventPayload(raw);
      expect(valid).toBe(true);
      expect(sanitized?.metadata?.stepSlug).toBe('leads');
      expect(sanitized?.metadata?.email).toBeUndefined();
      expect(sanitized?.metadata?.phone).toBeUndefined();
      expect(sanitized?.metadata?.customer_name).toBeUndefined();
      expect(sanitized?.metadata?.credit_card).toBeUndefined();
    });

    it('rejects disallowed event names or malformed payloads', () => {
      const invalidEvent = {
        client_event_id: 'cl_123',
        event_type: 'custom_unauthorized_event',
      };

      const result = sanitizeTourEventPayload(invalidEvent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disallowed event type');
    });
  });
});
