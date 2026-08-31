'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  type AnnotationTool,
  type AnnotationShape,
  type Point,
  CONTRACTOR_COLORS,
  STROKE_WIDTHS,
  CONTRACTOR_STAMPS,
  QUICK_DIMENSIONS,
  AnnotationHistory,
  drawShapeToCanvas,
  formatContractorMeasurement,
} from '@/lib/photo-annotation-engine';
import styles from './photo-annotator.module.css';

export type PhotoAnnotatorProps = {
  photoUrl: string;
  photoPath?: string;
  scope?: string;
  onSave: (file: File) => Promise<void> | void;
  onClose: () => void;
};

const COMMON_SNIPPETS = [
  '⚠️ Damage / Rot',
  '💧 Water Leak',
  '📏 48" Opening',
  '📏 60" Span',
  '⚡ Electrical Wire',
  '🪚 Demo Line',
  '✓ Approved Scope',
];

export function PhotoAnnotator({
  photoUrl,
  photoPath,
  scope = '',
  onSave,
  onClose,
}: PhotoAnnotatorProps) {
  const [tool, setTool] = useState<AnnotationTool>('arrow');
  const [color, setColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(6);
  const [rotation, setRotation] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // Resolved safe image source (Blob URL or CORS-clean URL to avoid canvas tainting)
  const [resolvedSrc, setResolvedSrc] = useState<string>(photoUrl);

  // Selected stamp ID
  const [selectedStamp, setSelectedStamp] = useState<string>('defect');
  const [showStampMenu, setShowStampMenu] = useState(false);

  // History & Shapes
  const historyRef = useRef<AnnotationHistory>(new AnnotationHistory([]));
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Active interaction drag state
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<Point | null>(null);
  const [currentDraft, setCurrentDraft] = useState<AnnotationShape | null>(null);

  // Text Prompt Modal State
  const [textPromptPos, setTextPromptPos] = useState<Point | null>(null);
  const [textPromptValue, setTextPromptValue] = useState('');

  // Measure Caliper Prompt Modal State
  const [measurePromptShape, setMeasurePromptShape] = useState<AnnotationShape | null>(null);
  const [measurePromptValue, setMeasurePromptValue] = useState('');

  // Canvas & Image Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Convert remote or cross-origin photos into local Blob URLs to eliminate canvas tainting
  useEffect(() => {
    let isMounted = true;
    let objectUrlToRevoke: string | null = null;

    async function resolveImageSource() {
      if (photoUrl.startsWith('data:') || photoUrl.startsWith('blob:')) {
        setResolvedSrc(photoUrl);
        return;
      }

      try {
        // Attempt 1: Direct fetch -> Blob
        const res = await fetch(photoUrl, { mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          objectUrlToRevoke = objUrl;
          if (isMounted) {
            setResolvedSrc(objUrl);
            return;
          }
        }
      } catch {
        // Attempt 2: If direct CORS is blocked, fetch via local backend proxy
        try {
          const proxyRes = await fetch(`/api/lead-photos/proxy?url=${encodeURIComponent(photoUrl)}`);
          if (proxyRes.ok) {
            const blob = await proxyRes.blob();
            const objUrl = URL.createObjectURL(blob);
            objectUrlToRevoke = objUrl;
            if (isMounted) {
              setResolvedSrc(objUrl);
              return;
            }
          }
        } catch {
          // Fallback to original url
        }
      }

      if (isMounted) {
        setResolvedSrc(photoUrl);
      }
    }

    resolveImageSource();

    return () => {
      isMounted = false;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [photoUrl]);

  const syncHistoryState = useCallback(() => {
    setShapes([...historyRef.current.current]);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  const handleUndo = useCallback(() => {
    historyRef.current.undo();
    syncHistoryState();
  }, [syncHistoryState]);

  const handleRedo = useCallback(() => {
    historyRef.current.redo();
    syncHistoryState();
  }, [syncHistoryState]);

  const handleClear = useCallback(() => {
    if (shapes.length === 0) return;
    if (window.confirm('Clear all markups from this photo?')) {
      historyRef.current.clear();
      syncHistoryState();
    }
  }, [shapes.length, syncHistoryState]);

  // Keyboard Shortcuts (ESC, Undo Ctrl+Z, Redo Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textPromptPos) setTextPromptPos(null);
        else if (measurePromptShape) setMeasurePromptShape(null);
        else if (showStampMenu) setShowStampMenu(false);
        else onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleUndo, handleRedo, textPromptPos, measurePromptShape, showStampMenu]);

  // Image load & dimension setup
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({
      width: img.naturalWidth || 800,
      height: img.naturalHeight || 600,
    });
    setImageLoaded(true);
  };

  // Re-draw canvas on shapes or draft changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all committed shapes
    for (const shape of shapes) {
      drawShapeToCanvas(ctx, shape, 1);
    }

    // Draw active drawing shape
    if (currentDraft) {
      drawShapeToCanvas(ctx, currentDraft, 1);
    }
  }, [shapes, currentDraft]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Transform coordinates from mouse/touch event to canvas internal coordinates
  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Pointer Down (Mouse / Touch)
  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);
    startPointRef.current = pt;
    isDrawingRef.current = true;

    if (tool === 'stamp') {
      isDrawingRef.current = false;
      const activeStampDef = CONTRACTOR_STAMPS.find((s) => s.id === selectedStamp) || CONTRACTOR_STAMPS[0];
      const newStamp: AnnotationShape = {
        id: `stamp-${Date.now()}`,
        type: 'stamp',
        position: pt,
        stampId: activeStampDef.id,
        label: activeStampDef.label,
        color: activeStampDef.color,
        strokeWidth: 2,
      };
      historyRef.current.push([...shapes, newStamp]);
      syncHistoryState();
    } else if (tool === 'pen') {
      const newShape: AnnotationShape = {
        id: `pen-${Date.now()}`,
        type: 'pen',
        points: [pt],
        color,
        strokeWidth,
      };
      setCurrentDraft(newShape);
    } else if (tool === 'text') {
      isDrawingRef.current = false;
      setTextPromptPos(pt);
      setTextPromptValue('');
    } else if (tool === 'arrow') {
      setCurrentDraft({
        id: `arrow-${Date.now()}`,
        type: 'arrow',
        start: pt,
        end: pt,
        color,
        strokeWidth,
      });
    } else if (tool === 'rect') {
      setCurrentDraft({
        id: `rect-${Date.now()}`,
        type: 'rect',
        start: pt,
        end: pt,
        color,
        strokeWidth,
      });
    } else if (tool === 'circle') {
      setCurrentDraft({
        id: `circle-${Date.now()}`,
        type: 'circle',
        start: pt,
        end: pt,
        color,
        strokeWidth,
      });
    } else if (tool === 'measure') {
      setCurrentDraft({
        id: `measure-${Date.now()}`,
        type: 'measure',
        start: pt,
        end: pt,
        color,
        strokeWidth,
      });
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !startPointRef.current) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);

    if (tool === 'pen') {
      setCurrentDraft((prev) => {
        if (!prev || prev.type !== 'pen') return prev;
        return {
          ...prev,
          points: [...prev.points, pt],
        };
      });
    } else if (tool === 'arrow' || tool === 'rect' || tool === 'circle' || tool === 'measure') {
      setCurrentDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          end: pt,
        } as AnnotationShape;
      });
    }
  };

  // Pointer Up
  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentDraft) {
      if (currentDraft.type === 'pen' && currentDraft.points.length > 1) {
        historyRef.current.push([...shapes, currentDraft]);
        syncHistoryState();
      } else if (currentDraft.type === 'measure') {
        const dx = currentDraft.end.x - currentDraft.start.x;
        const dy = currentDraft.end.y - currentDraft.start.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          // Open dimension keypad modal to allow exact dimension override
          setMeasurePromptShape(currentDraft);
          setMeasurePromptValue('');
        }
      } else if (currentDraft.type !== 'pen') {
        const dx = (currentDraft as any).end.x - (currentDraft as any).start.x;
        const dy = (currentDraft as any).end.y - (currentDraft as any).start.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          historyRef.current.push([...shapes, currentDraft]);
          syncHistoryState();
        }
      }
    }
    setCurrentDraft(null);
    startPointRef.current = null;
  };

  // Commit Text Callout
  const handleCommitText = (customText?: string) => {
    const finalVal = (customText ?? textPromptValue).trim();
    if (finalVal && textPromptPos) {
      const textShape: AnnotationShape = {
        id: `text-${Date.now()}`,
        type: 'text',
        position: textPromptPos,
        text: finalVal,
        fontSize: Math.max(14, strokeWidth * 2.5),
        color,
        strokeWidth: 2,
      };
      historyRef.current.push([...shapes, textShape]);
      syncHistoryState();
    }
    setTextPromptPos(null);
    setTextPromptValue('');
  };

  // Commit Measure Dimension
  const handleCommitMeasure = (customDimension?: string) => {
    if (measurePromptShape && measurePromptShape.type === 'measure') {
      const formatted = formatContractorMeasurement(customDimension ?? measurePromptValue);
      const finalizedMeasure: AnnotationShape = {
        ...measurePromptShape,
        label: formatted || undefined,
      };
      historyRef.current.push([...shapes, finalizedMeasure]);
      syncHistoryState();
    }
    setMeasurePromptShape(null);
    setMeasurePromptValue('');
  };

  // Rotate Image 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Generate Export Canvas at full resolution using CORS-safe image
  const renderExportCanvas = async (): Promise<HTMLCanvasElement> => {
    const cleanImg = new Image();
    cleanImg.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      cleanImg.onload = () => resolve();
      cleanImg.onerror = () => {
        // Fallback without crossOrigin if needed
        cleanImg.removeAttribute('crossOrigin');
        cleanImg.onload = () => resolve();
        cleanImg.onerror = reject;
        cleanImg.src = resolvedSrc;
      };
      cleanImg.src = resolvedSrc;
    });

    const exportCanvas = document.createElement('canvas');
    const isQuarterRot = rotation === 90 || rotation === 270;
    const naturalW = cleanImg.naturalWidth || imageDimensions.width || 800;
    const naturalH = cleanImg.naturalHeight || imageDimensions.height || 600;

    exportCanvas.width = isQuarterRot ? naturalH : naturalW;
    exportCanvas.height = isQuarterRot ? naturalW : naturalH;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create 2D canvas context');

    ctx.save();
    if (rotation !== 0) {
      ctx.translate(exportCanvas.width / 2, exportCanvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(cleanImg, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
    } else {
      ctx.drawImage(cleanImg, 0, 0, naturalW, naturalH);
    }
    ctx.restore();

    const scaleX = naturalW / imageDimensions.width;
    const scaleY = naturalH / imageDimensions.height;
    const avgScale = (scaleX + scaleY) / 2;

    for (const shape of shapes) {
      drawShapeToCanvas(ctx, shape, avgScale);
    }

    return exportCanvas;
  };

  // 1-Click Local JPG Download
  const handleDownloadLocal = async () => {
    try {
      const canvas = await renderExportCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site_markup_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Could not download image: ${err?.message || 'Error'}`);
    }
  };

  // 1-Click Copy Image to Clipboard
  const handleCopyClipboard = async () => {
    try {
      const canvas = await renderExportCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        alert('✓ Marked-up photo copied to clipboard! (Ready to paste in SMS/chat)');
      } else {
        alert('Clipboard image copy not supported in this browser; please use Download.');
      }
    } catch (err: any) {
      alert(`Could not copy to clipboard: ${err?.message || 'Error'}`);
    }
  };

  // AI Defect Analysis Suggester
  const handleAiAnalyze = async () => {
    setIsAiAnalyzing(true);
    try {
      const res = await fetch('/api/lead-photos/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl,
          imageWidth: imageDimensions.width,
          imageHeight: imageDimensions.height,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze photo');

      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        historyRef.current.push([...shapes, ...data.suggestions]);
        syncHistoryState();
      }
    } catch (err: any) {
      alert(`AI analysis unavailable: ${err?.message || 'Error'}`);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Save to Gallery
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const canvas = await renderExportCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not generate marked-up photo blob');

      const originalName = photoPath?.split('/').pop() || 'photo.jpg';
      const cleanBase = originalName.replace(/\.[^/.]+$/, '');
      const annotatedFile = new File([blob], `${cleanBase}_markup_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      await onSave(annotatedFile);
      onClose();
    } catch (err: any) {
      alert(`Unable to save annotated photo: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlayBackdrop}>
      {/* Top Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleWrap}>
          <span className={styles.title}>
            ✏️ Site Photo Markup &amp; Annotation
          </span>
          <span className={styles.badge}>Live Canvas</span>
        </div>

        <div className={styles.topActions}>
          {/* AI Defect Suggester Button */}
          <button
            type="button"
            className={styles.btnAi}
            onClick={handleAiAnalyze}
            disabled={isAiAnalyzing}
            title="AI automatically detects defects, leaks &amp; damages"
          >
            {isAiAnalyzing ? '✨ Analyzing...' : '✨ AI Detect Defects'}
          </button>

          {/* History Controls */}
          <div className={styles.historyGroup}>
            <button
              type="button"
              className={styles.btnIcon}
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              className={styles.btnIcon}
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
            >
              ↪ Redo
            </button>
            <button
              type="button"
              className={styles.btnIcon}
              onClick={handleClear}
              disabled={shapes.length === 0}
              title="Clear All Markups"
            >
              🗑 Clear
            </button>
          </div>

          <button
            type="button"
            className={styles.btnExport}
            onClick={handleDownloadLocal}
            title="Download JPG to device"
          >
            📥 Download
          </button>

          <button
            type="button"
            className={styles.btnExport}
            onClick={handleCopyClipboard}
            title="Copy image to clipboard"
          >
            📋 Copy
          </button>

          <button
            type="button"
            className={styles.btnIcon}
            onClick={handleRotate}
            title="Rotate 90°"
          >
            🔄 Rotate
          </button>

          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className={styles.btnSave}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : '💾 Save to Gallery'}
          </button>
        </div>
      </div>

      {/* Main Interactive Workspace Viewport */}
      <div className={styles.viewport}>
        <div className={styles.canvasContainer}>
          <img
            ref={imgRef}
            src={resolvedSrc}
            crossOrigin="anonymous"
            alt="Site Inspection"
            className={styles.baseImage}
            onLoad={handleImageLoad}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease',
            }}
          />

          {imageLoaded && (
            <canvas
              ref={canvasRef}
              width={imageDimensions.width}
              height={imageDimensions.height}
              className={styles.annotationCanvas}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          )}
        </div>
      </div>

      {/* Floating Bottom Markup Tools Toolbar */}
      <div className={styles.floatingToolbar}>
        {/* Drawing Tools */}
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'stamp' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('stamp');
              setShowStampMenu((p) => !p);
            }}
            title="Contractor Status Stamp"
          >
            🏷️ Stamp
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'arrow' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('arrow');
              setShowStampMenu(false);
            }}
            title="Pointer Arrow (Highlight damage/defects)"
          >
            ↗️ Arrow
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'pen' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('pen');
              setShowStampMenu(false);
            }}
            title="Freehand Marker / Pen"
          >
            ✏️ Pen
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'rect' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('rect');
              setShowStampMenu(false);
            }}
            title="Bounding Box (Highlight replacement area)"
          >
            🔲 Box
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'circle' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('circle');
              setShowStampMenu(false);
            }}
            title="Circle Highlight"
          >
            ⭕ Circle
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'measure' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('measure');
              setShowStampMenu(false);
            }}
            title="Dimension Caliper Line"
          >
            📏 Caliper
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'text' ? styles.toolBtnActive : ''}`}
            onClick={() => {
              setTool('text');
              setShowStampMenu(false);
            }}
            title="Text Callout Badge"
          >
            💬 Text
          </button>
        </div>

        <div className={styles.divider} />

        {/* Contractor Color Palette */}
        <div className={styles.colorGroup}>
          {CONTRACTOR_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`${styles.colorSwatch} ${color === c.value ? styles.colorSwatchActive : ''}`}
              style={{ backgroundColor: c.value, color: c.value }}
              onClick={() => setColor(c.value)}
              title={c.label}
              aria-label={c.label}
            />
          ))}
        </div>

        <div className={styles.divider} />

        {/* Stroke Sizing */}
        <div className={styles.strokeGroup}>
          {STROKE_WIDTHS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`${styles.strokeBtn} ${strokeWidth === s.value ? styles.strokeBtnActive : ''}`}
              onClick={() => setStrokeWidth(s.value)}
              title={s.label}
            >
              {s.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Stamp Selector Menu Popover */}
      {showStampMenu && (
        <div className={styles.stampPopover}>
          {CONTRACTOR_STAMPS.map((stamp) => (
            <button
              key={stamp.id}
              type="button"
              className={`${styles.stampBtn} ${selectedStamp === stamp.id ? styles.stampBtnActive : ''}`}
              style={{ color: stamp.color, borderColor: stamp.color }}
              onClick={() => {
                setSelectedStamp(stamp.id);
                setTool('stamp');
                setShowStampMenu(false);
              }}
            >
              {stamp.label}
            </button>
          ))}
        </div>
      )}

      {/* Text Callout Modal */}
      {textPromptPos && (
        <div className={styles.textModalBackdrop} onClick={() => setTextPromptPos(null)}>
          <div className={styles.textModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.textModalTitle}>💬 Enter Callout Note</div>

            {/* Quick Contractor Snippets */}
            <div className={styles.snippetsRow}>
              {COMMON_SNIPPETS.map((snip) => (
                <button
                  key={snip}
                  type="button"
                  className={styles.snippetPill}
                  onClick={() => handleCommitText(snip)}
                >
                  {snip}
                </button>
              ))}
            </div>

            <input
              type="text"
              className={styles.textInput}
              placeholder="e.g. Rotted sill plate, replace joist..."
              value={textPromptValue}
              onChange={(e) => setTextPromptValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitText();
                if (e.key === 'Escape') setTextPromptPos(null);
              }}
            />

            <div className={styles.textModalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setTextPromptPos(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnSave}
                onClick={() => handleCommitText()}
              >
                Place Callout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caliper Dimension Prompt Modal */}
      {measurePromptShape && (
        <div className={styles.textModalBackdrop} onClick={() => handleCommitMeasure()}>
          <div className={styles.textModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.textModalTitle}>📏 Specify Real-World Measurement</div>

            {/* Quick Dimension Chips */}
            <div className={styles.snippetsRow}>
              {QUICK_DIMENSIONS.map((dim) => (
                <button
                  key={dim}
                  type="button"
                  className={styles.snippetPill}
                  onClick={() => handleCommitMeasure(dim)}
                >
                  {dim}
                </button>
              ))}
            </div>

            <input
              type="text"
              className={styles.textInput}
              placeholder="e.g. 48 in, 8' 6&quot;, 10 ft..."
              value={measurePromptValue}
              onChange={(e) => setMeasurePromptValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitMeasure();
                if (e.key === 'Escape') setMeasurePromptShape(null);
              }}
            />

            <div className={styles.textModalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => handleCommitMeasure()}
              >
                Skip / Default
              </button>
              <button
                type="button"
                className={styles.btnSave}
                onClick={() => handleCommitMeasure()}
              >
                Set Dimension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
