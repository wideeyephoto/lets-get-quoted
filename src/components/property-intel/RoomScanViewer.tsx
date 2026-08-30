'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  type RoomSpatialScan,
  type RoomDimensionsSummary,
  type FlooringFinish,
  type WallFinish,
  SAMPLE_ROOM_SCANS,
  calculateRoomSummary,
  calculateMaterialCosts,
  calculateSupplyHousePickList,
  formatSupplyHousePickListText,
  formatSpatialTakeoffReport,
  FLOORING_RATES,
  WALL_RATES,
} from '@/lib/property-intel/room-spatial-intel';
import styles from './room-scan-viewer.module.css';

export type RoomScanViewerProps = {
  scan?: RoomSpatialScan;
  className?: string;
  onApplyDimensions?: (summary: RoomDimensionsSummary) => void;
};

export function RoomScanViewer({
  scan: initialScan,
  className = '',
  onApplyDimensions,
}: RoomScanViewerProps) {
  const [selectedScanId, setSelectedScanId] = useState<string>(
    initialScan?.id || SAMPLE_ROOM_SCANS[0].id
  );
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [visualStyle, setVisualStyle] = useState<'neon' | 'blueprint' | 'studio'>('neon');
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [showSupplyHouse, setShowSupplyHouse] = useState(false);

  // Material finish simulation state
  const [selectedFlooring, setSelectedFlooring] = useState<FlooringFinish>('tile');
  const [selectedWall, setSelectedWall] = useState<WallFinish>('paint');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active scan
  const activeScan = useMemo(() => {
    if (initialScan && initialScan.id === selectedScanId) {
      return initialScan;
    }
    return SAMPLE_ROOM_SCANS.find((s) => s.id === selectedScanId) || SAMPLE_ROOM_SCANS[0];
  }, [initialScan, selectedScanId]);

  const summary = useMemo(() => calculateRoomSummary(activeScan), [activeScan]);
  const costs = useMemo(
    () => calculateMaterialCosts(summary, selectedFlooring, selectedWall),
    [summary, selectedFlooring, selectedWall]
  );
  const supplyHouseItems = useMemo(
    () => calculateSupplyHousePickList(summary, activeScan),
    [summary, activeScan]
  );

  // Canvas ref & interaction state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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

  // Tape Measure Click Interaction
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!measureMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - rect.width / 2;
    const clickZ = e.clientY - rect.top - rect.height / 2;

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
  };

  // 3D Canvas Rendering Loop
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

      // Room dimensions in world scale (approx 120-180 inches wide)
      const wall1Len = activeScan.walls[0]?.lengthInches || 120;
      const wall2Len = activeScan.walls[1]?.lengthInches || 120;
      const roomH = activeScan.ceilingHeightInches || 96;

      const baseScale = Math.min(width, height) / 280;
      const scale = baseScale * cameraRef.current.zoom;

      const wX = (wall1Len / 2) * scale;
      const wZ = (wall2Len / 2) * scale;
      const wY = roomH * scale;

      // 3D Projection math
      const radX = (viewMode === '3d' ? cameraRef.current.rotX : 90) * (Math.PI / 180);
      const radY = (viewMode === '3d' ? cameraRef.current.rotY : 0) * (Math.PI / 180);

      const project = (x: number, y: number, z: number) => {
        if (viewMode === '2d') {
          return { px: centerX + x, py: centerY + z };
        }
        // Rotate around Y axis
        const x1 = x * Math.cos(radY) + z * Math.sin(radY);
        const z1 = -x * Math.sin(radY) + z * Math.cos(radY);

        // Rotate around X axis
        const y2 = y * Math.cos(radX) - z1 * Math.sin(radX);
        const z2 = y * Math.sin(radX) + z1 * Math.cos(radX);

        const fov = 600;
        const pScale = fov / (fov + z2);

        return {
          px: centerX + x1 * pScale,
          py: centerY - y2 * pScale,
        };
      };

      // Styling Palette by visualStyle
      const isStudio = visualStyle === 'studio';
      const isBlueprint = visualStyle === 'blueprint';

      const primaryColor = isStudio ? '#0284c7' : isBlueprint ? '#38bdf8' : '#38bdf8';
      const gridColor = isStudio
        ? 'rgba(15, 23, 42, 0.08)'
        : isBlueprint
        ? 'rgba(56, 189, 248, 0.15)'
        : 'rgba(56, 189, 248, 0.12)';
      const wallFill = isStudio
        ? 'rgba(2, 132, 199, 0.04)'
        : isBlueprint
        ? 'rgba(14, 165, 233, 0.1)'
        : 'rgba(14, 165, 233, 0.08)';

      // 1. Draw Ground Grid & LiDAR Points
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

      // Simulated LiDAR Point Cloud on Floor
      ctx.fillStyle = isStudio ? 'rgba(2, 132, 199, 0.5)' : 'rgba(56, 189, 248, 0.6)';
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

      // Floor polygon fill
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

      // In 3D mode: Draw Upper Ceiling Corners & Vertical Wall Planes
      if (viewMode === '3d') {
        const u00 = project(-wX, wY, -wZ);
        const u10 = project(wX, wY, -wZ);
        const u11 = project(wX, wY, wZ);
        const u01 = project(-wX, wY, wZ);

        // Semi-transparent wall panels
        const drawWall = (
          b1: { px: number; py: number },
          b2: { px: number; py: number },
          t2: { px: number; py: number },
          t1: { px: number; py: number }
        ) => {
          ctx.beginPath();
          ctx.moveTo(b1.px, b1.py);
          ctx.lineTo(b2.px, b2.py);
          ctx.lineTo(t2.px, t2.py);
          ctx.lineTo(t1.px, t1.py);
          ctx.closePath();
          ctx.fillStyle = isStudio ? 'rgba(15, 23, 42, 0.02)' : 'rgba(255, 255, 255, 0.03)';
          ctx.fill();
          ctx.strokeStyle = isStudio ? 'rgba(2, 132, 199, 0.25)' : 'rgba(56, 189, 248, 0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        };

        drawWall(c00, c10, u10, u00);
        drawWall(c10, c11, u11, u10);
        drawWall(c11, c01, u01, u11);
        drawWall(c01, c00, u00, u01);

        // Vertical Wall Edges
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.5;
        [[c00, u00], [c10, u10], [c11, u11], [c01, u01]].forEach(([b, t]) => {
          ctx.beginPath();
          ctx.moveTo(b.px, b.py);
          ctx.lineTo(t.px, t.py);
          ctx.stroke();
        });

        // Top Ceiling Perimeter
        ctx.strokeStyle = isStudio ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(u00.px, u00.py);
        ctx.lineTo(u10.px, u10.py);
        ctx.lineTo(u11.px, u11.py);
        ctx.lineTo(u01.px, u01.py);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Laser Sweep Wave Animation
        const laserCurrentY = cameraRef.current.laserY * wY;
        const l00 = project(-wX, laserCurrentY, -wZ);
        const l10 = project(wX, laserCurrentY, -wZ);
        const l11 = project(wX, laserCurrentY, wZ);
        const l01 = project(-wX, laserCurrentY, wZ);

        ctx.beginPath();
        ctx.moveTo(l00.px, l00.py);
        ctx.lineTo(l10.px, l10.py);
        ctx.lineTo(l11.px, l11.py);
        ctx.lineTo(l01.px, l01.py);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(74, 222, 128, 0.05)';
        ctx.fill();

        // 4. Draw 3D Objects (e.g., Shower / Bathtub / Vanity)
        for (const obj of activeScan.objects) {
          const oW = (obj.dimensionsInches.width / 2) * scale;
          const oD = (obj.dimensionsInches.depth / 2) * scale;
          const oH = obj.dimensionsInches.height * scale;

          const ox = wX - oW;
          const oz = 0;

          const ob1 = project(ox - oW, 0, oz - oD);
          const ob4 = project(ox - oW, 0, oz + oD);

          const ot1 = project(ox - oW, oH, oz - oD);
          const ot2 = project(ox + oW, oH, oz - oD);
          const ot3 = project(ox + oW, oH, oz + oD);
          const ot4 = project(ox - oW, oH, oz + oD);

          ctx.fillStyle = 'rgba(255, 122, 33, 0.2)';
          ctx.strokeStyle = '#ff7a21';
          ctx.lineWidth = 1.2;

          // Top face
          ctx.beginPath();
          ctx.moveTo(ot1.px, ot1.py);
          ctx.lineTo(ot2.px, ot2.py);
          ctx.lineTo(ot3.px, ot3.py);
          ctx.lineTo(ot4.px, ot4.py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Front face
          ctx.beginPath();
          ctx.moveTo(ob1.px, ob1.py);
          ctx.lineTo(ob4.px, ob4.py);
          ctx.lineTo(ot4.px, ot4.py);
          ctx.lineTo(ot1.px, ot1.py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Object Label Tag
          ctx.fillStyle = isStudio ? '#0f172a' : '#f8fafc';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(obj.label, ot1.px, ot1.py - 6);
        }
      }

      // 5. Tape Measure Points & Caliper
      if (measurePoints.length > 0) {
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;

        measurePoints.forEach((pt) => {
          ctx.beginPath();
          ctx.arc(centerX + pt.x, centerY + pt.z, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        if (measurePoints.length === 2) {
          const p1 = measurePoints[0];
          const p2 = measurePoints[1];
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(centerX + p1.x, centerY + p1.z);
          ctx.lineTo(centerX + p2.x, centerY + p2.z);
          ctx.stroke();
          ctx.setLineDash([]);

          if (measureDistance != null) {
            const midX = (centerX + p1.x + centerX + p2.x) / 2;
            const midY = (centerY + p1.z + centerY + p2.z) / 2 - 8;
            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`📏 ${measureDistance}" (${(measureDistance / 12).toFixed(1)} ft)`, midX, midY);
          }
        }
      }

      // 6. Dimension Calipers & Floating Text
      ctx.fillStyle = primaryColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';

      const midSouth = project(0, 0, wZ + (viewMode === '2d' ? 14 : 8));
      ctx.fillText(`${(wall1Len / 12).toFixed(1)}' span (${wall1Len}")`, midSouth.px, midSouth.py);

      const midWest = project(-wX - (viewMode === '2d' ? 22 : 14), 0, 0);
      ctx.fillText(`${(wall2Len / 12).toFixed(1)}' (${wall2Len}")`, midWest.px, midWest.py);

      if (viewMode === '3d') {
        const midH = project(-wX - 10, roomH / 2, -wZ);
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`${(roomH / 12).toFixed(1)}' ceiling`, midH.px, midH.py);
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
  }, [activeScan, viewMode, visualStyle, measurePoints, measureDistance]);

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
    const reportText = formatSpatialTakeoffReport(activeScan, summary, costs);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(reportText);
      setToastMessage('✓ Copied Spatial Takeoff Report!');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleCopyPickList = () => {
    const pickListText = formatSupplyHousePickListText(activeScan, supplyHouseItems);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(pickListText);
      setToastMessage('✓ Copied Supply House Pick-List!');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  return (
    <div className={`${styles.container} ${className}`}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>
            <span className={styles.pulseDot} />
            3D LiDAR Room Spatial Scan
          </span>
          <span className={styles.badgeLidar}>
            {activeScan.device.includes('LiDAR') ? 'Apple RoomPlan LiDAR' : 'Spatial Scan'}
          </span>
          <span className={styles.badgeConfidence}>
            {activeScan.confidenceScore}% CAD Precision
          </span>
        </div>

        <div className={styles.controlsWrap}>
          {/* Preset Selector */}
          <select
            className={styles.presetSelect}
            value={selectedScanId}
            onChange={(e) => {
              setSelectedScanId(e.target.value);
              setMeasurePoints([]);
              setMeasureDistance(null);
            }}
            aria-label="Select Scanned Room"
          >
            {SAMPLE_ROOM_SCANS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          {/* Style Mode (Neon / Blueprint / Studio) */}
          <div className={styles.stylePicker}>
            <button
              type="button"
              className={`${styles.styleBtn} ${visualStyle === 'neon' ? styles.styleBtnActive : ''}`}
              onClick={() => setVisualStyle('neon')}
              title="LiDAR Neon Dark Mode"
            >
              Neon
            </button>
            <button
              type="button"
              className={`${styles.styleBtn} ${visualStyle === 'blueprint' ? styles.styleBtnActive : ''}`}
              onClick={() => setVisualStyle('blueprint')}
              title="CAD Blueprint Mode"
            >
              CAD
            </button>
            <button
              type="button"
              className={`${styles.styleBtn} ${visualStyle === 'studio' ? styles.styleBtnActive : ''}`}
              onClick={() => setVisualStyle('studio')}
              title="Clean Studio Light Mode"
            >
              Studio
            </button>
          </div>

          {/* 3D vs 2D CAD Toggle */}
          <div className={styles.toggleGroup} role="group" aria-label="View Mode">
            <button
              type="button"
              className={`${styles.toggleBtn} ${viewMode === '3d' ? styles.toggleBtnActive : ''}`}
              onClick={() => setViewMode('3d')}
            >
              3D Mesh
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${viewMode === '2d' ? styles.toggleBtnActive : ''}`}
              onClick={() => setViewMode('2d')}
            >
              2D CAD
            </button>
          </div>
        </div>
      </div>

      {/* 3D Viewport */}
      <div
        className={`${styles.viewportArea} ${
          visualStyle === 'blueprint'
            ? styles.viewportAreaBlueprint
            : visualStyle === 'studio'
            ? styles.viewportAreaStudio
            : ''
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        title={
          measureMode
            ? 'Click any 2 points on the canvas to measure distance'
            : 'Click and drag to rotate in 3D, scroll to zoom'
        }
      >
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* HUD Info */}
        <div className={styles.hudOverlay}>
          <div className={styles.hudChip}>
            PTS: {activeScan.pointCount.toLocaleString()} · SCAN DENSITY: HIGH
          </div>
          <div className={styles.hudChip}>
            CEILING: {summary.ceilingHeightFt} FT · PERIMETER: {summary.perimeterLinearFt} LF
          </div>
        </div>

        {/* HUD Controls */}
        <div className={styles.hudRightControls}>
          <button
            type="button"
            className={`${styles.iconBtn} ${measureMode ? styles.iconBtnActive : ''}`}
            onClick={() => {
              setMeasureMode((prev) => !prev);
              setMeasurePoints([]);
              setMeasureDistance(null);
            }}
            title="Toggle Laser Tape Measure Mode"
          >
            📏 {measureMode ? 'Tape Active' : 'Measure Tape'}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={resetCamera}
            title="Reset Camera Angle"
          >
            ↺ Reset
          </button>
        </div>

        {measureMode && (
          <div className={styles.measureAlert}>
            <span>📏 Tape Measure:</span>
            {measurePoints.length === 0 && 'Click point 1 on room floor'}
            {measurePoints.length === 1 && 'Click point 2 to measure span'}
            {measurePoints.length === 2 &&
              `Measured: ${measureDistance}" (${(
                (measureDistance || 0) / 12
              ).toFixed(1)} ft)`}
          </div>
        )}

        <div className={styles.canvasHint}>
          {viewMode === '3d' ? '✦ Drag to orbit · Scroll to zoom' : '✦ 2D CAD Floor Plan'}
        </div>
      </div>

      {/* Material Finish Simulator */}
      <div className={styles.materialBar}>
        <div className={styles.materialGroup}>
          <span className={styles.materialLabel}>Flooring:</span>
          <select
            className={styles.materialSelect}
            value={selectedFlooring}
            onChange={(e) => setSelectedFlooring(e.target.value as FlooringFinish)}
            aria-label="Select Flooring Finish"
          >
            {Object.entries(FLOORING_RATES).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.materialGroup}>
          <span className={styles.materialLabel}>Walls:</span>
          <select
            className={styles.materialSelect}
            value={selectedWall}
            onChange={(e) => setSelectedWall(e.target.value as WallFinish)}
            aria-label="Select Wall Finish"
          >
            {Object.entries(WALL_RATES).map(([key, w]) => (
              <option key={key} value={key}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.estimatePill}>
          Est. Takeoff: ${costs.totalEstimatedTakeoff.toLocaleString()}
        </div>
      </div>

      {/* Calculated Takeoff Metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Floor Area</span>
          <div className={styles.metricValue}>
            {summary.floorAreaSqFt} <span className={styles.metricUnit}>sq ft</span>
          </div>
          <span className={styles.metricSubtext}>Flooring / tile takeoff</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Net Wall Area</span>
          <div className={styles.metricValue}>
            {summary.netPaintableWallSqFt} <span className={styles.metricUnit}>sq ft</span>
          </div>
          <span className={styles.metricSubtext}>Excl. {summary.openingsAreaSqFt} sq ft doors/windows</span>
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

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Baseboard Trim</span>
          <div className={styles.metricValue}>
            {summary.baseboardLinearFt} <span className={styles.metricUnit}>lin ft</span>
          </div>
          <span className={styles.metricSubtext}>{summary.doorsCount} doors deducted</span>
        </div>
      </div>

      {/* Supply House Materials Drawer */}
      <div className={styles.supplyHouseToggleWrap}>
        <button
          type="button"
          className={styles.supplyToggleBtn}
          onClick={() => setShowSupplyHouse((prev) => !prev)}
          aria-expanded={showSupplyHouse}
        >
          <span>
            📦 Supply House Materials Pick-List ({supplyHouseItems.length} items with 10–15% waste)
          </span>
          <span>{showSupplyHouse ? '▲ Hide Materials' : '▼ View Materials & Ordering Quantities'}</span>
        </button>
      </div>

      {showSupplyHouse && (
        <div className={styles.supplyHouseContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)' }}>
              Vendor-ready packaging quantities with automated pattern cut &amp; miter waste factors.
            </span>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleCopyPickList}
              style={{ fontSize: '0.72rem', padding: '0.24rem 0.6rem' }}
            >
              📋 Copy Vendor Order Text
            </button>
          </div>

          <div className={styles.supplyGrid}>
            {supplyHouseItems.map((item, idx) => (
              <div key={idx} className={styles.supplyCard}>
                <span className={styles.supplyCategory}>{item.category}</span>
                <div className={styles.supplyItemHeader}>
                  <span className={styles.supplyItemName}>{item.name}</span>
                  <span className={styles.supplyQuantity}>
                    {item.quantity} {item.unit}
                  </span>
                </div>
                <span className={styles.supplyWaste}>{item.wasteFactor}</span>
                {item.notes && <span className={styles.supplyNotes}>{item.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quote Integration & Actions Bar */}
      <div className={styles.actionsBar}>
        <div className={styles.actionsLeft}>
          <span>
            Scanned {activeScan.scannedAt} via {activeScan.device}
          </span>
          {toastMessage && <span className={styles.toast}>{toastMessage}</span>}
        </div>

        <div className={styles.actionsRight}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCopyReport}
            title="Copy formatted Bill-of-Materials report to clipboard"
          >
            📋 Copy Takeoff
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCopyPickList}
            title="Copy vendor materials pick-list"
          >
            📦 Copy Pick-List
          </button>
          <button
            type="button"
            className={styles.btnApply}
            onClick={() => handleApply('all')}
            title="Feed exact 3D dimensions to AI Quote Generator"
          >
            ⚡ Sync to AI Quote Draft
          </button>
        </div>
      </div>
    </div>
  );
}
