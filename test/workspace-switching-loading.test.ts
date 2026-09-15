import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SHELL = stripJs(read('src', 'components', 'app-shell.tsx'));
const PROVIDER = stripJs(read('src', 'components', 'app-shell-provider.tsx'));
const CHOOSER = stripJs(read('src', 'app', 'workspaces', 'WorkspaceChooserItem.tsx'));
const WORKSPACES_PAGE = stripJs(read('src', 'app', 'workspaces', 'page.tsx'));
const GLOBALS = read('src', 'app', 'globals.css').replace(/\r\n/g, '\n');
const GLOBALS_LITE = read('src', 'app', 'globals-lite.css').replace(/\r\n/g, '\n');

describe('workspace switching loading state & dimmed workspace', () => {
  describe('app shell provider context', () => {
    it('exposes switchingWorkspace state and setter', () => {
      expect(PROVIDER).toContain('switchingWorkspace: string | null;');
      expect(PROVIDER).toContain('setSwitchingWorkspace: (name: string | null) => void;');
      expect(PROVIDER).toContain('const [switchingWorkspace, setSwitchingWorkspace] = useState<string | null>(null);');
    });
  });

  describe('app shell loading overlay and dimming', () => {
    it('consumes switchingWorkspace from useAppShell', () => {
      expect(SHELL).toMatch(/useAppShell\(\)/);
      expect(SHELL).toContain('switchingWorkspace');
      expect(SHELL).toContain('setSwitchingWorkspace');
    });

    it('adds is-switching-workspace class to chrome-shell when switching is active', () => {
      expect(SHELL).toContain('is-switching-workspace');
    });

    it('renders WorkspaceSwitchOverlay with accessible status and busy attributes', () => {
      expect(SHELL).toContain('function WorkspaceSwitchOverlay');
      expect(SHELL).toContain('className="workspace-switch-overlay"');
      expect(SHELL).toContain('role="status"');
      expect(SHELL).toContain('aria-live="polite"');
      expect(SHELL).toContain('aria-busy="true"');
    });

    it('displays loading message and spinner inside modal dialog', () => {
      expect(SHELL).toContain('className="workspace-switch-modal"');
      expect(SHELL).toContain('className="workspace-switch-spinner"');
      expect(SHELL).toContain('className="workspace-switch-title"');
      expect(SHELL).toContain('className="workspace-switch-subtitle"');
      expect(SHELL).toContain('Switching to ${workspaceName}…');
      expect(SHELL).toContain('Loading workspace data and live pipeline…');
    });

    it('binds workspace switcher form to startTransition and selectWorkspaceAction', () => {
      expect(SHELL).toContain('handleSwitchWorkspace');
      expect(SHELL).toContain('action={selectWorkspaceAction}');
      expect(SHELL).toContain('onSubmit={(e) => handleSwitchWorkspace(e, ws)}');
      expect(SHELL).toContain('disabled={ws.isCurrent}');
    });

    it('includes safety recovery timer to prevent UI lockup', () => {
      expect(SHELL).toContain('setTimeout');
      expect(SHELL).toContain('15000');
    });
  });

  describe('workspaces picker page integration', () => {
    it('uses WorkspaceChooserItem on /workspaces page', () => {
      expect(WORKSPACES_PAGE).toContain('<WorkspaceChooserItem');
      expect(CHOOSER).toContain('useAppShell');
      expect(CHOOSER).toContain('setSwitchingWorkspace');
      expect(CHOOSER).toContain('action={selectWorkspaceAction}');
    });
  });

  describe('stylesheet definitions across full and lite CSS', () => {
    it('defines dimmed workspace styling and loading overlay in globals.css and globals-lite.css', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toContain('.chrome-shell.is-switching-workspace .app-main');
        expect(css).toContain('.workspace-switch-overlay');
        expect(css).toContain('.workspace-switch-modal');
        expect(css).toContain('.workspace-switch-spinner');
        expect(css).toContain('.workspace-switch-title');
        expect(css).toContain('.workspace-switch-subtitle');
      }
    });

    it('dims underlying content and blocks interactions while switching', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/\.chrome-shell\.is-switching-workspace[\s\S]*?opacity:\s*0\.35/);
        expect(css).toMatch(/\.chrome-shell\.is-switching-workspace[\s\S]*?pointer-events:\s*none/);
        expect(css).toMatch(/\.workspace-switch-overlay[\s\S]*?pointer-events:\s*all/);
        expect(css).toMatch(/\.workspace-switch-overlay[\s\S]*?cursor:\s*wait/);
      }
    });

    it('defines sunlight theme adaptations in both stylesheets', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toContain(":root[data-theme='sunlight'] .workspace-switch-overlay");
        expect(css).toContain(":root[data-theme='sunlight'] .workspace-switch-modal");
        expect(css).toContain(":root[data-theme='sunlight'] .workspace-switch-title");
        expect(css).toContain(":root[data-theme='sunlight'] .workspace-switch-subtitle");
      }
    });
  });
});
