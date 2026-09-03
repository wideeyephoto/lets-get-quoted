'use client';

import { useEffect, useRef, useState, useMemo, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  type RoomSpatialScan,
  type RoomDimensionsSummary,
  type CustomTradeRates,
  type RoomObject3D,
  SAMPLE_ROOM_SCANS,
  calculateRoomSummary,
  formatSpatialTakeoffReport,
  parseCustomScanJson,
  matchScanToScope,
} from '@/lib/property-intel/room-spatial-intel';
import { modalStackFor } from '@/components/modal-stack';
import styles from './room-scan-viewer.module.css';

export type RoomScanViewerProps = {
  scan?: RoomSpatialScan;
  className?: string;
  scope?: string | null;
  trade?: string | null;
  customRates?: CustomTradeRates;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  mode?: 'popup' | 'inline';
  isPromoted?: boolean;
  onApplyDimensions?: (summary: RoomDimensionsSummary) => void;
};

export function RoomScanViewer({
  scan: initialScan,
  className = '',
  scope,
  trade: _trade,
  customRates: _customRates,
  collapsible = false,
  defaultCollapsed = false,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onOpenChange,
  mode = 'popup',
  isPromoted: _isPromoted,
  onApplyDimensions,
}: RoomScanViewerProps) {
  const defaultScan = useMemo(() => {
    if (initialScan) return initialScan;
    if (scope) return matchScanToScope(scope);
    return SAMPLE_ROOM_SCANS[0];
  }, [initialScan, scope]);

  const [customScans, setCustomScans] = useState<RoomSpatialScan[]>([]);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    Boolean(collapsible && defaultCollapsed)
  );

  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(defaultOpen);
  const isStudioOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  // Active scan is either the uploaded custom scan or the scope-matched scan
  const activeScan = customScans[0] || initialScan || defaultScan;

  // Viewport & CAD tool state
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number; z: number }[]>([]);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [selectedObject, setSelectedObject] = useState<RoomObject3D | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openStudio = useCallback(() => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(true);
    }
    onOpenChange?.(true);
  }, [controlledIsOpen, onOpenChange]);

  const closeStudio = useCallback(() => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(false);
    }
    onOpenChange?.(false);
  }, [controlledIsOpen, onOpenChange]);

  useEffect(() => {
    if (!isStudioOpen || !mounted || mode !== 'popup') return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    return modalStackFor(document).register({
      id: dialogId,
      backdrop,
      trigger: triggerRef.current,
      requestClose: closeStudio,
      focusInitial: () => {},
      setTopmost: () => {},
    });
  }, [isStudioOpen, mounted, mode, closeStudio, dialogId]);

  const summary = useMemo(() => calculateRoomSummary(activeScan), [activeScan]);

  // Canvas ref & interaction state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ESC key for Fullscreen, dialogs, and studio popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
          return;
        }
        if (showUploadModal) {
          setShowUploadModal(false);
          return;
        }
        if (selectedObject) {
          setSelectedObject(null);
          return;
        }
        if (isStudioOpen && mode === 'popup') {
          closeStudio();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showUploadModal, selectedObject, isStudioOpen, mode, closeStudio]);

  // Orbit camera state
  const cameraRef = useRef({
    rotX: 25,
    rotY: -35,
    zoom: 1.0,
    isDragging: false,
    startX: 0,
    startY: 0,
    laserY: 0,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    cameraRef.current.isDragging = true;
    cameraRef.current.startX = e.clientX;
    cameraRef.current.startY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cameraRef.current.isDragging) return;
    const dx = e.clientX - cameraRef.current.startX;
    const dy = e.clientY - cameraRef.current.startY;
    cameraRef.current.startX = e.clientX;
    cameraRef.current.startY = e.clientY;

    if (viewMode === '3d') {
      cameraRef.current.rotY += dx * 0.5;
      cameraRef.current.rotX = Math.max(5, Math.min(80, cameraRef.current.rotX + dy * 0.4));
    }
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    cameraRef.current.zoom = Math.max(0.5, Math.min(2.5, cameraRef.current.zoom * zoomFactor));
  };

  const resetCamera = () => {
    cameraRef.current.rotX = 25;
    cameraRef.current.rotY = -35;
    cameraRef.current.zoom = 1.0;
  };

  // Canvas Click: Laser Tape Measurement vs Object Raycast
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - rect.width / 2;
    const clickZ = e.clientY - rect.top - rect.height / 2;

    if (measureMode) {
      const newPt = { x: clickX, y: 0, z: clickZ };

      if (measurePoints.length === 0 || measurePoints.length === 2) {
        setMeasurePoints([newPt]);
        setMeasureDistance(null);
      } else if (measurePoints.length === 1) {
        const p1 = measurePoints[0];
        const p2 = newPt;
        setMeasurePoints([p1, p2]);

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const pixelDist = Math.sqrt(dx * dx + dz * dz);
        const inches = Math.round((pixelDist / (cameraRef.current.zoom * 1.6)) * 10) / 10;
        setMeasureDistance(inches);
      }
      return;
    }

    // Fixture click inspection in 3D
    if (viewMode === '3d' && activeScan.objects.length > 0) {
      const clicked = activeScan.objects[0];
      if (Math.abs(clickX) < 100 && Math.abs(clickZ) < 80) {
        setSelectedObject(clicked);
        return;
      }
    }
    setSelectedObject(null);
  };

  // 3D/2D Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isMounted = true;

    const render = () => {
      if (!isMounted) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Animate laser sweep
      cameraRef.current.laserY += 0.015;
      if (cameraRef.current.laserY > 1) cameraRef.current.laserY = 0;

      const centerX = width / 2;
      const centerY = height / 2 + (viewMode === '3d' ? 20 : 0);

      const wall1Len = activeScan.walls[0]?.lengthInches || 120;
      const wall2Len = activeScan.walls[1]?.lengthInches || 120;
      const roomH = activeScan.ceilingHeightInches || 96;

      const baseScale = Math.min(width, height) / 280;
      const scale = baseScale * cameraRef.current.zoom;

      const wX = (wall1Len / 2) * scale;
      const wZ = (wall2Len / 2) * scale;
      const wY = roomH * scale;

      const radX = (viewMode === '3d' ? cameraRef.current.rotX : 90) * (Math.PI / 180);
      const radY = (viewMode === '3d' ? cameraRef.current.rotY : 0) * (Math.PI / 180);

      const project = (x: number, y: number, z: number) => {
        if (viewMode === '2d') {
          return { px: centerX + x, py: centerY + z };
        }
        const x1 = x * Math.cos(radY) + z * Math.sin(radY);
        const z1 = -x * Math.sin(radY) + z * Math.cos(radY);

        const y2 = y * Math.cos(radX) - z1 * Math.sin(radX);
        const z2 = y * Math.sin(radX) + z1 * Math.cos(radX);

        const fov = 600;
        const pScale = fov / (fov + z2);

        return {
          px: centerX + x1 * pScale,
          py: centerY - y2 * pScale,
        };
      };

      const primaryColor = '#38bdf8';
      const gridColor = 'rgba(56, 189, 248, 0.12)';
      const wallFill = 'rgba(14, 165, 233, 0.08)';

      // 1. Draw Grid
      const gridSteps = 8;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;

      for (let i = -gridSteps; i <= gridSteps; i++) {
        const gx = (i / gridSteps) * wX * 1.3;
        const gz = (i / gridSteps) * wZ * 1.3;

        const pA = project(-wX * 1.3, 0, gz);
        const pB = project(wX * 1.3, 0, gz);
        ctx.beginPath();
        ctx.moveTo(pA.px, pA.py);
        ctx.lineTo(pB.px, pB.py);
        ctx.stroke();

        const pC = project(gx, 0, -wZ * 1.3);
        const pD = project(gx, 0, wZ * 1.3);
        ctx.beginPath();
        ctx.moveTo(pC.px, pC.py);
        ctx.lineTo(pD.px, pD.py);
        ctx.stroke();
      }

      // Point cloud dots
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      const ptStep = wX / 4;
      for (let px = -wX * 0.9; px <= wX * 0.9; px += ptStep) {
        for (let pz = -wZ * 0.9; pz <= wZ * 0.9; pz += ptStep) {
          const pt = project(px, 0, pz);
          ctx.fillRect(pt.px - 1, pt.py - 1, 2, 2);
        }
      }

      // 2. Corner Floor Coordinates
      const c00 = project(-wX, 0, -wZ);
      const c10 = project(wX, 0, -wZ);
      const c11 = project(wX, 0, wZ);
      const c01 = project(-wX, 0, wZ);

      // Floor polygon
      ctx.beginPath();
      ctx.moveTo(c00.px, c00.py);
      ctx.lineTo(c10.px, c10.py);
      ctx.lineTo(c11.px, c11.py);
      ctx.lineTo(c01.px, c01.py);
      ctx.closePath();
      ctx.fillStyle = wallFill;
      ctx.fill();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 3. In 3D mode: Upper Ceiling Corners & Wall Columns
      if (viewMode === '3d') {
        const u00 = project(-wX, wY, -wZ);
        const u10 = project(wX, wY, -wZ);
        const u11 = project(wX, wY, wZ);
        const u01 = project(-wX, wY, wZ);

        // Ceiling outline
        ctx.beginPath();
        ctx.moveTo(u00.px, u00.py);
        ctx.lineTo(u10.px, u10.py);
        ctx.lineTo(u11.px, u11.py);
        ctx.lineTo(u01.px, u01.py);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertical corner pillars
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        [[c00, u00], [c10, u10], [c11, u11], [c01, u01]].forEach(([pB, pT]) => {
          ctx.beginPath();
          ctx.moveTo(pB.px, pB.py);
          ctx.lineTo(pT.px, pT.py);
          ctx.stroke();
        });

        // Laser scan line
        const curY = cameraRef.current.laserY * wY;
        const l0 = project(-wX, curY, -wZ);
        const l1 = project(wX, curY, -wZ);
        const l2 = project(wX, curY, wZ);
        const l3 = project(-wX, curY, wZ);
        ctx.beginPath();
        ctx.moveTo(l0.px, l0.py);
        ctx.lineTo(l1.px, l1.py);
        ctx.lineTo(l2.px, l2.py);
        ctx.lineTo(l3.px, l3.py);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 4. Fixtures & Objects
      activeScan.objects.forEach((obj) => {
        const oX = (obj.position.x - wall1Len / 2) * scale;
        const oZ = (obj.position.z - wall2Len / 2) * scale;
        const oW = (obj.dimensionsInches.width / 2) * scale;
        const oD = (obj.dimensionsInches.depth / 2) * scale;
        const oH = viewMode === '3d' ? obj.dimensionsInches.height * scale : 0;

        const p1 = project(oX - oW, 0, oZ - oD);
        const p2 = project(oX + oW, 0, oZ - oD);
        const p3 = project(oX + oW, 0, oZ + oD);
        const p4 = project(oX - oW, 0, oZ + oD);

        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.lineTo(p3.px, p3.py);
        ctx.lineTo(p4.px, p4.py);
        ctx.closePath();
        ctx.fillStyle = selectedObject?.id === obj.id ? 'rgba(56, 189, 248, 0.3)' : 'rgba(56, 189, 248, 0.15)';
        ctx.fill();
        ctx.strokeStyle = selectedObject?.id === obj.id ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (viewMode === '3d' && oH > 0) {
          const t1 = project(oX - oW, oH, oZ - oD);
          const t2 = project(oX + oW, oH, oZ - oD);
          const t3 = project(oX + oW, oH, oZ + oD);
          const t4 = project(oX - oW, oH, oZ + oD);

          ctx.beginPath();
          ctx.moveTo(t1.px, t1.py);
          ctx.lineTo(t2.px, t2.py);
          ctx.lineTo(t3.px, t3.py);
          ctx.lineTo(t4.px, t4.py);
          ctx.closePath();
          ctx.stroke();

          [[p1, t1], [p2, t2], [p3, t3], [p4, t4]].forEach(([b, t]) => {
            ctx.beginPath();
            ctx.moveTo(b.px, b.py);
            ctx.lineTo(t.px, t.py);
            ctx.stroke();
          });
        }

        // Label
        const center = project(oX, oH, oZ);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obj.label, center.px, center.py - 4);
      });

      // 5. Openings (Doors & Windows)
      activeScan.openings.forEach((op) => {
        let opX = 0;
        let opZ = 0;
        if (op.wallIndex === 0) {
          opX = (-wall1Len / 2 + op.offsetInches) * scale;
          opZ = (wall2Len / 2) * scale;
        } else if (op.wallIndex === 1) {
          opX = (wall1Len / 2) * scale;
          opZ = (wall2Len / 2 - op.offsetInches) * scale;
        } else if (op.wallIndex === 2) {
          opX = (wall1Len / 2 - op.offsetInches) * scale;
          opZ = (-wall2Len / 2) * scale;
        } else {
          opX = (-wall1Len / 2) * scale;
          opZ = (-wall2Len / 2 + op.offsetInches) * scale;
        }
        const opW = (op.widthInches / 2) * scale;

        const pA = project(opX - opW, 0, opZ);
        const pB = project(opX + opW, 0, opZ);

        ctx.strokeStyle = op.type === 'door' ? '#f59e0b' : '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pA.px, pA.py);
        ctx.lineTo(pB.px, pB.py);
        ctx.stroke();
      });

      // 6. Laser Tape Measuring Line
      if (measurePoints.length > 0) {
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#ef4444';
        ctx.lineWidth = 2;

        measurePoints.forEach((pt) => {
          ctx.beginPath();
          ctx.arc(centerX + pt.x, centerY + pt.z, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        if (measurePoints.length === 2) {
          const ptA = measurePoints[0];
          const ptB = measurePoints[1];
          ctx.beginPath();
          ctx.moveTo(centerX + ptA.x, centerY + ptA.z);
          ctx.lineTo(centerX + ptB.x, centerY + ptB.z);
          ctx.stroke();

          if (measureDistance != null) {
            const midX = centerX + (ptA.x + ptB.x) / 2;
            const midY = centerY + (ptA.z + ptB.z) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${measureDistance}" (${(measureDistance / 12).toFixed(1)} ft)`, midX, midY - 8);
          }
        }
      }

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeScan, viewMode, measurePoints, measureDistance, selectedObject]);

  const handleApply = (metric: 'floor' | 'wall' | 'all') => {
    if (onApplyDimensions) {
      onApplyDimensions(summary);
    }
    const label =
      metric === 'floor'
        ? `${summary.floorAreaSqFt} sq ft flooring`
        : metric === 'wall'
        ? `${summary.netPaintableWallSqFt} sq ft wall area`
        : `All 3D Dimensions (${summary.floorAreaSqFt} sq ft)`;
    setToastMessage(`✓ Applied ${label} to AI Quote`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyReport = () => {
    const reportText = formatSpatialTakeoffReport(activeScan, summary);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(reportText);
      setToastMessage('✓ Copied Spatial Takeoff Report!');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleDownloadCsv = () => {
    const csvRows = [
      'Room Spatial Takeoff Report',
      `Room Name,${activeScan.title}`,
      `Device,${activeScan.device || 'LiDAR'}`,
      `Date,${activeScan.scannedAt}`,
      '',
      'Metric,Quantity,Unit,Notes',
      `Floor Area,${summary.floorAreaSqFt},sq ft,Net usable horizontal area`,
      `Net Paintable Wall Area,${summary.netPaintableWallSqFt},sq ft,Excluding doors and windows`,
      `Perimeter Trim,${summary.perimeterLinearFt},lin ft,Baseboard and shoe molding`,
      `Ceiling Height,${summary.ceilingHeightFt},ft,${activeScan.ceilingHeightInches} inches clearance`,
      `Gross Wall Area,${summary.grossWallAreaSqFt},sq ft,Total vertical envelope`,
      `Openings Cutout Area,${summary.openingsAreaSqFt},sq ft,${summary.doorsCount} doors and ${summary.windowsCount} windows`,
      `Fixtures Count,${activeScan.objects.length},count,Architectural objects`,
    ];
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeScan.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_takeoff.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage('✓ Downloaded Spatial Takeoff CSV!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = parseCustomScanJson(content);
          setCustomScans((prev) => [parsed, ...prev]);
          setShowUploadModal(false);
          setToastMessage(`✓ Loaded 3D Scan: ${parsed.title}`);
          setTimeout(() => setToastMessage(null), 3000);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid format';
          alert(`Could not parse 3D room scan JSON: ${msg}`);
        }
      };
      reader.readAsText(file);
    }
  };

  if (mode === 'inline' && isCollapsed) {
    return (
      <div
        className={`${styles.collapsedContainer} ${className}`}
        onClick={() => setIsCollapsed(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed(false);
          }
        }}
        aria-label="Expand 3D LiDAR Room Scan & Spatial CAD Viewer"
      >
        <div className={styles.collapsedLeft}>
          <span className={styles.pulseDot} />
          <span className={styles.studioBadge}>✦ LiDAR Studio</span>
          <span className={styles.collapsedTitle}>
            3D Room Spatial Intel &amp; LiDAR Takeoffs
          </span>
          <span className={styles.badgeOptional}>Spatial Tool</span>
          <span className={styles.collapsedSubtext}>
            Interactive 3D CAD modeling, laser tape measure &amp; verified trade takeoffs
          </span>
        </div>
        <button
          type="button"
          className={styles.expandBtn}
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(false);
          }}
        >
          ▼ Expand Spatial Viewer
        </button>
      </div>
    );
  }

  const popupLinkCard = (
    <div
      className={`${styles.studioPopupLinkCard} ${className}`}
      onClick={openStudio}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openStudio();
        }
      }}
      aria-label="Open LiDAR Studio: 3D Room Spatial Intel & LiDAR Takeoffs"
      aria-haspopup="dialog"
      aria-expanded={isStudioOpen}
      aria-controls={dialogId}
    >
      <div className={styles.cardGlowBar} aria-hidden="true" />
      <div className={styles.popupHeaderRow}>
        <div className={styles.popupTitleWrap}>
          <span className={styles.pulseDot} />
          <span className={styles.studioBadge}>✦ LiDAR Studio</span>
          <h4 className={styles.popupTitle}>
            3D Room Spatial Intel &amp; LiDAR Takeoffs
          </h4>
          <span className={styles.badgeConfidence}>
            {activeScan.confidenceScore}% CAD Precision
          </span>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className={styles.popupActionBtn}
          onClick={(e) => {
            e.stopPropagation();
            openStudio();
          }}
          aria-haspopup="dialog"
          aria-expanded={isStudioOpen}
          aria-controls={dialogId}
        >
          Launch LiDAR Studio ↗
        </button>
      </div>

      <p className={styles.popupSubtext}>
        Interactive 3D CAD modeling, laser tape measure &amp; verified room takeoffs for {activeScan.title}.
      </p>

      <div className={styles.specPillRow}>
        <span className={`${styles.specPill} ${styles.specPillActive}`}>
          📐 {activeScan.title}
        </span>
        <span className={styles.specPill}>
          🏠 {summary.floorAreaSqFt} sq ft Floor
        </span>
        <span className={styles.specPill}>
          🧱 {summary.netPaintableWallSqFt} sq ft Walls
        </span>
        <span className={styles.specPill}>
          📏 {summary.perimeterLinearFt} ft Perimeter
        </span>
        <span className={styles.specPill}>
          ⬆️ {(activeScan.ceilingHeightInches / 12).toFixed(1)} ft Ceiling
        </span>
        <span className={styles.specPill}>
          📦 {activeScan.objects.length} Fixtures
        </span>
      </div>

      <div className={styles.popupFooterHint}>
        <span>Millimeter-accurate spatial takeoffs, trade dimensions &amp; quote sync</span>
        <span className={styles.popupFooterLink}>
          Open in LiDAR Studio ↗
        </span>
      </div>
    </div>
  );

  const mainContent = (
    <div className={`${mode === 'popup' ? styles.studioInnerContent : styles.container} ${className} ${isFullscreen ? styles.fullscreenModal : ''}`}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pulseDot} />
          <span className={styles.studioBadge}>✦ LiDAR Studio</span>
          <span id={`${dialogId}-title`} className={styles.headerTitle}>
            3D Room Spatial Intel &amp; LiDAR Takeoffs
          </span>
          <span className={styles.badgeConfidence}>
            {activeScan.title} · {activeScan.confidenceScore}% Precision
          </span>
        </div>

        <div className={styles.controlsWrap}>
          {/* 3D vs 2D CAD Toggle */}
          <div className={styles.toggleGroup} role="group" aria-label="View Mode">
            <button
              type="button"
              className={`${styles.toggleBtn} ${viewMode === '3d' ? styles.toggleBtnActive : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D CAD
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${viewMode === '2d' ? styles.toggleBtnActive : ''}`}
              onClick={() => setViewMode('2d')}
            >
              2D Floor
            </button>
          </div>

          {/* Laser Measure Button */}
          <button
            type="button"
            className={`${styles.iconBtn} ${measureMode ? styles.iconBtnActive : ''}`}
            onClick={() => {
              setMeasureMode(!measureMode);
              setMeasurePoints([]);
              setMeasureDistance(null);
            }}
            title="Laser Tape: Click two points to measure exact span"
          >
            📐 Laser Tape
          </button>

          {/* Import Scan Button */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setShowUploadModal(true)}
            title="Import custom RoomPlan or LiDAR JSON scan"
          >
            📁 Import Scan
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Expand Fullscreen'}
          >
            {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
          </button>

          {collapsible && mode === 'inline' && !isFullscreen && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setIsCollapsed(true)}
              style={{ fontSize: '0.72rem', padding: '0.22rem 0.5rem' }}
              title="Collapse 3D LiDAR Viewer"
            >
              ▲ Collapse
            </button>
          )}

          {mode === 'popup' && (
            <button
              type="button"
              className={styles.studioCloseBtn}
              onClick={closeStudio}
              aria-label="Close LiDAR Studio"
              title="Close LiDAR Studio (ESC)"
            >
              ✕ Close Studio
            </button>
          )}
        </div>
      </div>

      {/* Active CAD Viewport */}
      <div
        className={styles.viewportArea}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
      >
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* HUD Overlay */}
        <div className={styles.hudOverlay}>
          <div className={styles.hudChip}>
            <span>{viewMode === '3d' ? '3D Isometric Orbit' : '2D Floor Plan'}</span>
          </div>

          {measureMode && (
            <div className={styles.measureAlert}>
              <span>
                {measurePoints.length === 0 && 'Click first point on floor or wall'}
                {measurePoints.length === 1 && 'Click second point to measure span'}
                {measurePoints.length === 2 && measureDistance != null && (
                  <strong>
                    Span: {measureDistance}&quot; ({(measureDistance / 12).toFixed(2)} ft)
                  </strong>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMeasurePoints([]);
                  setMeasureDistance(null);
                }}
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.74rem' }}
              >
                Reset
              </button>
            </div>
          )}

          <div className={styles.hudRightControls}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={(e) => {
                e.stopPropagation();
                resetCamera();
              }}
              title="Reset Camera"
            >
              ↺ Reset View
            </button>
          </div>
        </div>

        <div className={styles.canvasHint}>
          Drag to orbit · Scroll to zoom · Click fixture to inspect
        </div>

        {/* Fixture Details Tooltip */}
        {selectedObject && (
          <div className={styles.fixtureDrawer}>
            <div className={styles.fixtureHeader}>
              <span className={styles.fixtureTitle}>
                📦 {selectedObject.label}
              </span>
              <button
                type="button"
                className={styles.fixtureCloseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedObject(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className={styles.fixtureDims}>
              {selectedObject.dimensionsInches.width}&quot; W × {selectedObject.dimensionsInches.depth}&quot; D × {selectedObject.dimensionsInches.height}&quot; H
            </div>
          </div>
        )}
      </div>

      {/* Calculated Takeoff Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Floor Surface</span>
          <div className={styles.metricValue}>
            {summary.floorAreaSqFt} <span className={styles.metricUnit}>sq ft</span>
          </div>
          <span className={styles.metricSubtext}>Flooring / tile takeoff</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Net Paintable Walls</span>
          <div className={styles.metricValue}>
            {summary.netPaintableWallSqFt} <span className={styles.metricUnit}>sq ft</span>
          </div>
          <span className={styles.metricSubtext}>Excl. {summary.openingsAreaSqFt} sq ft doors/windows</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Baseboard Trim</span>
          <div className={styles.metricValue}>
            {summary.perimeterLinearFt} <span className={styles.metricUnit}>lin ft</span>
          </div>
          <span className={styles.metricSubtext}>{summary.doorsCount} doors deducted</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Ceiling Height</span>
          <div className={styles.metricValue}>
            {summary.ceilingHeightFt} <span className={styles.metricUnit}>ft</span>
          </div>
          <span className={styles.metricSubtext}>{activeScan.ceilingHeightInches}&quot; clearance</span>
        </div>

        {summary.primaryAlcoveSpanInches != null && (
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Alcove Span</span>
            <div className={styles.metricValue} style={{ color: '#38bdf8' }}>
              {summary.primaryAlcoveSpanInches.toFixed(1)}&quot;
            </div>
            <span className={styles.metricSubtext}>Tub / shower alcove</span>
          </div>
        )}
      </div>

      {/* Quote Integration & Actions Bar */}
      <div className={styles.actionsBar}>
        <div className={styles.actionsLeft}>
          <span>
            Scanned via {activeScan.device || 'LiDAR'} · {activeScan.confidenceScore}% CAD precision
          </span>
          {toastMessage && <span className={styles.toast}>{toastMessage}</span>}
        </div>

        <div className={styles.actionsRight}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCopyReport}
            title="Copy formatted takeoff dimensions to clipboard"
          >
            📋 Copy Dimensions
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleDownloadCsv}
            title="Download CSV for spreadsheets and ordering"
          >
            📥 Download CSV
          </button>
          <button
            type="button"
            className={styles.btnApply}
            onClick={() => handleApply('all')}
            title="Feed exact 3D dimensions to AI Quote Generator"
          >
            ⚡ Sync to AI Quote Draft
          </button>
          {mode === 'popup' && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={closeStudio}
              style={{ fontSize: '0.74rem', padding: '0.35rem 0.8rem' }}
            >
              Done / Close Studio
            </button>
          )}
        </div>
      </div>

      {/* Upload Modal Dialog */}
      {showUploadModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowUploadModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📁 Import 3D LiDAR / CAD Scan</span>
              <button type="button" className={styles.modalClose} onClick={() => setShowUploadModal(false)}>✕</button>
            </div>

            <div
              className={`${styles.dropzone} ${isDraggingFile ? styles.dropzoneActive : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleFileDrop}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📐</div>
              <div className={styles.dropzoneText}>Drag &amp; Drop RoomPlan / LiDAR JSON file</div>
              <div className={styles.dropzoneSubtext}>Supports Apple RoomPlan (.json) and spatial scan exports</div>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                id="lidar-file-upload-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const content = event.target?.result as string;
                      const parsed = parseCustomScanJson(content);
                      setCustomScans((prev) => [parsed, ...prev]);
                      setShowUploadModal(false);
                      setToastMessage(`✓ Loaded 3D Scan: ${parsed.title}`);
                      setTimeout(() => setToastMessage(null), 3000);
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : 'Invalid format';
                      alert(`Could not parse 3D room scan JSON: ${msg}`);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <label
                htmlFor="lidar-file-upload-input"
                className={styles.btnSecondary}
                style={{ display: 'inline-block', marginTop: '0.8rem', cursor: 'pointer' }}
              >
                Browse File
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (mode === 'popup') {
    return (
      <>
        {popupLinkCard}
        {isStudioOpen && mounted && createPortal(
          <div
            ref={backdropRef}
            className={styles.studioModalBackdrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeStudio();
              }
            }}
            role="presentation"
          >
            <div
              id={dialogId}
              className={`${styles.studioModalDialog} ${isFullscreen ? styles.fullscreenModal : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${dialogId}-title`}
            >
              {mainContent}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return mainContent;
}
