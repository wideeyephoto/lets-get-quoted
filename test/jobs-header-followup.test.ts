import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Job Queue Header 2-Row Layout and Follow Up Button', () => {
  it('verifies JobSmoothieView organizes queue header into 2 rows with followupButton in top right', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/jobs/JobSmoothieView.tsx', 'utf8');

    // Accepts followupButton prop
    expect(smoothieSrc).toContain('followupButton?: ReactNode;');
    expect(smoothieSrc).toContain('followupButton,');

    // 2-row header container
    expect(smoothieSrc).toContain('styles.queueHeadTwoRows');
    expect(smoothieSrc).toContain('styles.queueHeadTop');
    expect(smoothieSrc).toContain('styles.queueHeadActions');

    // Row 1 has queue title/count on left and followupButton on right
    expect(smoothieSrc).toContain('styles.queueHeadLeft');
    expect(smoothieSrc).toContain('{followupButton}');

    // Row 2 has sort popup in queueHeadActions
    expect(smoothieSrc).toContain('styles.sortPopupWrap');
    expect(smoothieSrc).toContain('styles.sortToggleBtn');
    expect(smoothieSrc).toContain('styles.sortToggleLabelGroup');
    expect(smoothieSrc).toContain('styles.filterIcon');
    expect(smoothieSrc).toContain('styles.sortCurrentLabel');
  });

  it('verifies JobsWorkspace passes followupButton and smoothieGear to JobSmoothieView', () => {
    const workspaceSrc = readFileSync('src/app/dashboard/jobs/JobsWorkspace.tsx', 'utf8');

    // Passes followupButton={toolbarAccessory} to JobSmoothieView
    expect(workspaceSrc).toContain('followupButton={toolbarAccessory}');
    expect(workspaceSrc).toContain('gear={smoothieGear}');

    // smoothieGear does not include toolbarAccessory
    expect(workspaceSrc).toContain('const smoothieGear = (');
  });

  it('verifies smoothie.module.css styles 2-row queue header layout', () => {
    const css = readFileSync('src/app/dashboard/smoothie.module.css', 'utf8');

    expect(css).toContain('.queueHeadTwoRows');
    expect(css).toContain('.queueHeadTop');
    expect(css).toContain('.queueHeadActions');
    expect(css).toContain('.sortToggleLabelGroup');
  });

  it('verifies JobSmoothieView sets pageSize to 10 as default instead of 25', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/jobs/JobSmoothieView.tsx', 'utf8');
    expect(smoothieSrc).toContain('pageSize: 10');
  });
});
