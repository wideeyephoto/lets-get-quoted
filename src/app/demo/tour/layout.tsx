import type { ReactNode } from 'react';
import { DemoTourStateProvider } from '@/components/demo/DemoTourStateProvider';

export default function DemoTourLayout({ children }: { children: ReactNode }) {
  return <DemoTourStateProvider>{children}</DemoTourStateProvider>;
}
