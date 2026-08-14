import type { ReactNode } from 'react';

/**
 * This segment exists only to give /demo/sites a title.
 *
 * Its page is a client component — it drives the video studio preview — and a
 * client component cannot export `metadata`; Next fails the build outright if
 * it tries. A layout is a server component either way, so the title lives here
 * and the page is left as it is. Nothing else about the segment changes: this
 * renders its children and nothing else.
 */
export const metadata = { title: 'Website — Live Demo' };

export default function DemoSitesLayout({ children }: { children: ReactNode }) {
  return children;
}
