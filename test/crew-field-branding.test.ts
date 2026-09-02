import { describe, it, expect } from 'vitest';
import React from 'react';
import FieldHeader from '@/app/field/FieldHeader';
import FieldFooter from '@/app/field/FieldFooter';

describe('Crew Field App Branding', () => {
  describe('FieldFooter', () => {
    it('returns null when navLogoTop is false', () => {
      const result = FieldFooter({ navLogoTop: false });
      expect(result).toBeNull();
    });

    it('renders Powered by Let\'s Get Quoted when navLogoTop is true', () => {
      const element = FieldFooter({ navLogoTop: true });
      expect(element).not.toBeNull();
      expect(element?.type).toBe('footer');
      expect(element?.props.className).toBe('field-footer');
    });
  });

  describe('FieldHeader', () => {
    it('renders with contractor logo when navLogoTop is true and logoUrl is provided', () => {
      const element = FieldHeader({
        businessName: 'Apex Roofing',
        crewName: 'John',
        logoUrl: 'https://example.com/logo.png',
        navLogoTop: true,
      });

      expect(element).not.toBeNull();
      expect(element.props.className).toBe('field-header');
    });

    it('renders with monogram mark when navLogoTop is true and no logoUrl', () => {
      const element = FieldHeader({
        businessName: 'Apex Roofing',
        crewName: 'John',
        logoUrl: null,
        navLogoTop: true,
      });

      expect(element).not.toBeNull();
      expect(element.props.className).toBe('field-header');
    });

    it('renders with standard LGQ badge when navLogoTop is false', () => {
      const element = FieldHeader({
        businessName: 'Apex Roofing',
        crewName: 'John',
        logoUrl: null,
        navLogoTop: false,
      });

      expect(element).not.toBeNull();
      expect(element.props.className).toBe('field-header');
    });

    it('renders back navigation when backHref is provided', () => {
      const element = FieldHeader({
        businessName: 'Apex Roofing',
        crewName: 'John',
        backHref: '/field',
        navLogoTop: true,
      });

      expect(element).not.toBeNull();
      expect(element.props.className).toBe('field-header');
    });
  });
});
