'use client';

import React, { useMemo, useState } from 'react';
import type { RoomSpatialScan } from '@/lib/property-intel/room-spatial-intel';
import { getRoomFloorPolygon, pointDistance, type SpatialPoint } from '@/lib/property-intel/room-scan-geometry';
import styles from './room-scan-viewer.module.css';

/** Parametric surface preview. Every selectable point comes from imported geometry. */
export function RoomScanScene({ scan }: { scan: RoomSpatialScan }) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [angle, setAngle] = useState(-35);
  const [zoom, setZoom] = useState(1);
  const [measure, setMeasure] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const floor = useMemo(() => getRoomFloorPolygon(scan), [scan]);
  const vertices: SpatialPoint[] = floor.map(p => ({ ...p, y: 0 }));
  vertices.push(...floor.map(p => ({ ...p, y: scan.ceilingHeightInches })));
  const centerX = (Math.min(...floor.map(p => p.x)) + Math.max(...floor.map(p => p.x))) / 2;
  const centerZ = (Math.min(...floor.map(p => p.z)) + Math.max(...floor.map(p => p.z))) / 2;
  const radians = angle * Math.PI / 180;
  const rawProject = (p: SpatialPoint) => {
    const x = p.x - centerX, z = p.z - centerZ;
    if (mode === '2d') return { x, y: z };
    return { x: x * Math.cos(radians) + z * Math.sin(radians),
      y: (-x * Math.sin(radians) + z * Math.cos(radians)) * 0.5 - p.y * 0.86 };
  };
  const projected = vertices.map(rawProject);
  const minX = Math.min(...projected.map(p => p.x)), maxX = Math.max(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y)), maxY = Math.max(...projected.map(p => p.y));
  const scale = Math.min(620 / Math.max(maxX - minX, 1), 320 / Math.max(maxY - minY, 1)) * zoom;
  const project = (p: SpatialPoint) => {
    const r = rawProject(p);
    return { x: 400 + (r.x - (minX + maxX) / 2) * scale, y: 215 + (r.y - (minY + maxY) / 2) * scale };
  };
  const points = (values: SpatialPoint[]) => values.map(p => { const s = project(p); return `${s.x},${s.y}`; }).join(' ');
  const choose = (i: number) => setSelection(previous => previous.length === 1 ? [previous[0], i] : [i]);
  const span = selection.length === 2 ? pointDistance(vertices[selection[0]], vertices[selection[1]]) : null;
  const visibleVertices = mode === '2d' ? vertices.slice(0, floor.length) : vertices;

  return <>
    <div className={styles.controlsWrap}>
      <button type="button" className={styles.btnSecondary} aria-pressed={mode === '3d'} onClick={() => { setMode('3d'); setSelection([]); }}>3D CAD</button>
      <button type="button" className={styles.btnSecondary} aria-pressed={mode === '2d'} onClick={() => { setMode('2d'); setSelection([]); }}>2D Floor</button>
      <button type="button" className={styles.btnSecondary} aria-pressed={measure} onClick={() => { setMeasure(!measure); setSelection([]); }}>📐 Measure vertices</button>
      {mode === '3d' && <label className={styles.sceneControl}>Rotate <input aria-label="Rotate room" type="range" min="-180" max="180" value={angle} onChange={e => setAngle(Number(e.target.value))} /></label>}
      <label className={styles.sceneControl}>Zoom <input aria-label="Zoom room" type="range" min="0.5" max="1.8" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
    </div>
    <svg viewBox="0 0 800 430" className={styles.scanScene} aria-label={`${mode === '3d' ? '3D surface preview' : 'Floor plan'} of ${scan.title}`}>
      <polygon points={points(vertices.slice(0, floor.length))} fill="rgba(56,189,248,0.10)" stroke="#38bdf8" strokeWidth="2" />
      {mode === '3d' && floor.map((_, i) => {
        const j = (i + 1) % floor.length;
        return <polygon key={i} points={points([vertices[i], vertices[j], vertices[j + floor.length], vertices[i + floor.length]])} fill="rgba(56,189,248,0.04)" stroke="rgba(56,189,248,0.6)" />;
      })}
      {scan.objects.map(obj => {
        const { x, y, z } = obj.position;
        const w = obj.dimensionsInches.width / 2, d = obj.dimensionsInches.depth / 2;
        const base = [{ x: x-w, y, z: z-d }, { x: x+w, y, z: z-d }, { x: x+w, y, z: z+d }, { x: x-w, y, z: z+d }];
        const top = base.map(p => ({ ...p, y: y + obj.dimensionsInches.height }));
        return <g key={obj.id}>
          <title>{obj.label}: {obj.dimensionsInches.width} × {obj.dimensionsInches.depth} × {obj.dimensionsInches.height} inches</title>
          <polygon points={points(mode === '3d' ? top : base)} fill="rgba(167,139,250,0.15)" stroke="#a78bfa" />
          {mode === '3d' && base.map((p, i) => <line key={i} x1={project(p).x} y1={project(p).y} x2={project(top[i]).x} y2={project(top[i]).y} stroke="#a78bfa" />)}
        </g>;
      })}
      {span !== null && <line x1={project(vertices[selection[0]]).x} y1={project(vertices[selection[0]]).y} x2={project(vertices[selection[1]]).x} y2={project(vertices[selection[1]]).y} stroke="#fbbf24" strokeWidth="3" />}
      {measure && visibleVertices.map((p, i) => <g key={i}>
        <circle cx={project(p).x} cy={project(p).y} r="10" fill={selection.includes(i) ? '#fbbf24' : '#38bdf8'} role="button" tabIndex={0}
          aria-label={`Measure ${i < floor.length ? 'floor' : 'ceiling'} vertex ${i % floor.length + 1}`}
          onClick={() => choose(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } }} />
      </g>)}
    </svg>
    <p className={styles.scanNotice} role="status">{measure
      ? span === null ? 'Select two highlighted vertices to measure their straight-line distance.' : `Span: ${span.toFixed(1)} inches (${(span / 12).toFixed(2)} ft)`
      : 'Surface preview from imported geometry. Openings are deducted in the takeoff; wall surfaces are shown without cutouts.'}</p>
  </>;
}
