import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomScanViewer } from '@/components/property-intel/RoomScanViewer';
import { parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';
import { SAMPLE_ROOM_SCANS } from '@/lib/property-intel/room-spatial-intel';
import { measuredRoom } from './fixtures/room-scan';

// Behavioural coverage replaces the old source-string assertions that required
// fake loading percentages and hid sample warnings while keeping sample data.
describe('LiDAR Studio real-data rendering', () => {
  it('shows an empty state for any scope without exporting invented quantities', () => {
    const html = renderToStaticMarkup(React.createElement(RoomScanViewer, { mode: 'inline', scope: 'Master bath tub-to-shower conversion' }));
    expect(html).toContain('No room scan attached');
    expect(html).not.toContain('Download CSV');
    expect(html).not.toContain('CAD Precision');
    expect(html).not.toContain('<svg');
  });
  it('refuses to use a supplied sample as job measurements', () => {
    const html = renderToStaticMarkup(React.createElement(RoomScanViewer, { mode: 'inline', scan: SAMPLE_ROOM_SCANS[0] }));
    expect(html).toContain('No room scan attached');
    expect(html).not.toContain('Download CSV');
  });
  it('renders real takeoffs, deducts doors from trim, and omits unwired quote sync', () => {
    const scan = parseCustomScanJson(JSON.stringify(measuredRoom));
    const html = renderToStaticMarkup(React.createElement(RoomScanViewer, { mode: 'inline', scan }));
    expect(html).toContain('120');
    expect(html).toContain('41');
    expect(html).toContain('Baseboard Trim');
    expect(html).toContain('Download CSV');
    expect(html).not.toContain('Apply Dimensions');
    expect(html).not.toContain('Sync to AI Quote Draft');
    expect(html).toContain('Source not provided');
  });
  it('uses a semantic popup launcher without rendering a hidden scene', () => {
    const html = renderToStaticMarkup(React.createElement(RoomScanViewer));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<svg');
  });
});
