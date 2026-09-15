import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveMissingField } from '../src/components/permits/PermitApplicationModal';

describe('PermitApplicationModal UI Contract & Missing Fields Checklist', () => {
  const modalSrc = readFileSync('src/components/permits/PermitApplicationModal.tsx', 'utf8');
  const cssSrc = readFileSync('src/components/permits/PermitApplicationModal.module.css', 'utf8');

  describe('1. Field Resolver & Deep-Links', () => {
    it('maps licenseNumber to Credentials Vault action', () => {
      const res = resolveMissingField('licenseNumber');
      expect(res.actionType).toBe('vault');
      expect(res.label).toBe('State Builder License #');
      expect(res.actionLabel).toContain('Credentials Vault');
    });

    it('maps insuranceCarrier to Credentials Vault action', () => {
      const res = resolveMissingField('insuranceCarrier');
      expect(res.actionType).toBe('vault');
      expect(res.label).toBe('General Liability Insurance Carrier');
      expect(res.actionLabel).toContain('Credentials Vault');
    });

    it('maps fein to Settings tab deep-link', () => {
      const res = resolveMissingField('fein');
      expect(res.actionType).toBe('settings');
      expect(res.label).toBe('Federal Employer ID (FEIN)');
      expect(res.href).toBe('/dashboard/settings#contractor-compliance');
    });

    it('maps stateEmployerNumber to Settings tab deep-link', () => {
      const res = resolveMissingField('stateEmployerNumber');
      expect(res.actionType).toBe('settings');
      expect(res.label).toBe('State Employer / MESC #');
      expect(res.href).toBe('/dashboard/settings#contractor-compliance');
    });

    it('maps ownerName to Job Details deep-link', () => {
      const res = resolveMissingField('ownerName', 'job-123');
      expect(res.actionType).toBe('job');
      expect(res.label).toBe('Property Owner Name');
      expect(res.href).toBe('/dashboard/jobs/job-123');
    });

    it('maps parcelNumber to Job Details deep-link', () => {
      const res = resolveMissingField('parcelNumber', 'job-123');
      expect(res.actionType).toBe('job');
      expect(res.label).toBe('Permanent Parcel ID');
      expect(res.href).toBe('/dashboard/jobs/job-123');
    });
  });

  describe('2. UI Structural Safeguards', () => {
    it('does not contain any generic alert() calls', () => {
      // Must not use alert() for error surfacing
      expect(modalSrc).not.toMatch(/\balert\s*\(/);
    });

    it('defines and renders the inline errorSurface with missing fields checklist', () => {
      expect(modalSrc).toContain('styles.errorSurface');
      expect(modalSrc).toContain('styles.checklistGrid');
      expect(modalSrc).toContain('styles.checklistItem');
      expect(cssSrc).toContain('.errorSurface');
      expect(cssSrc).toContain('.checklistGrid');
      expect(cssSrc).toContain('.checklistItem');
    });

    it('disables Save Draft and Download PDF with clear annotations when readiness is incomplete', () => {
      expect(modalSrc).toContain('!data?.readiness?.complete');
      expect(modalSrc).toContain('Draft saving and PDF generation are disabled');
      expect(modalSrc).toContain('Save Draft disabled: complete required fields to save draft');
      expect(modalSrc).toContain('PDF download disabled: complete required fields to download PDF');
    });
  });
});
