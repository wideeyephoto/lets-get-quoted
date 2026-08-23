import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What the Office team card promises has to match what the invitation does.
 *
 * It said, in bold, that an office user "can't open anything yet" and that an
 * invitation "connects an account and nothing more". Meanwhile RLS honoured the
 * capability table, and `20260820220000` had enabled thirteen capabilities — six
 * of which are consulted by a live policy:
 *
 *     clients.read/write  -> clients  SELECT INSERT UPDATE DELETE
 *     jobs.read/write     -> jobs     SELECT INSERT UPDATE DELETE
 *     leads.read/write    -> leads    SELECT INSERT UPDATE DELETE
 *
 * So inviting a receptionist handed over the whole customer book, with delete.
 * The dashboard only routes them to the leads board, but the dashboard is not
 * the boundary — the anon key ships to the browser and their session token
 * reaches PostgREST directly.
 *
 * Both halves were wrong: the grant was too wide AND the copy rounded it to
 * zero. Migration 20260823140000 takes clients and jobs back; this pins the copy
 * to what is left.
 */

const section = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'OfficeTeamSection.tsx'),
  'utf8',
);

/** Prose removed, so a comment explaining a removed claim is not the claim. */
const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const copy = stripComments(section);

describe('the office invite card', () => {
  it('no longer claims an invitation grants nothing', () => {
    expect(copy).not.toMatch(/connects an account and nothing more/i);
    expect(copy).not.toMatch(/can.{0,3}t open anything yet/i);
  });

  it('names the surface they actually get', () => {
    expect(copy).toMatch(/leads board/i);
  });

  it('says what they still cannot reach, rather than implying it', () => {
    // A contractor deciding whether to hand a seat to a receptionist needs the
    // negative list as much as the positive one.
    for (const withheld of ['clients', 'invoices', 'payments', 'billing', 'settings']) {
      expect(copy.toLowerCase(), `does not mention ${withheld} is withheld`).toContain(withheld);
    }
  });
});

describe('the capabilities that made the old copy false', () => {
  const migrations = join(process.cwd(), 'migrations');
  const disabling = readdirSync(migrations).find((f) => f.includes('office_clients_jobs_not_yet'));

  it('has a migration taking clients and jobs back', () => {
    expect(disabling, 'no migration disables the clients/jobs office capabilities').toBeTruthy();
  });

  it('disables all four, not a subset', () => {
    // clients.read without clients.write still exposes the whole customer list.
    const sql = readFileSync(join(migrations, disabling as string), 'utf8');
    for (const capability of ['clients.read', 'clients.write', 'jobs.read', 'jobs.write']) {
      expect(sql, `${capability} is not disabled`).toContain(`'${capability}'`);
    }
    expect(sql).toMatch(/set enabled = false/);
  });

  it('leaves the leads capabilities alone, because that surface works', () => {
    const sql = readFileSync(join(migrations, disabling as string), 'utf8');
    const statement = sql.slice(sql.indexOf('set enabled = false'), sql.indexOf('do $$'));
    expect(statement).not.toContain("'leads.read'");
    expect(statement).not.toContain("'leads.write'");
  });

  it('asserts the policies still consult office_can, or the switch is inert', () => {
    // Disabling a capability only matters while something reads it.
    const sql = readFileSync(join(migrations, disabling as string), 'utf8');
    expect(sql).toContain('office_can');
    expect(sql).toMatch(/this switch is inert/i);
  });
});
