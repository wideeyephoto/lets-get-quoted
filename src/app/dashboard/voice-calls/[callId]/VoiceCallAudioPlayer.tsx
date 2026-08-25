import { formatCallLength } from '@/lib/voice/call-history';

export default function VoiceCallAudioPlayer({
  callId,
  durationSeconds,
}: {
  callId: string;
  durationSeconds: number | null;
}) {
  const audioSrc = `/api/voice/recordings/${callId}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
          🎙️ Call Audio Recording ({formatCallLength(durationSeconds)})
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--mute-t62, #94a3b8)' }}>
          Encrypted & Authenticated
        </span>
      </div>

      <audio
        controls
        src={audioSrc}
        style={{ width: '100%', height: '40px', outline: 'none' }}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
