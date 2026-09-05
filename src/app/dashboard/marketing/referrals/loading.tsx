import MarketingNav from '../MarketingNav';

export default function ReferralsLoading() {
  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-hero panel marketing-hero" style={{ animation: 'pulse 1.5s infinite' }}>
        <div className="workspace-hero-copy">
          <div style={{ height: '14px', width: '120px', background: 'rgba(150, 150, 150, 0.15)', borderRadius: '4px', marginBottom: '8px' }} />
          <div style={{ height: '32px', width: '260px', background: 'rgba(150, 150, 150, 0.2)', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ height: '20px', width: '480px', maxWidth: '100%', background: 'rgba(150, 150, 150, 0.15)', borderRadius: '4px' }} />
        </div>
      </section>

      <section className="panel workspace-section-card" style={{ animation: 'pulse 1.5s infinite', minHeight: '160px' }}>
        <div style={{ height: '24px', width: '160px', background: 'rgba(150, 150, 150, 0.2)', borderRadius: '4px', marginBottom: '12px' }} />
        <div style={{ height: '16px', width: '380px', maxWidth: '100%', background: 'rgba(150, 150, 150, 0.15)', borderRadius: '4px', marginBottom: '20px' }} />
        <div style={{ height: '42px', width: '100%', maxWidth: '500px', background: 'rgba(150, 150, 150, 0.1)', borderRadius: '6px' }} />
      </section>

      <section className="panel workspace-section-card" style={{ animation: 'pulse 1.5s infinite', minHeight: '220px' }}>
        <div style={{ height: '24px', width: '200px', background: 'rgba(150, 150, 150, 0.2)', borderRadius: '4px', marginBottom: '16px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ height: '40px', width: '100%', background: 'rgba(150, 150, 150, 0.12)', borderRadius: '6px' }} />
          <div style={{ height: '40px', width: '100%', background: 'rgba(150, 150, 150, 0.08)', borderRadius: '6px' }} />
          <div style={{ height: '40px', width: '100%', background: 'rgba(150, 150, 150, 0.08)', borderRadius: '6px' }} />
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
