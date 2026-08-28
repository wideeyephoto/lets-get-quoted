'use client';

import { createContext, useContext, type ReactNode } from 'react';

const WorkspaceTradeContext = createContext<string | null>(null);

export function WorkspaceTradeProvider({ trade, children }: { trade: string | null; children: ReactNode }) {
  return <WorkspaceTradeContext.Provider value={trade}>{children}</WorkspaceTradeContext.Provider>;
}

export function useWorkspaceTrade(): string | null {
  return useContext(WorkspaceTradeContext);
}
