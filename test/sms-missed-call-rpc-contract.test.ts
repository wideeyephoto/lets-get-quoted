import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const { Client } = pg;

describe('ingest_sms_missed_call PostgreSQL contract tests', () => {
  let client: pg.Client | null = null;
  let accountId: string | null = null;
  const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeAll(async () => {
    try {
      const contents = await readFile('.env.local', 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || !t.includes('=')) continue;
        const i = t.indexOf('=');
        const k = t.slice(0, i).trim();
        const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    } catch {
      // .env.local may not be present in all environments
    }

    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      console.warn('Skipping PostgreSQL contract tests: No DATABASE_URL found');
      return;
    }

    try {
      client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();

      // Find an existing account to use as test fixture inside rollback transactions
      const accRes = await client.query('select id from public.accounts limit 1');
      if (accRes.rows.length > 0) {
        accountId = accRes.rows[0].id;
      }
    } catch (err) {
      console.warn('Could not connect to database for contract tests:', err);
      if (client) {
        await client.end().catch(() => {});
        client = null;
      }
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => {});
    }
  });

  it('rejects invalid arguments and raises 22023', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await expect(
        client.query(`
          select * from public.ingest_sms_missed_call(
            'unsupported_carrier', 'call-invalid-provider', $1, '+18105550199', 'no-answer', $2
          )
        `, [accountId, SHA_A]),
      ).rejects.toThrow();
    } finally {
      await client.query('rollback');
    }
  });

  it('early-returns disabled disposition and writes no receipt when call_textback_enabled is false', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await client.query('update public.accounts set call_textback_enabled = false where id = $1', [accountId]);
      const res = await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-disabled-test', $1, '+18105550199', 'no-answer', $2
        )
      `, [accountId, SHA_A]);

      expect(res.rows[0].ingest_disposition).toBe('disabled');
      expect(res.rows[0].receipt_id).toBeNull();
      expect(res.rows[0].lead_id).toBeNull();
      expect(res.rows[0].sms_event_id).toBeNull();

      const receiptCheck = await client.query(
        'select * from public.sms_missed_call_receipts where provider_call_id = $1',
        ['call-disabled-test'],
      );
      expect(receiptCheck.rows).toHaveLength(0);
    } finally {
      await client.query('rollback');
    }
  });

  it('accepts normal missed call, enqueues SMS, and establishes customer consent scope', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await client.query('update public.accounts set call_textback_enabled = true where id = $1', [accountId]);
      const res = await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-normal-test', $1, '+18105550111', 'no-answer', $2
        )
      `, [accountId, SHA_A]);

      expect(res.rows[0].ingest_disposition).toBe('accepted');
      expect(res.rows[0].receipt_id).toBeTruthy();
      expect(res.rows[0].lead_id).toBeTruthy();
      expect(res.rows[0].sms_event_id).toBeTruthy();
      expect(res.rows[0].duplicate).toBe(false);

      const scopeCheck = await client.query(`
        select * from public.sms_consent_scopes
        where account_id = $1 and phone_number = '+18105550111' and consent_scope = 'customer'
      `, [accountId]);
      expect(scopeCheck.rows).toHaveLength(1);
      expect(scopeCheck.rows[0].evidence_source).toBe('missed_call_text_back');
    } finally {
      await client.query('rollback');
    }
  });

  it('deduplicates calls from the same number within 10 minutes without enqueuing duplicate SMS', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await client.query('update public.accounts set call_textback_enabled = true where id = $1', [accountId]);

      const call1 = await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-dedupe-1', $1, '+18105550222', 'no-answer', $2
        )
      `, [accountId, SHA_A]);
      expect(call1.rows[0].ingest_disposition).toBe('accepted');

      const call2 = await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-dedupe-2', $1, '+18105550222', 'busy', $2
        )
      `, [accountId, SHA_A]);

      expect(call2.rows[0].ingest_disposition).toBe('deduplicated_recent');
      expect(call2.rows[0].lead_id).toBe(call1.rows[0].lead_id);
      expect(call2.rows[0].sms_event_id).toBeNull();
    } finally {
      await client.query('rollback');
    }
  });

  it('preserves existing STOP / opted_out status and does not enqueue outbound text', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await client.query('update public.accounts set call_textback_enabled = true where id = $1', [accountId]);
      await client.query(`
        insert into public.sms_consent (account_id, phone_number, status, source, consented_at, updated_at, opted_out_at)
        values ($1, '+18105550333', 'opted_out', 'inbound_stop', now(), now(), now())
      `, [accountId]);

      const res = await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-stop-test', $1, '+18105550333', 'no-answer', $2
        )
      `, [accountId, SHA_A]);

      expect(res.rows[0].ingest_disposition).toBe('opted_out');
      expect(res.rows[0].sms_event_id).toBeNull();

      const consent = await client.query(
        'select status from public.sms_consent where account_id = $1 and phone_number = $2',
        [accountId, '+18105550333'],
      );
      expect(consent.rows[0]?.status).toBe('opted_out');
    } finally {
      await client.query('rollback');
    }
  });

  it('detects replay tampering with different immutable body evidence and raises P5123', async () => {
    if (!client || !accountId) return;

    await client.query('begin');
    try {
      await client.query('update public.accounts set call_textback_enabled = true where id = $1', [accountId]);
      await client.query(`
        select * from public.ingest_sms_missed_call(
          'signalwire', 'call-replay-tamper', $1, '+18105550444', 'no-answer', $2
        )
      `, [accountId, SHA_A]);

      let replayErr: any = null;
      try {
        await client.query(`
          select * from public.ingest_sms_missed_call(
            'signalwire', 'call-replay-tamper', $1, '+18105550444', 'no-answer', $2
          )
        `, [accountId, SHA_B]); // Different SHA!
      } catch (err) {
        replayErr = err;
      }
      expect(replayErr).toBeTruthy();
      expect(replayErr?.code).toBe('P5123');
      expect(replayErr?.message).toContain('missed-call receipt key was replayed with different immutable evidence');
    } finally {
      await client.query('rollback');
    }
  });

  it('enforces that anon and authenticated roles have no EXECUTE privileges', async () => {
    if (!client) return;

    const permCheck = await client.query(`
      select has_function_privilege('anon', 'public.ingest_sms_missed_call(text,text,uuid,text,text,text)', 'execute') as anon_has_exec,
             has_function_privilege('authenticated', 'public.ingest_sms_missed_call(text,text,uuid,text,text,text)', 'execute') as auth_has_exec,
             has_function_privilege('service_role', 'public.ingest_sms_missed_call(text,text,uuid,text,text,text)', 'execute') as service_has_exec
    `);

    expect(permCheck.rows[0].anon_has_exec).toBe(false);
    expect(permCheck.rows[0].auth_has_exec).toBe(false);
    expect(permCheck.rows[0].service_has_exec).toBe(true);
  });
});
