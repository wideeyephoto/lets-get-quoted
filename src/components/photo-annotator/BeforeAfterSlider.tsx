'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './before-after-slider.module.css';

export type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  onClose: () => void;
};

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Original Photo',
  afterLabel = 'Marked-Up / After',
  onClose,
}: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState<number>(50); // percentage 0 to 100
  const isDraggingRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateSliderPosFromEvent = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  }, []);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    updateSliderPosFromEvent(clientX);
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      updateSliderPosFromEvent(clientX);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setSliderPos((p) => Math.max(0, p - 5));
      if (e.key === 'ArrowRight') setSliderPos((p) => Math.min(100, p + 5));
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, updateSliderPosFromEvent]);

  return (
    <div className={styles.sliderBackdrop}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.title}>
          <span>🔀 Before &amp; After Comparison</span>
        </div>
        <button type="button" className={styles.btnClose} onClick={onClose}>
          Close (ESC)
        </button>
      </div>

      {/* Main Viewport */}
      <div className={styles.viewport}>
        <div
          ref={containerRef}
          className={styles.container}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          {/* Base Layer: Before Photo */}
          <img src={beforeUrl} alt={beforeLabel} className={styles.imageLayer} />

          {/* Clipped Top Layer: After / Marked-Up Photo */}
          <div
            className={styles.overlayWrapper}
            style={{
              clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
            }}
          >
            <img src={afterUrl} alt={afterLabel} className={styles.overlayImage} />
          </div>

          {/* Divider Line */}
          <div
            className={styles.sliderHandleLine}
            style={{ left: `${sliderPos}%` }}
          >
            <div className={styles.sliderHandleKnob}>
              <span>‹ ›</span>
            </div>
          </div>

          {/* Labels */}
          <div className={styles.labelBefore}>{beforeLabel}</div>
          <div className={styles.labelAfter}>{afterLabel}</div>
        </div>
      </div>
    </div>
  );
}
