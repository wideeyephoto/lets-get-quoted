import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOM_SCAN_VIEWER_TSX = readFileSync(
  join(process.cwd(), 'src/components/property-intel/RoomScanViewer.tsx'),
  'utf8'
);

const ROOM_SCAN_VIEWER_CSS = readFileSync(
  join(process.cwd(), 'src/components/property-intel/room-scan-viewer.module.css'),
  'utf8'
);

const JOB_DETAIL_TABS_TSX = readFileSync(
  join(process.cwd(), 'src/app/dashboard/jobs/JobDetailTabs.tsx'),
  'utf8'
);

const LEAD_DETAIL_TABS_TSX = readFileSync(
  join(process.cwd(), 'src/app/dashboard/leads/LeadDetailTabs.tsx'),
  'utf8'
);

describe('LiDAR Studio Popup Link & Modal Architecture', () => {
  it('renders a dedicated on-page popup link card for LiDAR Studio', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('studioPopupLinkCard');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('✦ LiDAR Studio');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('3D Room Spatial Intel &amp; LiDAR Takeoffs');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Launch LiDAR Studio ↗');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Open in LiDAR Studio ↗');
  });

  it('implements accessible dialog semantics on the trigger card and launch button', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('aria-haspopup="dialog"');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('aria-expanded={isStudioOpen}');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('aria-controls={dialogId}');
  });

  it('renders the 3D studio in a portal modal dialog when opened', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('createPortal(');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('document.body');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('role="dialog"');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('aria-modal="true"');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('aria-labelledby={`${dialogId}-title`}');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('studioModalBackdrop');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('studioModalDialog');
  });

  it('integrates with modalStackFor to lock scroll, trap focus, and handle ESC dismissal', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('modalStackFor(document).register');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('requestClose: closeStudio');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('trigger: triggerRef.current');
  });

  it('provides explicit Close Studio buttons in both the header controls and footer actions', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('✕ Close Studio');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Done / Close Studio');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('onClick={closeStudio}');
  });

  it('contains comprehensive CSS styles for the popup link card and modal dialog', () => {
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.studioPopupLinkCard');
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.studioBadge');
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.popupActionBtn');
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.studioModalBackdrop');
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.studioModalDialog');
    expect(ROOM_SCAN_VIEWER_CSS).toContain('.studioCloseBtn');
  });

  it('supports configurable popup and inline modes with open state callbacks in RoomScanViewerProps', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain("mode?: 'popup' | 'inline'");
    expect(ROOM_SCAN_VIEWER_TSX).toContain('defaultOpen?: boolean');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('isOpen?: boolean');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('onOpenChange?: (open: boolean) => void');
  });
});

describe('Dashboard Tab Integration for LiDAR Studio', () => {
  it('renders RoomScanViewer cleanly on JobDetailTabs without forcing inline expansion', () => {
    expect(JOB_DETAIL_TABS_TSX).toContain('<RoomScanViewer');
    expect(JOB_DETAIL_TABS_TSX).toContain('scope={detail.scope}');
    expect(JOB_DETAIL_TABS_TSX).not.toContain('defaultCollapsed={!displayConfig.isPromoted}');
  });

  it('renders RoomScanViewer cleanly on LeadDetailTabs without forcing inline expansion', () => {
    expect(LEAD_DETAIL_TABS_TSX).toContain('<RoomScanViewer');
    expect(LEAD_DETAIL_TABS_TSX).toContain('scope={leadScope}');
    expect(LEAD_DETAIL_TABS_TSX).not.toContain('defaultCollapsed={!displayConfig.isPromoted}');
  });
});

describe('Simplified LiDAR Studio (No Hardcoded Clutter or Fake Examples)', () => {
  it('removes hardcoded preset selectors, sample warning banners, and fake style buttons', () => {
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('styles.presetSelect');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('styles.sampleBanner');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('Sample Reference Model');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('styles.stylePicker');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('styles.materialBar');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('Est. Takeoff: $');
    expect(ROOM_SCAN_VIEWER_TSX).not.toContain('supplyHouseToggleWrap');
  });

  it('keeps high-utility CAD tools: 3D/2D toggle, Laser Tape Measure, and Import Scan', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('3D CAD');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('2D Floor');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('📐 Laser Tape');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('📁 Import Scan');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('⛶ Fullscreen');
  });

  it('presents clean, verified takeoff metrics and quote sync actions', () => {
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Floor Surface');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Net Paintable Walls');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Baseboard Trim');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('Ceiling Height');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('📋 Copy Dimensions');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('📥 Download CSV');
    expect(ROOM_SCAN_VIEWER_TSX).toContain('⚡ Sync to AI Quote Draft');
  });
});
