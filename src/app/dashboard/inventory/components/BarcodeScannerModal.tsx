'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Search, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import AccessibleModal from './AccessibleModal';
import styles from '../inventory.module.css';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  async function startCamera() {
    setCameraError(null);
    setScanning(true);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setHasCamera(false);
        setCameraError('Camera access is not supported by your browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        detectBarcodeLoop();
      }
    } catch (err: unknown) {
      setHasCamera(false);
      setCameraError('Camera permission denied or camera unavailable. You can enter the tag manually below.');
    }
  }

  function stopCamera() {
    setScanning(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function detectBarcodeLoop() {
    // Check if BarcodeDetector is supported in window
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;

    if (!BarcodeDetectorClass) {
      return;
    }

    try {
      const detector = new BarcodeDetectorClass({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a', 'upc_e'],
      });

      const scan = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(scan);
          return;
        }

        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              stopCamera();
              onDetected(raw);
              onClose();
              return;
            }
          }
        } catch {
          // ignore detection frame errors
        }

        animFrameRef.current = requestAnimationFrame(scan);
      };

      animFrameRef.current = requestAnimationFrame(scan);
    } catch {
      // BarcodeDetector failed to instantiate
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    stopCamera();
    onDetected(clean);
    onClose();
  }

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="Scan Equipment Barcode or QR Code"
      subtitle="Point camera at tool asset tag or enter ID manually"
      maxWidth="520px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        {hasCamera && !cameraError ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4/3',
              borderRadius: '10px',
              overflow: 'hidden',
              background: '#090d16',
              border: '2px dashed rgba(255, 122, 33, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              playsInline
              muted
            />

            {/* Reticle / aiming guide */}
            <div
              style={{
                position: 'absolute',
                width: '65%',
                height: '50%',
                border: '2px solid #ff7a21',
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                pointerEvents: 'none',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: '0.85rem',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fef3c7',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span>{cameraError || 'Camera offline. Use manual entry below.'}</span>
          </div>
        )}

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--inv-text-muted)' }}>
            Enter Asset Tag / SKU / Serial Manually
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. TAG-MIL-042 or SKU-VALVE-75"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className={styles.fieldInput}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit" className={styles.btnPrimary} style={{ flexShrink: 0 }}>
              Find Asset
            </button>
          </div>
        </form>
      </div>
    </AccessibleModal>
  );
}
