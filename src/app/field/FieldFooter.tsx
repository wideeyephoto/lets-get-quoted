import React from 'react';
import BrandLogo from '@/components/brand-logo';

/**
 * Field app footer mimicking the owner's navigation footer branding.
 *
 * When Contractor-First mode is ON (navLogoTop = true), the contractor's logo
 * is at the top of the header, and Let's Get Quoted sits proudly at the bottom.
 */
export default function FieldFooter({ navLogoTop = false }: { navLogoTop?: boolean }) {
  if (!navLogoTop) return null;

  return (
    <footer className="field-footer" aria-label="Branding footer">
      <div className="field-footer-brand">
        <BrandLogo size={16} className="field-footer-logo" />
        <span className="field-footer-text">
          Powered by <strong>Let&apos;s Get Quoted</strong>
        </span>
      </div>
    </footer>
  );
}
