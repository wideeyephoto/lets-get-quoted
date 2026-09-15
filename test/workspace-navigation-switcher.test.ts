import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const LAYOUT = stripJs(read('src', 'app', 'dashboard', 'layout.tsx'));
const SHELL = stripJs(read('src', 'components', 'app-shell.tsx'));
const API = stripJs(read('src', 'app', 'api', 'account', 'status', 'route.ts'));
const GLOBALS = read('src', 'app', 'globals.css').replace(/\r\n/g, '\n');
const GLOBALS_LITE = read('src', 'app', 'globals-lite.css').replace(/\r\n/g, '\n');

describe('workspace navigation switcher integration', () => {
  describe('dashboard layout cleanliness', () => {
    it('does not render any standalone switch workspace link in dashboard layout', () => {
      expect(LAYOUT).not.toContain('Switch workspace');
      expect(LAYOUT).not.toContain('href="/workspaces"');
    });
  });

  describe('account status API workspaces exposure', () => {
    it('queries memberships with accounts to expose available workspaces', () => {
      expect(API).toContain("from('memberships')");
      expect(API).toContain("accounts(business_name)");
      expect(API).toContain('workspaces: workspacesList');
      expect(API).toContain('hasMultipleWorkspaces');
    });

    it('filters out deactivated memberships and non-dashboard roles', () => {
      expect(API).toContain('!m.deactivated_at');
      expect(API).toContain("m.role === 'owner' || m.role === 'office'");
    });
  });

  describe('app shell navigation workspace switcher', () => {
    it('imports selectWorkspaceAction for seamless form action switching', () => {
      expect(SHELL).toMatch(/import\s*\{[^}]*selectWorkspaceAction[^}]*\}\s*from\s*['"]@\/app\/workspaces\/actions['"]/);
    });

    it('stores workspaces in component state from account status', () => {
      expect(SHELL).toContain('const [workspaces, setWorkspaces] = useState<ShellWorkspace[]>([]);');
      expect(SHELL).toContain('setWorkspaces(Array.isArray(data.workspaces) ? data.workspaces : []);');
    });

    it('renders static business name when user has only 1 workspace or fewer', () => {
      expect(SHELL).toContain('workspaces.length > 1 ? (');
      expect(SHELL).toContain('<p className="sidenav-bizname" title={businessName}>{businessName}</p>');
    });

    it('renders interactive workspace switcher trigger and menu when workspaces.length > 1', () => {
      expect(SHELL).toContain('className="sidenav-workspace-wrap"');
      expect(SHELL).toContain('className="sidenav-workspace-trigger"');
      expect(SHELL).toContain('className="sidenav-workspace-name"');
      expect(SHELL).toContain('sidenav-workspace-caret');
      expect(SHELL).toContain('renderWorkspaceMenu');
    });

    it('implements accessible menu controls with keyboard support', () => {
      expect(SHELL).toContain('aria-haspopup="menu"');
      expect(SHELL).toContain('aria-expanded={isWorkspaceMenuOpen}');
      expect(SHELL).toContain('aria-controls="sidenav-workspace-menu"');
      expect(SHELL).toContain("event.key === 'Escape'");
      expect(SHELL).toContain("ArrowDown");
      expect(SHELL).toContain("ArrowUp");
    });

    it('wires each workspace switch item to selectWorkspaceAction with its accountId', () => {
      expect(SHELL).toContain('<form key={ws.accountId} action={selectWorkspaceAction}');
      expect(SHELL).toContain('<input type="hidden" name="accountId" value={ws.accountId} />');
      expect(SHELL).toContain('disabled={ws.isCurrent}');
    });
  });

  describe('css styling across both full and lite stylesheets', () => {
    it('defines workspace wrap, trigger, and menu in globals-lite.css and globals.css', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toContain('.sidenav-workspace-wrap');
        expect(css).toContain('.sidenav-workspace-trigger');
        expect(css).toContain('.sidenav-workspace-name');
        expect(css).toContain('.sidenav-workspace-caret');
        expect(css).toContain('.sidenav-workspace-menu');
        expect(css).toContain('.sidenav-workspace-item');
      }
    });

    it('hides the workspace switcher wrap when navigation rail is collapsed', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toContain('.sidenav.collapsed .sidenav-workspace-wrap');
      }
    });

    it('includes high-contrast sunlight theme rules', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toContain(":root[data-theme='sunlight'] .sidenav-workspace-menu");
        expect(css).toContain(":root[data-theme='sunlight'] .sidenav-workspace-item");
      }
    });
  });
});
