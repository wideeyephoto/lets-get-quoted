'use client';

import { useState, useRef, useEffect } from 'react';
import type { SanitizedTranscriptTurn } from '@/lib/voice/call-workspace';
import { formatCallLength } from '@/lib/voice/call-formatting';
import styles from './call-detail.module.css';

export default function InteractiveTranscriptViewer({
  callId,
  transcript,
  recordingStatus,
  recordingDurationSeconds,
  isProvisional,
}: {
  callId: string;
  transcript: readonly SanitizedTranscriptTurn[];
  recordingStatus: string;
  recordingDurationSeconds: number | null;
  isProvisional: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null);

  const hasAudio = recordingStatus === 'ready';
  const audioSrc = `/api/voice/recordings/${callId}`;

  // Approximate seconds for turn based on turn index if timestamp is not available
  const estimateTurnSecond = (index: number): number => {
    const turn = transcript[index];
    if (turn?.timestamp !== null && typeof turn?.timestamp === 'number' && turn.timestamp > 0) {
      return turn.timestamp / 1000;
    }
    const totalSec = recordingDurationSeconds || (transcript.length * 6);
    if (transcript.length <= 1) return 0;
    return Math.round((index / transcript.length) * totalSec);
  };

  const handleSeekToTurn = (index: number) => {
    if (!audioRef.current || !hasAudio) return;
    const targetSeconds = estimateTurnSecond(index);
    audioRef.current.currentTime = targetSeconds;
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
    setActiveTurnIndex(index);
  };

  const handleSkip = (offsetSeconds: number) => {
    if (!audioRef.current || !hasAudio) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + offsetSeconds);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    setCurrentTime(current);

    // Identify active turn based on playback time
    if (transcript.length > 0) {
      let foundIndex = 0;
      for (let i = 0; i < transcript.length; i++) {
        if (estimateTurnSecond(i) <= current) {
          foundIndex = i;
        }
      }
      setActiveTurnIndex(foundIndex);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Audio Recording & Playback Controller */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Audio Recording & Controls</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mute-t62, #94a3b8)' }}>
            {hasAudio ? 'Ready (Encrypted & Authenticated)' : recordingStatus === 'pending' ? 'Processing...' : 'Recording Disabled'}
          </span>
        </div>

        {hasAudio ? (
          <div className={styles.audioPlayerContainer}>
            <audio
              ref={audioRef}
              src={audioSrc}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              style={{ width: '100%', height: '36px' }}
              controls
            />

            <div className={styles.audioControlsRow}>
              {/* Skip Controls */}
              <div className={styles.audioBtnGroup}>
                <button
                  type="button"
                  aria-label="Skip backward 15 seconds"
                  className={styles.audioBtn}
                  onClick={() => handleSkip(-15)}
                >
                  ⏪ -15s
                </button>
                <button
                  type="button"
                  aria-label="Skip forward 15 seconds"
                  className={styles.audioBtn}
                  onClick={() => handleSkip(15)}
                >
                  ⏩ +15s
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--mute-t62, #94a3b8)', marginLeft: '0.4rem' }}>
                  {formatCallLength(Math.round(currentTime))} / {formatCallLength(recordingDurationSeconds)}
                </span>
              </div>

              {/* Speed Selector */}
              <div className={styles.audioBtnGroup}>
                <span style={{ fontSize: '0.72rem', color: 'var(--mute-t62, #94a3b8)', marginRight: '0.2rem' }}>
                  Speed:
                </span>
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    aria-label={`Set playback speed to ${rate}x`}
                    className={`${styles.audioBtn} ${playbackRate === rate ? styles.audioBtnActive : ''}`}
                    onClick={() => handleSpeedChange(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--mute-t62, #94a3b8)' }}>
            <p style={{ margin: 0 }}>
              Audio call recording is disabled by default to maintain compliance with multi-party consent regulations. Transcripts are retained per your workspace retention policy.
            </p>
          </div>
        )}
      </div>

      {/* Chronological Dialogue Transcript with Click-to-Seek */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Interactive Conversation Transcript</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--mute-t62, #94a3b8)' }}>
            {transcript.length} turns recorded
          </span>
        </div>

        {transcript.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--mute-t62, #94a3b8)', fontSize: '0.88rem' }}>
            {isProvisional
              ? 'Call in progress. Transcript dialogue will appear here upon completion.'
              : 'No transcript dialogue was retained for this call.'}
          </div>
        ) : (
          <div className={styles.transcriptFeed}>
            {transcript.map((turn, index) => {
              const isAssistant = turn.role === 'assistant';
              const isTurnActive = activeTurnIndex === index && isPlaying;
              const estSecond = estimateTurnSecond(index);

              return (
                <div
                  key={index}
                  className={`${styles.turnBubble} ${isAssistant ? styles.turnAssistant : styles.turnCaller}`}
                  style={{
                    cursor: hasAudio ? 'pointer' : 'default',
                    outline: isTurnActive ? '2px solid rgba(59, 130, 246, 0.6)' : 'none',
                    borderRadius: '12px',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => hasAudio && handleSeekToTurn(index)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className={styles.turnAuthor}>
                      {isAssistant ? '🤖 AI Receptionist' : '👤 Caller'}
                    </span>
                    {hasAudio ? (
                      <button
                        type="button"
                        aria-label={`Jump audio playback to turn ${index + 1}`}
                        className={styles.turnSeekBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSeekToTurn(index);
                        }}
                      >
                        ▶ {formatCallLength(estSecond)}
                      </button>
                    ) : null}
                  </div>
                  <div className={styles.turnBody}>{turn.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
