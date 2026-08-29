'use client';

import { useState } from 'react';

export default function FounderHelpButton({
  founderName = 'Brett',
  founderPhone = '+1 (248) 555-0199',
  className = '',
}: {
  founderName?: string;
  founderPhone?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`founder-help-widget ${className}`}>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Founder Support"
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '24px',
            width: '320px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'linear-gradient(180deg, #132433 0%, #0c1822 100%)',
            border: '1px solid rgba(255, 106, 36, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(255, 106, 36, 0.15)',
            padding: '20px',
            zIndex: 9999,
            color: '#f5f0e7',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 8px #22c55e',
                }}
              />
              <strong style={{ fontSize: '14px', color: '#fff' }}>Direct Founder Support</strong>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8fa0b0',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '4px',
              }}
              aria-label="Close support dialog"
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#a7bcc8', lineHeight: 1.5, margin: '0 0 16px' }}>
            Hey! I&apos;m {founderName}, founder of Let&apos;s Get Quoted. If you have any question or need help setting up your site, quote forms, or field crew, text me directly:
          </p>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '12px', color: '#8fa0b0', display: 'block', marginBottom: '4px' }}>
              Direct Mobile Line
            </span>
            <strong style={{ fontSize: '16px', color: '#ff6a24', letterSpacing: '0.5px' }}>
              {founderPhone}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href={`sms:${founderPhone.replace(/[^0-9+]/g, '')}?body=Hi%20Brett%2C%20I%20just%20signed%20up%20for%20Let%27s%20Get%20Quoted%20and%20had%20a%20question%3A%20`}
              style={{
                flex: 1,
                background: '#ff6a24',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '13px',
                padding: '10px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(255, 106, 36, 0.3)',
              }}
            >
              💬 Text {founderName}
            </a>
            <a
              href={`tel:${founderPhone.replace(/[^0-9+]/g, '')}`}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f5f0e7',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '13px',
                padding: '10px 14px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              📞 Call
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'linear-gradient(135deg, rgba(255, 106, 36, 0.15) 0%, rgba(255, 106, 36, 0.25) 100%)',
          border: '1px solid rgba(255, 106, 36, 0.45)',
          color: '#ff8a4c',
          padding: '7px 14px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
        }}
        title="Need help setting up? Reach founder directly"
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 6px #22c55e',
          }}
        />
        <span>Need help? Text {founderName}</span>
      </button>
    </div>
  );
}
