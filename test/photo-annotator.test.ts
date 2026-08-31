import { describe, it, expect, vi } from 'vitest';
import {
  calculateArrowHead,
  calculateMeasureGeometry,
  AnnotationHistory,
  drawShapeToCanvas,
  CONTRACTOR_COLORS,
  STROKE_WIDTHS,
  CONTRACTOR_STAMPS,
  formatContractorMeasurement,
  type AnnotationShape,
} from '@/lib/photo-annotation-engine';
import {
  formatSubcontractorSlip,
  type RoomSpatialScan,
  type RoomDimensionsSummary,
} from '@/lib/property-intel/room-spatial-intel';

describe('Photo Annotation & Site Markup Engine', () => {
  it('calculates vector arrowhead points with accurate angle and head length', () => {
    const head1 = calculateArrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, Math.PI / 6);
    expect(head1.left.x).toBeCloseTo(100 - 20 * Math.cos(Math.PI / 6), 1);
    expect(head1.left.y).toBeCloseTo(-20 * Math.sin(-Math.PI / 6), 1);
    expect(head1.right.x).toBeCloseTo(100 - 20 * Math.cos(-Math.PI / 6), 1);
    expect(head1.right.y).toBeCloseTo(-20 * Math.sin(Math.PI / 6), 1);

    const head2 = calculateArrowHead({ x: 50, y: 0 }, { x: 50, y: 100 }, 20);
    expect(head2.left.y).toBeLessThan(100);
    expect(head2.right.y).toBeLessThan(100);
  });

  it('calculates dimension caliper geometry, midpoint, and perpendicular ticks', () => {
    const start = { x: 10, y: 50 };
    const end = { x: 110, y: 50 };
    const geom = calculateMeasureGeometry(start, end, 16);

    expect(geom.distancePixels).toBe(100);
    expect(geom.midpoint).toEqual({ x: 60, y: 50 });
    expect(geom.startTick.p1.x).toBeCloseTo(10, 1);
    expect(geom.startTick.p1.y).toBeCloseTo(58, 1);
    expect(geom.startTick.p2.x).toBeCloseTo(10, 1);
    expect(geom.startTick.p2.y).toBeCloseTo(42, 1);
  });

  it('formats real-world contractor measurements accurately', () => {
    expect(formatContractorMeasurement('48')).toBe('48"');
    expect(formatContractorMeasurement('36.5')).toBe('36.5"');
    expect(formatContractorMeasurement('8 ft')).toBe('8 ft');
    expect(formatContractorMeasurement('8\' 6"')).toBe('8\' 6"');
    expect(formatContractorMeasurement('')).toBe('');
  });

  it('manages Undo and Redo history state accurately', () => {
    const history = new AnnotationHistory();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.current).toEqual([]);

    const shape1: AnnotationShape = {
      id: 'arrow-1',
      type: 'arrow',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
      color: '#ef4444',
      strokeWidth: 6,
    };

    history.push([shape1]);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.current).toHaveLength(1);

    const shape2: AnnotationShape = {
      id: 'rect-1',
      type: 'rect',
      start: { x: 20, y: 20 },
      end: { x: 80, y: 80 },
      color: '#06b6d4',
      strokeWidth: 4,
    };

    history.push([shape1, shape2]);
    expect(history.current).toHaveLength(2);

    const afterUndo1 = history.undo();
    expect(afterUndo1).toHaveLength(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);

    const afterUndo2 = history.undo();
    expect(afterUndo2).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const afterRedo1 = history.redo();
    expect(afterRedo1).toHaveLength(1);

    const shape3: AnnotationShape = {
      id: 'circle-1',
      type: 'circle',
      start: { x: 10, y: 10 },
      end: { x: 50, y: 50 },
      color: '#eab308',
      strokeWidth: 6,
    };
    history.push([shape1, shape3]);
    expect(history.canRedo()).toBe(false);
    expect(history.current).toHaveLength(2);
    expect(history.current[1].id).toBe('circle-1');

    history.clear();
    expect(history.current).toEqual([]);
    expect(history.canUndo()).toBe(true);
  });

  it('provides high-contrast contractor colors and standard stroke sizes', () => {
    expect(CONTRACTOR_COLORS).toHaveLength(7);
    const colorValues = CONTRACTOR_COLORS.map((c) => c.value);
    expect(colorValues).toContain('#ef4444');
    expect(colorValues).toContain('#f97316');
    expect(colorValues).toContain('#eab308');
    expect(colorValues).toContain('#06b6d4');

    expect(STROKE_WIDTHS).toHaveLength(3);
    const strokeValues = STROKE_WIDTHS.map((s) => s.value);
    expect(strokeValues).toContain(3);
    expect(strokeValues).toContain(6);
    expect(strokeValues).toContain(10);
  });

  it('provides contractor stamp badges and renders them onto canvas', () => {
    expect(CONTRACTOR_STAMPS.length).toBeGreaterThanOrEqual(6);
    const stampIds = CONTRACTOR_STAMPS.map((s) => s.id);
    expect(stampIds).toContain('defect');
    expect(stampIds).toContain('water');
    expect(stampIds).toContain('electric');
    expect(stampIds).toContain('demo');
    expect(stampIds).toContain('approved');
    expect(stampIds).toContain('violation');

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 120 }),
      fillText: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;

    drawShapeToCanvas(mockCtx, {
      id: 'stamp-1',
      type: 'stamp',
      position: { x: 100, y: 100 },
      stampId: 'defect',
      label: '⚠️ DEFECT / REPAIR',
      color: '#ef4444',
      strokeWidth: 2,
    });

    expect(mockCtx.fillText).toHaveBeenCalledWith('⚠️ DEFECT / REPAIR', 100, 100);
  });

  it('embeds inspection markup photos into subcontractor slips', () => {
    const dummyScan: RoomSpatialScan = {
      id: 'scan-1',
      title: 'Master Bathroom',
      roomType: 'bathroom',
      confidenceScore: 94,
      device: 'iPhone 15 Pro LiDAR',
      scannedAt: '2026-08-31',
      pointCount: 142000,
      ceilingHeightInches: 108,
      walls: [],
      openings: [],
      objects: [],
    };

    const dummySummary: RoomDimensionsSummary = {
      floorAreaSqFt: 120,
      grossWallAreaSqFt: 396,
      openingsAreaSqFt: 36,
      netPaintableWallSqFt: 360,
      tileAreaSqFt: 180,
      perimeterLinearFt: 44,
      baseboardLinearFt: 41,
      doorsCount: 1,
      windowsCount: 1,
      ceilingHeightFt: 9,
      primaryAlcoveSpanInches: 60,
    };

    const slip = formatSubcontractorSlip(
      'tile',
      dummyScan,
      dummySummary,
      [],
      ['https://storage.supabase.co/lead-photos/markup_bath.jpg']
    );

    expect(slip).toContain('SITE MARKUP & INSPECTION PHOTOS:');
    expect(slip).toContain('https://storage.supabase.co/lead-photos/markup_bath.jpg');
  });
});
