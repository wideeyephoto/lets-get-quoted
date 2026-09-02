'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

import { getCompanion, type CompanionProfile, type CompanionId, DEFAULT_COMPANION_ID, COMPANIONS } from '@/lib/ai-assistant/companions';

interface AssistantContextType {
  isOpen: boolean;
  openAssistant: (initialPrompt?: string) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  initialPrompt: string | null;
  clearInitialPrompt: () => void;
  companionId: CompanionId;
  companionTrade: string;
  companion: CompanionProfile;
  setCompanion: (id: CompanionId, trade?: string) => void;
  isCompanionPickerOpen: boolean;
  openCompanionPicker: () => void;
  closeCompanionPicker: () => void;
  isFloatingEnabled: boolean;
  setFloatingEnabled: (enabled: boolean) => void;
}

const AssistantContext = createContext<AssistantContextType | null>(null);

const STORAGE_KEY_ID = 'copilot_companion_id';
const STORAGE_KEY_TRADE = 'copilot_companion_trade';
const STORAGE_KEY_FLOATING = 'copilot_floating_enabled';

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [companionId, setCompanionIdState] = useState<CompanionId>(DEFAULT_COMPANION_ID);
  const [companionTrade, setCompanionTradeState] = useState<string>('general');
  const [isCompanionPickerOpen, setIsCompanionPickerOpen] = useState(false);
  const [isFloatingEnabled, setIsFloatingEnabledState] = useState(true);

  // Initialize from localStorage on mount and listen to cross-tab updates
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const savedId = localStorage.getItem(STORAGE_KEY_ID) as CompanionId | null;
        const savedTrade = localStorage.getItem(STORAGE_KEY_TRADE);
        const savedFloating = localStorage.getItem(STORAGE_KEY_FLOATING);
        if (savedId && COMPANIONS.some((c) => c.id === savedId)) {
          setCompanionIdState(savedId);
        } else {
          setCompanionIdState(DEFAULT_COMPANION_ID);
        }
        if (savedTrade) {
          setCompanionTradeState(savedTrade);
        }
        if (savedFloating !== null) {
          setIsFloatingEnabledState(savedFloating !== '0' && savedFloating !== 'false');
        }
      } catch {
        // ignore storage access errors
      }
    };

    syncFromStorage();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_ID || e.key === STORAGE_KEY_TRADE || e.key === STORAGE_KEY_FLOATING) {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setFloatingEnabled = useCallback((enabled: boolean) => {
    setIsFloatingEnabledState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_FLOATING, enabled ? '1' : '0');
    } catch {}
  }, []);

  const setCompanion = useCallback((id: CompanionId, trade?: string) => {
    setCompanionIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_ID, id);
    } catch {}

    if (trade) {
      setCompanionTradeState(trade);
      try {
        localStorage.setItem(STORAGE_KEY_TRADE, trade);
      } catch {}
    }
  }, []);

  const openAssistant = useCallback((prompt?: string) => {
    if (prompt) {
      setInitialPrompt(prompt);
    }
    setIsOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    setInitialPrompt(null);
  }, []);

  const toggleAssistant = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const clearInitialPrompt = useCallback(() => {
    setInitialPrompt(null);
  }, []);

  const openCompanionPicker = useCallback(() => {
    setIsCompanionPickerOpen(true);
  }, []);

  const closeCompanionPicker = useCallback(() => {
    setIsCompanionPickerOpen(false);
  }, []);

  const companion = useMemo(() => {
    return getCompanion(companionId, companionTrade);
  }, [companionId, companionTrade]);

  // Global keyboard shortcut: Cmd+J / Ctrl+J or Cmd+K / Ctrl+K to toggle, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (key === 'j' || key === 'k')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isCompanionPickerOpen) {
          setIsCompanionPickerOpen(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCompanionPickerOpen]);

  return (
    <AssistantContext.Provider
      value={{
        isOpen,
        openAssistant,
        closeAssistant,
        toggleAssistant,
        initialPrompt,
        clearInitialPrompt,
        companionId,
        companionTrade,
        companion,
        setCompanion,
        isCompanionPickerOpen,
        openCompanionPicker,
        closeCompanionPicker,
        isFloatingEnabled,
        setFloatingEnabled,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
}
