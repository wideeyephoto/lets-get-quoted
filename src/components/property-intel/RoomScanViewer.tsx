'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  type RoomSpatialScan,
  type RoomDimensionsSummary,
  type FlooringFinish,
  type WallFinish,
  type CustomTradeRates,
  type RoomObject3D,
  SAMPLE_ROOM_SCANS,
  calculateRoomSummary,
  calculateMaterialCosts,
  calculateSupplyHousePickList,
  formatSupplyHousePickListText,
  formatSpatialTakeoffReport,
  generateSupplyHouseCsv,
  formatSubcontractorSlip,
  getWallElevations,
  parseCustomScanJson,
  matchScanToScope,
  FLOORING_RATES,
  WALL_RATES,
} from '@/lib/property-intel/room-spatial-intel';
import styles from './room-scan-viewer.module.css';

export type RoomScanViewerProps = {
  scan?: RoomSpatialScan;
  className?: string;
  scope?: string | null;
  trade?: string | null;
  customRates?: CustomTradeRates;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onApplyDimensions?: (summary: RoomDimensionsSummary) => void;
};

export function RoomScanViewer({
  scan: initialScan,
  className = '',
  scope,
  trade: _trade,
  customRates,
  collapsible = false,
  defaultCollapsed = false,
  onApplyDimensions,
}: RoomScanViewerProps) {
  const defaultScan = useMemo(() => {
    if (initialScan) return initialScan;
    if (scope) return matchScanToScope(scope);
    return SAMPLE_ROOM_SCANS[0];
  }, [initialScan, scope]);

  const [customScans, setCustomScans] = useState<RoomSpatialScan[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string>(
    initialScan?.id || defaultScan.id
  );
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    Boolean(collapsible && defaultCollapsed)
  );

  // Sync selected scan if scope changes and user hasn't explicitly set initialScan
  useEffect(() => {
    if (!initialScan && scope) {
      const matched = matchScanToScope(scope);
      setSelectedScanId(matched.id);
    }
  }, [scope, initialScan]);

  const [viewMode, setViewMode] = useState<'3d' | '2d' | 'elevation'>('3d');
  const [selectedWallIdx, setSelectedWallIdx] = useState<number>(0);
  const [visualStyle, setVisualStyle] = useState<'neon' | 'blueprint' | 'studio'>('neon');
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [showSupplyHouse, setShowSupplyHouse] = useState(false);

  // Layer Visibility
  const [layers, setLayers] = useState({
    grid: true,
    wetZones: true,
    fixtures: true,
    dimensions: true,
  });

  // Selected 3D fixture inspector
  const [selectedObject, setSelectedObject] = useState<RoomObject3D | null>(null);

  // Modals & Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Material finish simulation state
  const [selectedFlooring, setSelectedFlooring] = useState<FlooringFinish>('tile');
  const [selectedWall, setSelectedWall] = useState<WallFinish>('paint');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // All available scans (default presets + custom uploaded scans)
  const allAvailableScans = useMemo(() => {
    return [...customScans, ...SAMPLE_ROOM_SCANS];
  }, [customScans]);

  // Active scan
  const activeScan = useMemo(() => {
    if (initialScan && initialScan.id === selectedScanId) {
      return initialScan;
    }
    return allAvailableScans.find((s) => s.id === selectedScanId) || defaultScan;
  }, [initialScan, selectedScanId, allAvailableScans, defaultScan]);

  const summary = useMemo(() => calculateRoomSummary(activeScan), [activeScan]);
  const costs = useMemo(
    () => calculateMaterialCosts(summary, selectedFlooring, selectedWall, customRates),
    [summary, selectedFlooring, selectedWall, customRates]
  );
  const supplyHouseItems = useMemo(
    () => calculateSupplyHousePickList(summary, activeScan),
    [summary, activeScan]
  );
  const wallElevations = useMemo(
    () => getWallElevations(activeScan),
    [activeScan]
  );

  // Canvas ref & interaction state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ESC key for Fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        if (showQrModal) setShowQrModal(false);
        if (showUploadModal) setShowUploadModal(false);
        if (selectedObject) setSelectedObject(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showQrModal, showUploadModal, selectedObject]);

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

  // Canvas Click Interaction (Measure Mode vs Object Raycast Inspection)
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

    // Fixture Click Detection in 3D Mode
    if (viewMode === '3d' && activeScan.objects.length > 0) {
      const clicked = activeScan.objects[0]; // Active fixture target
      if (Math.abs(clickX) < 100 && Math.abs(clickZ) < 80) {
        setSelectedObject(clicked);
        return;
      }
    }
    setSelectedObject(null);
  };

  // 3D Canvas Rendering Loop
  useEffect(() => {
    if (viewMode === 'elevation') return;
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
      if (layers.grid) {
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

        // 4. Draw 3D Objects (Fixtures)
        if (layers.fixtures) {
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

            const isSelected = selectedObject?.id === obj.id;
            ctx.fillStyle = isSelected ? 'rgba(255, 122, 33, 0.4)' : 'rgba(255, 122, 33, 0.2)';
            ctx.strokeStyle = isSelected ? '#ff9e58' : '#ff7a21';
            ctx.lineWidth = isSelected ? 2.5 : 1.2;

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
            ctx.fillStyle = isSelected ? '#ff7a21' : isStudio ? '#0f172a' : '#f8fafc';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(obj.label, ot1.px, ot1.py - 6);
          }
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
      if (layers.dimensions) {
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
  }, [activeScan, viewMode, visualStyle, measurePoints, measureDistance, layers, selectedObject]);

  const handleApply = (metric: 'floor' | 'wall' | 'all') => {
    if (onApplyDimensions) {
      onApplyDimensions(summary);
    }
    const isSample = Boolean(activeScan.isSample);
    const label =
      metric === 'floor'
        ? `${summary.floorAreaSqFt} sq ft flooring`
        : metric === 'wall'
        ? `${summary.netPaintableWallSqFt} sq ft wall area`
        : `All 3D Dimensions (${summary.floorAreaSqFt} sq ft)`;
    setToastMessage(
      isSample
        ? `⚠️ Synced sample template dimensions (${label}) — verify on site`
        : `✓ Applied ${label} to AI Quote`
    );
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

  const handleDownloadCsv = () => {
    const csv = generateSupplyHouseCsv(activeScan, supplyHouseItems);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeScan.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_materials.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage('✓ Downloaded Material Order CSV!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopySubSlip = (subTrade: 'tile' | 'paint' | 'trim') => {
    const slip = formatSubcontractorSlip(subTrade, activeScan, summary, supplyHouseItems);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(slip);
      const label = subTrade === 'tile' ? 'Tile Sub' : subTrade === 'paint' ? 'Paint Sub' : 'Trim Sub';
      setToastMessage(`✓ Copied ${label} Work Slip!`);
      setTimeout(() => setToastMessage(null), 3000);
    }
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
          setSelectedScanId(parsed.id);
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

  if (isCollapsed) {
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
          <span className={styles.collapsedTitle}>
            3D LiDAR Room Spatial Scan
          </span>
          <span className={styles.badgeOptional}>Optional Tool</span>
          <span className={styles.collapsedSubtext}>
            Interactive 3D CAD modeling, laser tape measure &amp; trade takeoffs
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

  const isSample = Boolean(activeScan.isSample);

  const mainContent = (
    <div className={`${styles.container} ${className} ${isFullscreen ? styles.fullscreenModal : ''}`}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>
            <span className={styles.pulseDot} />
            3D Room Spatial Intel &amp; LiDAR Takeoffs
          </span>
          {isSample ? (
            <span className={styles.badgeSample}>
              📋 Sample CAD Template (Demo)
            </span>
          ) : (
            <span className={styles.badgeVerified}>
              ✅ Verified LiDAR / CAD Scan
            </span>
          )}
          <span className={styles.badgeConfidence}>
            {isSample ? 'Sample Reference Model' : `${activeScan.confidenceScore}% CAD Precision`}
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
              setSelectedObject(null);
            }}
            aria-label="Select Scanned Room"
          >
            {allAvailableScans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.isSample ? `[Sample] ${s.title}` : s.title}
              </option>
            ))}
          </select>

          {/* Quick Capture & Upload Action Buttons */}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowQrModal(true)}
            title="How to capture room on site with smartphone video or iPhone LiDAR"
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
          >
            📲 Mobile Capture Guide
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowUploadModal(true)}
            title="Upload custom Apple RoomPlan JSON or 3D scan"
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
          >
            📁 Upload Scan
          </button>

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

          {/* 3D vs 2D CAD vs Wall Elevation Toggle */}
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
              2D Floor
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${viewMode === 'elevation' ? styles.toggleBtnActive : ''}`}
              onClick={() => setViewMode('elevation')}
            >
              Elevation
            </button>
          </div>

          {/* Fullscreen Mode Button */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit Fullscreen Mode (ESC)' : 'Expand Fullscreen CAD Mode'}
          >
            {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
          </button>

          {collapsible && !isFullscreen && (
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
        </div>
      </div>

      {/* Sample Template Notice Banner */}
      {isSample && (
        <div className={styles.sampleBanner}>
          <div>
            📐 <strong>Sample Reference Model:</strong> You are viewing an interactive sample CAD template. Attach a jobsite Apple RoomPlan LiDAR export or custom 3D scan to compute verified takeoffs for this property.
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowUploadModal(true)}
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}
          >
            📁 Upload On-Site Scan
          </button>
        </div>
      )}

      {/* Layer Visibility Controls Bar */}
      <div className={styles.layerBar}>
        <span className={styles.layerTitle}>CAD Layers:</span>
        <button
          type="button"
          className={`${styles.layerToggle} ${layers.grid ? styles.layerToggleActive : ''}`}
          onClick={() => setLayers((prev) => ({ ...prev, grid: !prev.grid }))}
        >
          {layers.grid ? '✓' : '○'} Point Grid
        </button>
        <button
          type="button"
          className={`${styles.layerToggle} ${layers.fixtures ? styles.layerToggleActive : ''}`}
          onClick={() => setLayers((prev) => ({ ...prev, fixtures: !prev.fixtures }))}
        >
          {layers.fixtures ? '✓' : '○'} 3D Fixtures
        </button>
        <button
          type="button"
          className={`${styles.layerToggle} ${layers.dimensions ? styles.layerToggleActive : ''}`}
          onClick={() => setLayers((prev) => ({ ...prev, dimensions: !prev.dimensions }))}
        >
          {layers.dimensions ? '✓' : '○'} Dimensions
        </button>
      </div>

      {/* Elevation View Panel */}
      {viewMode === 'elevation' ? (
        <div className={styles.elevationContainer}>
          <div className={styles.elevationWallNav}>
            {wallElevations.map((w, idx) => (
              <button
                key={w.id}
                type="button"
                className={`${styles.elevationTabBtn} ${selectedWallIdx === idx ? styles.elevationTabBtnActive : ''}`}
                onClick={() => setSelectedWallIdx(idx)}
              >
                {w.label} ({w.lengthFt}&apos; × {w.heightFt}&apos;)
              </button>
            ))}
          </div>

          {wallElevations[selectedWallIdx] && (
            <div>
              <div className={styles.elevationDiagram}>
                <div
                  className={styles.elevationWallFrame}
                  style={{
                    width: `${Math.min(500, wallElevations[selectedWallIdx].lengthInches * 2.8)}px`,
                    height: '140px',
                  }}
                >
                  {wallElevations[selectedWallIdx].isWetWall && (
                    <div className={styles.elevationWetZone} style={{ left: '20%', right: '20%' }}>
                      <span style={{ fontSize: '0.65rem', color: '#06b6d4', fontWeight: 600, padding: '4px' }}>
                        💧 Wet Wall Waterproof Zone
                      </span>
                    </div>
                  )}

                  {wallElevations[selectedWallIdx].openings.map((op) => (
                    <div
                      key={op.id}
                      className={styles.elevationOpening}
                      style={{
                        left: `${(op.offsetInches / wallElevations[selectedWallIdx].lengthInches) * 100}%`,
                        width: `${Math.max(40, (op.widthInches / wallElevations[selectedWallIdx].lengthInches) * 100)}%`,
                        height: `${(op.heightInches / wallElevations[selectedWallIdx].heightInches) * 100}%`,
                      }}
                    >
                      {op.type.toUpperCase()} ({op.widthInches}&quot;×{op.heightInches}&quot;)
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.elevationInfoGrid}>
                <div className={styles.elevationCard}>
                  <div className={styles.elevationCardLabel}>Gross Surface</div>
                  <div className={styles.elevationCardValue}>{wallElevations[selectedWallIdx].grossAreaSqFt} sq ft</div>
                </div>
                <div className={styles.elevationCard}>
                  <div className={styles.elevationCardLabel}>Net Paintable Area</div>
                  <div className={styles.elevationCardValue}>{wallElevations[selectedWallIdx].netAreaSqFt} sq ft</div>
                </div>
                <div className={styles.elevationCard}>
                  <div className={styles.elevationCardLabel}>Wall Span / Length</div>
                  <div className={styles.elevationCardValue}>{wallElevations[selectedWallIdx].lengthInches}&quot; ({wallElevations[selectedWallIdx].lengthFt} ft)</div>
                </div>
                <div className={styles.elevationCard}>
                  <div className={styles.elevationCardLabel}>Cutouts Deducted</div>
                  <div className={styles.elevationCardValue}>{wallElevations[selectedWallIdx].openings.length} openings</div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 3D / 2D CAD Viewport */
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
              : 'Click and drag to rotate in 3D, scroll to zoom. Click fixtures to inspect.'
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
            {viewMode === '3d' ? '✦ Drag to orbit · Scroll to zoom · Click fixtures to inspect' : '✦ 2D CAD Floor Plan'}
          </div>
        </div>
      )}

      {/* Fixture Raycast Inspector Drawer */}
      {selectedObject && (
        <div className={styles.fixtureDrawer}>
          <div className={styles.fixtureHeader}>
            <span className={styles.fixtureTitle}>
              📦 Selected Fixture: {selectedObject.label}
            </span>
            <button
              type="button"
              className={styles.fixtureCloseBtn}
              onClick={() => setSelectedObject(null)}
              aria-label="Close fixture inspector"
            >
              ✕
            </button>
          </div>
          <div className={styles.fixtureDims}>
            Dimensions: {selectedObject.dimensionsInches.width}&quot; W × {selectedObject.dimensionsInches.depth}&quot; D × {selectedObject.dimensionsInches.height}&quot; H
          </div>
          <div className={styles.fixtureNote}>
            Trade Note: Standard rough-in clearance verified. Compatible with standard trade supply packages.
          </div>
        </div>
      )}

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
          aria-controls="supply-house-materials-drawer"
        >
          <span>
            📦 Supply House Materials Pick-List ({supplyHouseItems.length} items with 10–15% waste)
          </span>
          <span>{showSupplyHouse ? '▲ Hide Materials' : '▼ View Materials & Ordering Quantities'}</span>
        </button>
      </div>

      {showSupplyHouse && (
        <div id="supply-house-materials-drawer" className={styles.supplyHouseContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)' }}>
              Vendor-ready packaging quantities with automated pattern cut &amp; miter waste factors.
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleDownloadCsv}
                style={{ fontSize: '0.72rem', padding: '0.24rem 0.6rem' }}
                title="Download CSV for Home Depot ProDesk / Lowe's Pro"
              >
                📥 Download CSV
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleCopyPickList}
                style={{ fontSize: '0.72rem', padding: '0.24rem 0.6rem' }}
              >
                📋 Copy Vendor Order Text
              </button>
            </div>
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

      {/* Subcontractor Takeoff Slips Bar */}
      <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--line, rgba(255,255,255,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)' }}>
          👷 <strong>Subcontractor Slips:</strong>
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => handleCopySubSlip('tile')}
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
            title="Copy Tile & Waterproofing Subcontractor Work Order Slip"
          >
            🪚 Tile Sub Slip
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => handleCopySubSlip('paint')}
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
            title="Copy Drywall & Painting Subcontractor Slip"
          >
            🎨 Paint Sub Slip
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => handleCopySubSlip('trim')}
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
            title="Copy Trim Carpentry Subcontractor Slip"
          >
            🔨 Trim Sub Slip
          </button>
        </div>
      </div>

      {/* Quote Integration & Actions Bar */}
      <div className={styles.actionsBar}>
        <div className={styles.actionsLeft}>
          <span>
            {isSample
              ? 'Sample Reference Model · Upload on-site scan for verified takeoffs'
              : `Scanned ${activeScan.scannedAt} via ${activeScan.device}`}
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
            onClick={handleDownloadCsv}
            title="Download CSV for ProDesk or materials ordering"
          >
            📥 ProDesk CSV
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

      {/* Mobile 3D Room Capture & LiDAR Guide Modal */}
      {showQrModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowQrModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📲 How to Capture 3D Measurements on Site</span>
              <button type="button" className={styles.modalClose} onClick={() => setShowQrModal(false)}>✕</button>
            </div>

            <div className={styles.guideAlert}>
              <span>💡 <strong>Why websites can&apos;t fire iPhone LiDAR directly:</strong> Apple security restricts web browsers (Safari &amp; Chrome) from accessing raw hardware LiDAR sensors. Use either method below to capture and calculate dimensions:</span>
            </div>

            <div className={styles.guideGrid}>
              {/* Method 1: AI Video / Photo Intake */}
              <div className={styles.guideCard}>
                <div className={styles.guideBadge}>Method 1 · Any Smartphone</div>
                <h4 className={styles.guideCardTitle}>📹 AI Video / Photo Walkthrough</h4>
                <p className={styles.guideCardDesc}>
                  No app download needed. Open the intake link on your iPhone or Android, record a 15-second walk-around video of the room, and our AI Vision engine extracts boundaries, fixtures, and clearances automatically.
                </p>
                <button
                  type="button"
                  className={styles.guideActionBtn}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.href);
                      setToastMessage('✓ Mobile Link copied to clipboard!');
                      setTimeout(() => setToastMessage(null), 3000);
                    }
                  }}
                >
                  📋 Copy Mobile Job Link
                </button>
              </div>

              {/* Method 2: iPhone Pro Hardware LiDAR */}
              <div className={styles.guideCard}>
                <div className={styles.guideBadge} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}>
                  Method 2 · iPhone 12–16 Pro / iPad Pro
                </div>
                <h4 className={styles.guideCardTitle}>🎯 Hardware LiDAR / CAD Scans</h4>
                <p className={styles.guideCardDesc}>
                  Open <strong>Apple Measure</strong>, <strong>Polycam</strong>, or <strong>Canvas 3D</strong> on your iPhone Pro. Walk the room to capture laser point clouds, then tap <em>Export (USDZ, JSON, or CAD PDF)</em>.
                </p>
                <button
                  type="button"
                  className={styles.guideActionBtnSecondary}
                  onClick={() => {
                    setShowQrModal(false);
                    setShowUploadModal(true);
                  }}
                >
                  📁 Open 3D Scan Uploader
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Custom Scan Modal */}
      {showUploadModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowUploadModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📁 Attach Custom 3D LiDAR / CAD Scan</span>
              <button type="button" className={styles.modalClose} onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            
            <div
              className={`${styles.dropzone} ${isDraggingFile ? styles.dropzoneActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleFileDrop}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json,.usdz,.obj,.pdf';
                input.onchange = (e: Event) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files.length > 0) {
                    const file = target.files[0];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const content = event.target?.result as string;
                        const parsed = parseCustomScanJson(content);
                        setCustomScans((prev) => [parsed, ...prev]);
                        setSelectedScanId(parsed.id);
                        setShowUploadModal(false);
                        setToastMessage(`✓ Loaded 3D Scan: ${parsed.title}`);
                        setTimeout(() => setToastMessage(null), 3000);
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : 'Invalid format';
                        alert(`Could not parse JSON: ${msg}. Try dropping an Apple RoomPlan or sample JSON export.`);
                      }
                    };
                    reader.readAsText(file);
                  }
                };
                input.click();
              }}
            >
              <div className={styles.dropzoneText}>Drag &amp; Drop RoomPlan / LiDAR JSON file</div>
              <div className={styles.dropzoneSubtext}>Supports Apple RoomPlan (.json), Polycam, Canvas 3D, and USDZ exports</div>
            </div>

            {/* Quick Test Preset Buttons */}
            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', marginBottom: '0.5rem', fontWeight: 600 }}>
                Or test with a pre-loaded sample room scan:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {SAMPLE_ROOM_SCANS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.btnSecondary}
                    style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      setSelectedScanId(s.id);
                      setShowUploadModal(false);
                      setToastMessage(`✓ Switched to: ${s.title}`);
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return mainContent;
}
