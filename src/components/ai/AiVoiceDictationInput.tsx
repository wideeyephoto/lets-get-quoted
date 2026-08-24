'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './ai.module.css';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export type AiVoiceDictationInputProps = {
  onTranscript: (text: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
};

export function AiVoiceDictationInput({
  onTranscript,
  label = 'Voice Dictate',
  className = '',
  disabled = false,
}: AiVoiceDictationInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          onTranscript(finalTranscript.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onTranscript]);

  const toggleListening = () => {
    if (!isSupported) {
      const manual = window.prompt('Dictation is not supported in this browser. Enter field notes manually:');
      if (manual && manual.trim()) {
        onTranscript(manual.trim());
      }
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`${styles.voiceBtn} ${isListening ? styles.voiceBtnActive : ''} ${className}`}
      aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
      aria-pressed={isListening}
      title={isListening ? 'Listening... tap to stop' : 'Tap to speak field notes'}
    >
      {isListening ? (
        <span className={styles.waveform} aria-hidden="true">
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
        </span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      )}
      <span>{isListening ? 'Listening...' : label}</span>
    </button>
  );
}
