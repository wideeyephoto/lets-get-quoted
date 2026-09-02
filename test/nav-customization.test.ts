import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseNavLogoPosition,
  isContractorLogoTop,
  readStoredNavLogoPosition,
  writeStoredNavLogoPosition,
  NAV_LOGO_POSITION_STORAGE_KEY,
  NAV_LOGO_POSITION_COOKIE,
  NAV_CUSTOMIZATION_EVENT,
} from '@/lib/nav-customization';
import { resolveTabForHash } from '@/lib/nav-helpers';

describe('Nav Customization Utilities', () => {
  describe('parseNavLogoPosition', () => {
    it('parses true values as contractor_top', () => {
      expect(parseNavLogoPosition('contractor_top')).toBe('contractor_top');
      expect(parseNavLogoPosition('top')).toBe('contractor_top');
      expect(parseNavLogoPosition(true)).toBe('contractor_top');
      expect(parseNavLogoPosition('true')).toBe('contractor_top');
      expect(parseNavLogoPosition('1')).toBe('contractor_top');
    });

    it('parses all other values as standard', () => {
      expect(parseNavLogoPosition('standard')).toBe('standard');
      expect(parseNavLogoPosition(false)).toBe('standard');
      expect(parseNavLogoPosition('false')).toBe('standard');
      expect(parseNavLogoPosition('0')).toBe('standard');
      expect(parseNavLogoPosition(null)).toBe('standard');
      expect(parseNavLogoPosition(undefined)).toBe('standard');
      expect(parseNavLogoPosition('')).toBe('standard');
    });
  });

  describe('isContractorLogoTop', () => {
    it('returns true only when position is contractor_top', () => {
      expect(isContractorLogoTop('contractor_top')).toBe(true);
      expect(isContractorLogoTop('standard')).toBe(false);
    });
  });

  describe('readStoredNavLogoPosition and writeStoredNavLogoPosition', () => {
    let mockStorage: Record<string, string>;
    let mockCookie: string;
    let dispatchEventMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockStorage = {};
      mockCookie = '';
      dispatchEventMock = vi.fn();

      (globalThis as unknown as { window: unknown }).window = {
        localStorage: {
          getItem: (k: string) => mockStorage[k] ?? null,
          setItem: (k: string, v: string) => {
            mockStorage[k] = String(v);
          },
          removeItem: (k: string) => {
            delete mockStorage[k];
          },
          clear: () => {
            mockStorage = {};
          },
        },
        dispatchEvent: dispatchEventMock,
      };

      (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class CustomEvent {
        type: string;
        detail: unknown;
        constructor(type: string, opts?: { detail?: unknown }) {
          this.type = type;
          this.detail = opts?.detail;
        }
      };

      (globalThis as unknown as { document: unknown }).document = {
        get cookie() {
          return mockCookie;
        },
        set cookie(val: string) {
          mockCookie = val;
        },
      };
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
      delete (globalThis as unknown as { document?: unknown }).document;
      delete (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent;
    });

    it('defaults to standard when storage and cookies are empty', () => {
      expect(readStoredNavLogoPosition()).toBe('standard');
    });

    it('reads position from localStorage when set', () => {
      mockStorage[NAV_LOGO_POSITION_STORAGE_KEY] = 'contractor_top';
      expect(readStoredNavLogoPosition()).toBe('contractor_top');
    });

    it('reads position from cookie when localStorage is empty', () => {
      mockCookie = `${NAV_LOGO_POSITION_COOKIE}=contractor_top; path=/; max-age=3600`;
      expect(readStoredNavLogoPosition()).toBe('contractor_top');
    });

    it('writes position to both localStorage and cookie, and dispatches custom event', () => {
      writeStoredNavLogoPosition('contractor_top');

      expect(mockStorage[NAV_LOGO_POSITION_STORAGE_KEY]).toBe('contractor_top');
      expect(mockCookie).toContain(`${NAV_LOGO_POSITION_COOKIE}=contractor_top`);
      expect(dispatchEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NAV_CUSTOMIZATION_EVENT,
        }),
      );
    });
  });

  describe('Settings Tab Anchors', () => {
    it('resolves #customization and #branding to account tab', () => {
      const mockTabs = [
        { id: 'plan', label: 'Plan', anchors: ['plan-fit'], content: null },
        { id: 'account', label: 'Login & security', anchors: ['appearance', 'customization', 'branding', 'nav-branding', 'copilot'], content: null },
        { id: 'business', label: 'Business', anchors: ['business-basics'], content: null },
      ];

      expect(resolveTabForHash(mockTabs, 'customization')).toBe('account');
      expect(resolveTabForHash(mockTabs, 'branding')).toBe('account');
      expect(resolveTabForHash(mockTabs, 'nav-branding')).toBe('account');
      expect(resolveTabForHash(mockTabs, 'copilot')).toBe('account');
    });
  });
});
