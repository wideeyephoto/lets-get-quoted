'use client';

import React, { useMemo } from 'react';
import { generateQRCodeMatrix } from '@/lib/qrcode';

export interface QRCodeSvgProps {
  value: string;
  size?: number;
  foreground?: string;
  background?: string;
  margin?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function QRCodeSvg({
  value,
  size = 200,
  foreground = '#0f172a',
  background = '#ffffff',
  margin = 2,
  className,
  style,
}: QRCodeSvgProps) {
  const { viewBoxSize, pathD } = useMemo(() => {
    if (!value) return { viewBoxSize: 25, pathD: '' };
    try {
      const { size: matrixSize, modules } = generateQRCodeMatrix(value);
      const vb = matrixSize + margin * 2;
      let d = '';
      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (modules[r][c]) {
            d += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }
      return { viewBoxSize: vb, pathD: d };
    } catch {
      return { viewBoxSize: 25, pathD: '' };
    }
  }, [value, margin]);

  if (!value) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f1f5f9',
          borderRadius: '8px',
          color: '#94a3b8',
          fontSize: '0.8rem',
          ...style,
        }}
        className={className}
      >
        No QR Data
      </div>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '6px',
        ...style,
      }}
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill={background} />
      <path d={pathD} fill={foreground} />
    </svg>
  );
}
