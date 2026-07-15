'use client';

import type { TemplateProps } from '@/lib/templates/types';

export default function CarbonTemplate({ site, portfolioJobs = [] }: TemplateProps) {
  const accentColor = site.accent_override || '#1f2937'; // Default dark gray
  const isDark = site.portal_mode === 'dark';
  const bgColor = isDark ? '#111827' : '#ffffff';
  const textColor = isDark ? '#f3f4f6' : '#1f2937';
  const mutedColor = isDark ? '#d1d5db' : '#6b7280';

  return (
    <div style={{ backgroundColor: bgColor, color: textColor, fontFamily: site.header_font || 'system-ui, -apple-system, sans-serif' }}>
      {/* Navigation */}
      <nav
        style={{
          backgroundColor: isDark ? '#1f2937' : '#f9fafb',
          borderBottomWidth: '1px',
          borderBottomColor: isDark ? '#374151' : '#e5e7eb',
          padding: '1rem 0',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {site.logo_url ? (
            <img src={site.logo_url} alt={site.company_name} style={{ height: '40px', maxWidth: '200px' }} />
          ) : (
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{site.company_name}</h1>
          )}
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {site.phone && (
              <a href={`tel:${site.phone}`} style={{ color: accentColor, textDecoration: 'none', fontWeight: '500' }}>
                {site.phone}
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          backgroundImage: site.hero_url ? `url(${site.hero_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: site.hero_url ? undefined : accentColor,
          minHeight: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Overlay for text readability */}
        {site.hero_url && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />}

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', color: 'white', maxWidth: '800px', padding: '2rem' }}>
          <h2 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>{site.headline || site.company_name}</h2>
          <p style={{ fontSize: '1.25rem', marginBottom: '2rem', opacity: 0.9 }}>{site.tagline || 'Professional services for your project'}</p>
          <a
            href="#contact"
            style={{
              backgroundColor: accentColor,
              color: 'white',
              padding: '1rem 2rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              display: 'inline-block',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Request a Quote
          </a>
        </div>
      </section>

      {/* About Section */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>About Us</h3>
            <p style={{ color: mutedColor, lineHeight: '1.6', marginBottom: '1rem' }}>
              With {site.license && `license ${site.license}`} and years of experience, we bring quality and professionalism to every project.
            </p>
            {site.service_area && (
              <p style={{ color: mutedColor, lineHeight: '1.6' }}>
                <strong>Service Area:</strong> {site.service_area}
              </p>
            )}
            {site.hours && (
              <p style={{ color: mutedColor, lineHeight: '1.6', marginTop: '1rem' }}>
                <strong>Hours:</strong> {site.hours}
              </p>
            )}
          </div>
          <div
            style={{
              backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
              padding: '2rem',
              borderRadius: '0.75rem',
            }}
          >
            <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Why Choose Us?</h4>
            <ul style={{ color: mutedColor, lineHeight: '1.8', paddingLeft: '1.5rem' }}>
              <li>Professional & Licensed</li>
              <li>Quality Craftsmanship</li>
              <li>On-Time Completion</li>
              <li>Transparent Pricing</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      {portfolioJobs && portfolioJobs.length > 0 && (
        <section
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '4rem 1.5rem',
            backgroundColor: isDark ? '#1f2937' : '#f9fafb',
          }}
        >
          <h3 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '3rem', textAlign: 'center' }}>Recent Projects</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {portfolioJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  backgroundColor: isDark ? '#111827' : 'white',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ padding: '1.5rem' }}>
                  <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{job.ref}</h4>
                  <p style={{ color: mutedColor, marginBottom: '1rem' }}>{job.client_name}</p>
                  <p style={{ color: mutedColor, marginBottom: '0.5rem' }}>{job.address}</p>
                  <p style={{ color: accentColor, fontWeight: '500' }}>{job.status}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section id="contact" style={{ maxWidth: '1200px', margin: '0 auto', padding: '4rem 1.5rem' }}>
        <h3 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', textAlign: 'center' }}>Get Started</h3>
        <div
          style={{
            backgroundColor: isDark ? '#1f2937' : '#f9fafb',
            padding: '3rem',
            borderRadius: '0.75rem',
            textAlign: 'center',
            maxWidth: '600px',
            margin: '0 auto',
          }}
        >
          <p style={{ color: mutedColor, marginBottom: '2rem', lineHeight: '1.6' }}>
            Ready to bring your project to life? Contact us today for a free quote.
          </p>
          {site.phone && (
            <p style={{ marginBottom: '1rem' }}>
              <strong>Call us:</strong>{' '}
              <a href={`tel:${site.phone}`} style={{ color: accentColor, textDecoration: 'none' }}>
                {site.phone}
              </a>
            </p>
          )}
          <a
            href="/request-quote"
            style={{
              backgroundColor: accentColor,
              color: 'white',
              padding: '1rem 2rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 'bold',
              display: 'inline-block',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Request a Quote
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: isDark ? '#111827' : '#1f2937',
          color: 'white',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          marginTop: '4rem',
        }}
      >
        <p style={{ margin: 0 }}>
          &copy; {new Date().getFullYear()} {site.company_name}. All rights reserved.
        </p>
        <p style={{ margin: '0.5rem 0 0 0', opacity: 0.7, fontSize: '0.875rem' }}>
          Powered by Let&apos;s Get Quoted
        </p>
      </footer>
    </div>
  );
}
