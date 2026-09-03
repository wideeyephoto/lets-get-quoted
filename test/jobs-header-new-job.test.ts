import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Jobs Workspace Header + New Job Button Layout', () => {
  it('verifies JobsWorkspace renders the header with side-by-side + New job button', () => {
    const src = readFileSync('src/app/dashboard/jobs/JobsWorkspace.tsx', 'utf8');
    expect(src).toContain('styles.headingTitleRow');
    expect(src).toContain('<HeadingTag>{headingTitle}</HeadingTag>');
    expect(src).toContain('styles.newJobBtn');
    expect(src).toContain('+ New job');
    expect(src).toContain('href="#new-job"');
  });

  it('verifies jobs.module.css styles the header row and new job pill button', () => {
    const css = readFileSync('src/app/dashboard/jobs/jobs.module.css', 'utf8');
    expect(css).toContain('.headingTitleRow');
    expect(css).toContain('display: flex;');
    expect(css).toContain('align-items: center;');
    expect(css).toContain('.newJobBtn');
    expect(css).toContain('border-radius: 999px;');
  });

  it('verifies JobSmoothieView toolbar no longer duplicates + New job', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/jobs/JobSmoothieView.tsx', 'utf8');
    expect(smoothieSrc).not.toContain('+ New job');
  });

  it('verifies dashboard and demo jobs pages pass headingTitle="Current jobs"', () => {
    const dashboardJobs = readFileSync('src/app/dashboard/jobs/page.tsx', 'utf8');
    expect(dashboardJobs).toContain('headingTitle="Current jobs"');
    expect(dashboardJobs).toContain('headingTag="h1"');

    const demoJobs = readFileSync('src/app/demo/jobs/page.tsx', 'utf8');
    expect(demoJobs).toContain('headingTitle="Current jobs"');
    expect(demoJobs).toContain('headingTag="h2"');
  });
});

describe('Job Queue Header Sort Popup Toggle', () => {
  it('verifies Sort is moved from toolbar into Job Queue header', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/jobs/JobSmoothieView.tsx', 'utf8');

    // Toolbar does not have select sort
    expect(smoothieSrc).not.toContain('id="job-smoothie-sort"');

    // Queue header has sort popup toggle button with filter icon
    expect(smoothieSrc).toContain('styles.sortPopupWrap');
    expect(smoothieSrc).toContain('styles.sortToggleBtn');
    expect(smoothieSrc).toContain('styles.filterIcon');
    expect(smoothieSrc).toContain('styles.sortCurrentLabel');
    expect(smoothieSrc).toContain('aria-haspopup="menu"');

    // Queue header has the popup menu
    expect(smoothieSrc).toContain('styles.sortMenu');
    expect(smoothieSrc).toContain('role="menu"');
    expect(smoothieSrc).toContain('styles.sortMenuItem');
    expect(smoothieSrc).toContain('role="menuitemradio"');
  });

  it('verifies smoothie.module.css styles the sort popup and toggle', () => {
    const css = readFileSync('src/app/dashboard/smoothie.module.css', 'utf8');
    expect(css).toContain('.sortPopupWrap');
    expect(css).toContain('.sortToggleBtn');
    expect(css).toContain('.filterIcon');
    expect(css).toContain('.sortMenu');
    expect(css).toContain('.sortMenuItem');
  });
});
