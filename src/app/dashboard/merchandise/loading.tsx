export default function MerchandiseLoading() {
  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      <div
        style={{
          height: '42px',
          width: '280px',
          background: 'rgba(150, 150, 150, 0.1)',
          borderRadius: '8px',
          marginBottom: '1rem',
          animation: 'pulse 1.5s infinite',
        }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: '1.5rem',
          minHeight: '600px',
        }}
      >
        <div
          style={{
            background: 'rgba(150, 150, 150, 0.08)',
            borderRadius: '12px',
            animation: 'pulse 1.5s infinite',
          }}
        />
        <div
          style={{
            background: 'rgba(150, 150, 150, 0.08)',
            borderRadius: '12px',
            animation: 'pulse 1.5s infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
