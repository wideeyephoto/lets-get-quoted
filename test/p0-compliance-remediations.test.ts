import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadSuppressedEmails, isEmailSuppressed, suppressEmail } from '../src/lib/email-suppression';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('P0 Compliance & Migration Remediations', () => {
  describe('SMS Crew Field Intake Migration (20260830120000_crew_field_intake.sql)', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/20260830120000_crew_field_intake.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    it('does not contain invalid processing_state = applied', () => {
      expect(sql).not.toContain("processing_state = 'applied'");
      expect(sql).toContain("processing_state = 'processed'");
    });

    it('includes required summary column in account_events insert', () => {
      expect(sql).toMatch(/insert into public\.account_events\s*\(\s*account_id,\s*kind,\s*summary,\s*meta\s*\)/i);
    });
  });

  describe('RLS Policy Lockdown (schema.sql & 20260830140000_harden_consent_and_suppression_rls.sql)', () => {
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../schema.sql'), 'utf-8');
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../migrations/20260830140000_harden_consent_and_suppression_rls.sql'),
      'utf-8'
    );

    it('schema.sql restricts sms_consent and email_suppression to SELECT only', () => {
      expect(schemaSql).not.toContain('create policy sms_consent_all on sms_consent  for all');
      expect(schemaSql).not.toContain('create policy email_suppression_all on email_suppression for all');
      expect(schemaSql).toContain('create policy sms_consent_owner_read on sms_consent for select using ( is_owner(account_id) )');
      expect(schemaSql).toContain('create policy email_suppression_owner_read on email_suppression for select using ( is_owner(account_id) )');
    });

    it('migration file defines owner_read policies with for select', () => {
      expect(migrationSql).toMatch(/create policy sms_consent_owner_read on public\.sms_consent\s+for select/);
      expect(migrationSql).toMatch(/create policy email_suppression_owner_read on public\.email_suppression\s+for select/);
    });
  });

  describe('Email Suppression Fail-Closed Behavior', () => {
    it('loadSuppressedEmails throws on query error instead of returning empty Set', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database unreachable' },
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(loadSuppressedEmails(mockSupabase, 'acc-123')).rejects.toThrow(
        'Failed to load email suppression list: Database unreachable'
      );
    });

    it('isEmailSuppressed throws on query error instead of returning false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Connection timeout' },
                  }),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(isEmailSuppressed(mockSupabase, 'acc-123', 'test@example.com')).rejects.toThrow(
        'Email suppression lookup failed: Connection timeout'
      );
    });

    it('suppressEmail returns false and logs error on insert failure', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_suppression') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: { message: 'Unique constraint violation or foreign key error' } }),
            };
          }
          return {};
        }),
      } as unknown as SupabaseClient;

      const result = await suppressEmail(mockSupabase, 'acc-123', 'test@example.com');
      expect(result).toBe(false);
    });
  });
});
