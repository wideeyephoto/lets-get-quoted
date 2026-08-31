// Photo Annotation & Site Markup Vector Engine
// Mathematical models and rendering logic for drawing arrows, dimension calipers,
// bounding boxes, freehand pen strokes, stamps, and text badges on inspection photos.

export type AnnotationTool = 'pen' | 'arrow' | 'rect' | 'circle' | 'measure' | 'text' | 'stamp';

export type Point = {
  x: number;
  y: number;
};

export type BaseShape = {
  id: string;
  color: string;
  strokeWidth: number;
};

export type PenShape = BaseShape & {
  type: 'pen';
  points: Point[];
};

export type ArrowShape = BaseShape & {
  type: 'arrow';
  start: Point;
  end: Point;
};

export type RectShape = BaseShape & {
  type: 'rect';
  start: Point;
  end: Point;
};

export type CircleShape = BaseShape & {
  type: 'circle';
  start: Point;
  end: Point;
};

export type MeasureShape = BaseShape & {
  type: 'measure';
  start: Point;
  end: Point;
  label?: string; // Optional custom measurement override e.g. "48 in" or "8' 6\""
};

export type TextShape = BaseShape & {
  type: 'text';
  position: Point;
  text: string;
  fontSize: number;
  backgroundColor?: string;
};

export type StampShape = BaseShape & {
  type: 'stamp';
  position: Point;
  stampId: string;
  label: string;
  backgroundColor?: string;
};

export type AnnotationShape =
  | PenShape
  | ArrowShape
  | RectShape
  | CircleShape
  | MeasureShape
  | TextShape
  | StampShape;

export const CONTRACTOR_COLORS = [
  { label: 'Safety Red', value: '#ef4444' },
  { label: 'Safety Orange', value: '#f97316' },
  { label: 'Electric Yellow', value: '#eab308' },
  { label: 'Safety Green', value: '#22c55e' },
  { label: 'Bright Cyan', value: '#06b6d4' },
  { label: 'Pure White', value: '#ffffff' },
  { label: 'Pitch Black', value: '#000000' },
] as const;

export const STROKE_WIDTHS = [
  { label: 'Fine (3px)', value: 3 },
  { label: 'Medium (6px)', value: 6 },
  { label: 'Bold (10px)', value: 10 },
] as const;

export const CONTRACTOR_STAMPS = [
  { id: 'defect', label: '⚠️ DEFECT / REPAIR', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.25)' },
  { id: 'water', label: '💧 WATER DAMAGE', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.25)' },
  { id: 'electric', label: '⚡ ELECTRICAL HAZARD', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.25)' },
  { id: 'demo', label: '🪚 DEMOLITION ZONE', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.25)' },
  { id: 'approved', label: '✅ APPROVED / PASSED', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.25)' },
  { id: 'violation', label: '❌ CODE VIOLATION', color: '#dc2626', bgColor: 'rgba(220, 38, 38, 0.25)' },
  { id: 'rough_opening', label: '📏 ROUGH OPENING', color: '#38bdf8', bgColor: 'rgba(56, 189, 248, 0.25)' },
] as const;

export const QUICK_DIMENSIONS = ['30"', '36"', '48"', '60"', '72"', '8 ft', '10 ft', '12 ft'] as const;

/**
 * Formats user input into clean contractor measurement notation.
 */
export function formatContractorMeasurement(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Convert standard numbers like "48" to 48"
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}"`;
  }
  return trimmed;
}

/**
 * Calculates arrowhead points given start and end vectors.
 */
export function calculateArrowHead(
  start: Point,
  end: Point,
  headLength = 20,
  headAngle = Math.PI / 6
): { left: Point; right: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);

  const left: Point = {
    x: end.x - headLength * Math.cos(angle - headAngle),
    y: end.y - headLength * Math.sin(angle - headAngle),
  };

  const right: Point = {
    x: end.x - headLength * Math.cos(angle + headAngle),
    y: end.y - headLength * Math.sin(angle + headAngle),
  };

  return { left, right };
}

/**
 * Computes dimension line geometry with end ticks and midpoint placement.
 */
export function calculateMeasureGeometry(
  start: Point,
  end: Point,
  tickLength = 12
): {
  midpoint: Point;
  distancePixels: number;
  startTick: { p1: Point; p2: Point };
  endTick: { p1: Point; p2: Point };
} {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distancePixels = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const perpAngle = angle + Math.PI / 2;

  const midpoint: Point = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  const halfTick = tickLength / 2;

  const startTick = {
    p1: {
      x: start.x + halfTick * Math.cos(perpAngle),
      y: start.y + halfTick * Math.sin(perpAngle),
    },
    p2: {
      x: start.x - halfTick * Math.cos(perpAngle),
      y: start.y - halfTick * Math.sin(perpAngle),
    },
  };

  const endTick = {
    p1: {
      x: end.x + halfTick * Math.cos(perpAngle),
      y: end.y + halfTick * Math.sin(perpAngle),
    },
    p2: {
      x: end.x - halfTick * Math.cos(perpAngle),
      y: end.y - halfTick * Math.sin(perpAngle),
    },
  };

  return {
    midpoint,
    distancePixels,
    startTick,
    endTick,
  };
}

/**
 * Renders an individual vector shape onto a Canvas 2D rendering context.
 */
export function drawShapeToCanvas(
  ctx: CanvasRenderingContext2D,
  shape: AnnotationShape,
  scale = 1
): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.strokeWidth * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.type === 'pen') {
    if (shape.points.length < 2) {
      if (shape.points.length === 1) {
        ctx.beginPath();
        ctx.arc(
          shape.points[0].x * scale,
          shape.points[0].y * scale,
          (shape.strokeWidth * scale) / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x * scale, shape.points[0].y * scale);
    for (let i = 1; i < shape.points.length; i++) {
      ctx.lineTo(shape.points[i].x * scale, shape.points[i].y * scale);
    }
    ctx.stroke();
  } else if (shape.type === 'arrow') {
    const sx = shape.start.x * scale;
    const sy = shape.start.y * scale;
    const ex = shape.end.x * scale;
    const ey = shape.end.y * scale;

    // Main line
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    const head = calculateArrowHead(
      { x: sx, y: sy },
      { x: ex, y: ey },
      Math.max(16 * scale, shape.strokeWidth * scale * 2.5)
    );

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(head.left.x, head.left.y);
    ctx.lineTo(head.right.x, head.right.y);
    ctx.closePath();
    ctx.fill();
  } else if (shape.type === 'rect') {
    const x = Math.min(shape.start.x, shape.end.x) * scale;
    const y = Math.min(shape.start.y, shape.end.y) * scale;
    const w = Math.abs(shape.end.x - shape.start.x) * scale;
    const h = Math.abs(shape.end.y - shape.start.y) * scale;

    ctx.strokeRect(x, y, w, h);
  } else if (shape.type === 'circle') {
    const rx = (Math.abs(shape.end.x - shape.start.x) / 2) * scale;
    const ry = (Math.abs(shape.end.y - shape.start.y) / 2) * scale;
    const cx = ((shape.start.x + shape.end.x) / 2) * scale;
    const cy = ((shape.start.y + shape.end.y) / 2) * scale;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.type === 'measure') {
    const sx = shape.start.x * scale;
    const sy = shape.start.y * scale;
    const ex = shape.end.x * scale;
    const ey = shape.end.y * scale;

    const geom = calculateMeasureGeometry(
      { x: sx, y: sy },
      { x: ex, y: ey },
      Math.max(14 * scale, shape.strokeWidth * scale * 2)
    );

    // Dimension shaft
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Start & End perpendicular ticks
    ctx.beginPath();
    ctx.moveTo(geom.startTick.p1.x, geom.startTick.p1.y);
    ctx.lineTo(geom.startTick.p2.x, geom.startTick.p2.y);
    ctx.moveTo(geom.endTick.p1.x, geom.endTick.p1.y);
    ctx.lineTo(geom.endTick.p2.x, geom.endTick.p2.y);
    ctx.stroke();

    // Measurement badge
    const labelText = shape.label?.trim() || `${Math.round(geom.distancePixels / scale / 10)} px`;
    ctx.font = `bold ${Math.max(12, Math.round(14 * scale))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(labelText);
    const padX = 6 * scale;
    const padY = 3 * scale;
    const boxW = textMetrics.width + padX * 2;
    const boxH = 18 * scale;

    // Badge background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 1.5 * scale;
    ctx.fillRect(geom.midpoint.x - boxW / 2, geom.midpoint.y - boxH / 2, boxW, boxH);
    ctx.strokeRect(geom.midpoint.x - boxW / 2, geom.midpoint.y - boxH / 2, boxW, boxH);

    // Badge text
    ctx.fillStyle = shape.color;
    ctx.fillText(labelText, geom.midpoint.x, geom.midpoint.y);
  } else if (shape.type === 'text') {
    const px = shape.position.x * scale;
    const py = shape.position.y * scale;

    ctx.font = `bold ${Math.max(13, Math.round(shape.fontSize * scale))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = shape.text.split('\n');
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const lineHeight = shape.fontSize * scale * 1.35;
    const boxW = maxLineWidth + 16 * scale;
    const boxH = lines.length * lineHeight + 12 * scale;

    // Solid badge background with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8 * scale;
    ctx.fillStyle = shape.backgroundColor || 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(px, py, boxW, boxH);

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(px, py, boxW, boxH);

    // Text lines
    ctx.fillStyle = shape.color;
    lines.forEach((line, idx) => {
      ctx.fillText(line, px + 8 * scale, py + 6 * scale + idx * lineHeight);
    });
  } else if (shape.type === 'stamp') {
    const px = shape.position.x * scale;
    const py = shape.position.y * scale;

    const fontSize = Math.max(12, Math.round(14 * scale));
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(shape.label);
    const padX = 10 * scale;
    const boxW = textMetrics.width + padX * 2;
    const boxH = 26 * scale;

    // High contrast pill background
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 10 * scale;
    ctx.fillStyle = shape.backgroundColor || 'rgba(15, 23, 42, 0.94)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(px - boxW / 2, py - boxH / 2, boxW, boxH, 6 * scale)
      : ctx.rect(px - boxW / 2, py - boxH / 2, boxW, boxH);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    // Stamp text
    ctx.fillStyle = shape.color;
    ctx.fillText(shape.label, px, py);
  }

  ctx.restore();
}

/**
 * State Manager for Undo / Redo history tracking.
 */
export class AnnotationHistory {
  private history: AnnotationShape[][] = [[]];
  private currentIndex = 0;

  constructor(initialShapes: AnnotationShape[] = []) {
    this.history = [[...initialShapes]];
    this.currentIndex = 0;
  }

  public get current(): AnnotationShape[] {
    return this.history[this.currentIndex] || [];
  }

  public push(shapes: AnnotationShape[]): void {
    // Truncate any redo branch
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push([...shapes]);
    this.currentIndex++;
  }

  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public undo(): AnnotationShape[] {
    if (this.canUndo()) {
      this.currentIndex--;
    }
    return this.current;
  }

  public redo(): AnnotationShape[] {
    if (this.canRedo()) {
      this.currentIndex++;
    }
    return this.current;
  }

  public clear(): AnnotationShape[] {
    this.push([]);
    return this.current;
  }
}
