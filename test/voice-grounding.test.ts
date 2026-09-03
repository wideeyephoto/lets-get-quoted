import { describe, expect, it } from 'vitest';
import { buildVoicePostPrompt, buildVoiceSystemPrompt, type VoiceGroundingContext } from '@/lib/voice/grounding';

describe('buildVoiceSystemPrompt', () => {
  it('constructs tailored system instructions containing trade, services, areas, and schedule slots', () => {
    const context: VoiceGroundingContext = {
      companyName: 'Apex Plumbing & Heating',
      trade: 'plumber',
      serviceNames: ['Emergency Leak Repair', 'Water Heater Installation', 'Drain Cleaning'],
      serviceAreas: 'Maplewood, South Orange, Millburn',
      availableSlots: ['Wednesday, Aug 26 (Morning: 8 AM – 12 PM)', 'Thursday, Aug 27 (Afternoon: 1 PM – 5 PM)'],
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('Apex Plumbing & Heating');
    expect(prompt).toContain('plumber');
    expect(prompt).toContain('Maplewood, South Orange, Millburn');
    expect(prompt).toContain('Emergency Leak Repair, Water Heater Installation, Drain Cleaning');
    expect(prompt).toContain('Wednesday, Aug 26 (Morning: 8 AM – 12 PM)');
  });

  it('handles fallback defaults gracefully when services or areas are unspecified', () => {
    const context: VoiceGroundingContext = {
      companyName: 'BrokePipes LLC',
      trade: 'home services contractor',
      serviceNames: [],
      serviceAreas: 'the local area',
      availableSlots: [],
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('BrokePipes LLC');
    expect(prompt).toContain('home services contractor');
    expect(prompt).toContain('We provide professional home services contractor services.');
  });

  it('only claims business is licensed if verified licensing data is present', () => {
    const unlicensedContext: VoiceGroundingContext = {
      companyName: 'Quick Clean Gutters',
      trade: 'gutter specialist',
      serviceNames: ['Gutter Cleaning'],
      serviceAreas: 'Detroit',
      availableSlots: [],
      isLicensed: false,
    };
    const unlicensedPrompt = buildVoiceSystemPrompt(unlicensedContext);
    expect(unlicensedPrompt).toContain('a professional gutter specialist business');
    expect(unlicensedPrompt).not.toContain('a licensed gutter specialist business');

    const licensedContext: VoiceGroundingContext = {
      companyName: 'Master Volt Electric',
      trade: 'electrician',
      serviceNames: ['EV Charger Install'],
      serviceAreas: 'Ann Arbor',
      availableSlots: [],
      isLicensed: true,
      licenseNumber: 'LIC-998822',
    };
    const licensedPrompt = buildVoiceSystemPrompt(licensedContext);
    expect(licensedPrompt).toContain('a licensed electrician business');
  });

  it('incorporates recognized returning caller context into the system prompt', () => {
    const context: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: ['Drain Cleaning'],
      serviceAreas: 'Royal Oak',
      availableSlots: [],
      recognizedCaller: {
        clientName: 'Sarah Connor',
        serviceAddress: '450 Oak St',
        activeJobRef: 'JOB-992',
        activeJobScope: 'Tankless Water Heater Installation',
        scheduledFor: '2026-08-28 at 09:00',
      },
    };

    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Sarah Connor');
    expect(prompt).toContain('450 Oak St');
    expect(prompt).toContain('JOB-992');
    expect(prompt).toContain('Tankless Water Heater Installation');
    expect(prompt).toContain('2026-08-28 at 09:00');
  });

  it('injects tailored persona instructions based on configured voiceTone', () => {
    const friendlyContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'friendly',
    };
    expect(buildVoiceSystemPrompt(friendlyContext)).toContain('Warm, neighborly, and empathetic');

    const dispatcherContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'urgent_dispatcher',
    };
    expect(buildVoiceSystemPrompt(dispatcherContext)).toContain('Focused, rapid, and safety-first');

    const professionalContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'professional',
    };
    expect(buildVoiceSystemPrompt(professionalContext)).toContain('Polished, professional, and clear');
  });
});

describe('buildVoicePostPrompt', () => {
  it('includes key structured intake dimensions in JSON schema format', () => {
    const postPrompt = buildVoicePostPrompt();
    expect(postPrompt).toContain('caller_name');
    expect(postPrompt).toContain('caller_phone');
    expect(postPrompt).toContain('service_address');
    expect(postPrompt).toContain('work_requested');
    expect(postPrompt).toContain('urgency');
    expect(postPrompt).toContain('is_emergency');
    expect(postPrompt).toContain('requested_slot');
    expect(postPrompt).toContain('follow_up_action');
  });
});

describe('loadVoiceGroundingContext', () => {
  const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

  function createMockSupabase(db: {
    accounts?: Record<string, unknown> | null;
    sites?: Record<string, unknown> | null;
    voice_settings?: Record<string, unknown> | null;
    memberships?: Array<Record<string, unknown>>;
    crew?: Array<Record<string, unknown>>;
    jobs?: Array<Record<string, unknown>>;
    leads?: Array<Record<string, unknown>>;
  }) {
    const selectedColumns: Record<string, string[]> = {};

    const client = {
      selectedColumns,
      auth: {
        admin: {
          getUserById: async (userId: string) => {
            if (userId === 'user-owner-1') {
              return {
                data: {
                  user: {
                    id: 'user-owner-1',
                    phone: '+12485559999',
                    user_metadata: { full_name: 'Brett Smith' },
                  },
                },
                error: null,
              };
            }
            if (userId === 'user-office-1') {
              return {
                data: {
                  user: {
                    id: 'user-office-1',
                    phone: '+12485554321',
                    user_metadata: { full_name: 'Clara Office' },
                  },
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        },
      },
      from: (table: string) => {
        let inValues: unknown[] | null = null;
        let inColumn: string | null = null;

        const chain: Record<string, unknown> = {
          select: (cols: string) => {
            selectedColumns[table] = cols.split(',').map((c) => c.trim());
            return chain;
          },
          eq: () => chain,
          is: () => chain,
          in: (col: string, vals: unknown[]) => {
            inColumn = col;
            inValues = vals;
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            if (table === 'accounts') return { data: db.accounts ?? null, error: null };
            if (table === 'sites') return { data: db.sites ?? null, error: null };
            if (table === 'voice_settings') return { data: db.voice_settings ?? null, error: null };
            if (table === 'memberships') return { data: db.memberships?.[0] ?? null, error: null };
            if (table === 'jobs') {
              if (inColumn && inValues && db.jobs) {
                const match = db.jobs.find((j) => inValues!.includes(j[inColumn!]));
                return { data: match ?? null, error: null };
              }
              return { data: db.jobs?.[0] ?? null, error: null };
            }
            if (table === 'leads') {
              if (inColumn && inValues && db.leads) {
                const match = db.leads.find((l) => inValues!.includes(l[inColumn!]));
                return { data: match ?? null, error: null };
              }
              return { data: db.leads?.[0] ?? null, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: (v: unknown) => unknown) => {
            if (table === 'crew') {
              return resolve({ data: db.crew ?? [], error: null });
            }
            if (table === 'memberships') {
              return resolve({ data: db.memberships ?? [], error: null });
            }
            return resolve({ data: [], error: null });
          },
        };

        return chain;
      },
    };

    return client as unknown as import('@supabase/supabase-js').SupabaseClient & {
      selectedColumns: Record<string, string[]>;
    };
  }

  it('recognizes the owner calling from alert_phone (even if formatted) and sets contractorStaffCaller', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: {
        id: ACCOUNT_ID,
        business_name: 'Apex Plumbing',
        alert_phone: '(248) 555-0117',
        call_forward_number: '+12485550199',
        timezone: 'America/New_York',
      },
      sites: {
        company_name: 'Apex Plumbing LLC',
        phone: '248-555-0100',
        content: { trade: 'Plumbing', serviceAreas: { cities: ['Royal Oak'] } },
      },
      memberships: [{ user_id: 'user-owner-1', role: 'owner' }],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485550117');

    expect(context.contractorStaffCaller).toEqual({
      name: 'Apex Plumbing',
      role: 'owner',
    });
    expect(context.recognizedCaller).toBeNull();

    // A direct workspace owner-number match uses the live business identity and
    // never depends on a separate auth lookup to grant privileged mode.
    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('[ROLE & IDENTITY - CONTRACTOR VOICE ASSISTANT]');
    expect(prompt).toContain('Hey Apex, what job or lead are you updating today?');
    expect(prompt).not.toContain('Warmly collect or verify the caller\'s intake details');

    // Verify accounts query never queried non-existent columns (e.g. owner_phone, full_name, company_name)
    expect(mockAdmin.selectedColumns.accounts).not.toContain('owner_phone');
    expect(mockAdmin.selectedColumns.accounts).not.toContain('full_name');
    expect(mockAdmin.selectedColumns.accounts).not.toContain('company_name');
  });

  it('recognizes the owner calling from call_forward_number', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: {
        id: ACCOUNT_ID,
        business_name: 'Apex Plumbing',
        alert_phone: null,
        call_forward_number: '248-555-0199',
        timezone: 'America/New_York',
      },
      sites: { company_name: 'Apex Plumbing LLC' },
      memberships: [{ user_id: 'user-owner-1', role: 'owner' }],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485550199');

    expect(context.contractorStaffCaller).toEqual({
      name: 'Apex Plumbing',
      role: 'owner',
    });
  });

  it('recognizes active crew member calling from their crew phone', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: {
        id: ACCOUNT_ID,
        business_name: 'Apex Plumbing',
        alert_phone: '248-555-0117',
      },
      crew: [
        {
          id: 'c-1',
          name: 'Dave Miller',
          phone: '(248) 555-7788',
          active: true,
          user_id: 'user-crew-1',
          last_signed_in_at: '2026-09-01T14:00:00Z',
          phone_verified_at: null,
          phone_verified: false,
          hourly_rate: 35,
          burden_pct: 18,
        },
        {
          id: 'c-2',
          name: 'Inactive Bob',
          phone: '248-555-9999',
          active: false,
          user_id: null,
          last_signed_in_at: null,
          phone_verified_at: null,
          phone_verified: false,
        },
      ],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485557788');

    expect(context.contractorStaffCaller).toEqual({
      name: 'Dave Miller',
      role: 'crew',
    });

    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Hey Dave, what job or lead are you updating today?');
  });

  it('does not grant contractor mode or customer recognition to an unverified crew phone', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: { id: ACCOUNT_ID, business_name: 'Apex Plumbing' },
      crew: [{
        id: 'c-unverified',
        name: 'Unverified Crew',
        phone: '(248) 555-7788',
        active: true,
        user_id: null,
        last_signed_in_at: null,
        phone_verified_at: null,
        phone_verified: false,
      }],
      jobs: [{
        ref: 'JOB-UNSAFE',
        client_name: 'Should Not Leak',
        client_phone: '(248) 555-7788',
        address: '123 Private St',
        scope: 'Private scope',
      }],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485557788');

    expect(context.contractorStaffCaller).toBeNull();
    expect(context.recognizedCaller).toBeNull();
    expect(buildVoiceSystemPrompt(context)).not.toContain('[ROLE & IDENTITY - CONTRACTOR VOICE ASSISTANT]');
    expect(buildVoiceSystemPrompt(context)).not.toContain('Should Not Leak');
  });

  it('recognizes returning customer with formatted client_phone on a job', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: { id: ACCOUNT_ID, business_name: 'Apex Plumbing' },
      jobs: [
        {
          ref: 'JOB-77',
          client_name: 'Alice Johnson',
          client_phone: '(248) 555-3344',
          address: '742 Evergreen Terrace',
          scope: 'Fix water heater',
          scheduled_for: '2026-09-05',
          scheduled_time: '10:00',
        },
      ],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485553344');

    expect(context.contractorStaffCaller).toBeNull();
    expect(context.recognizedCaller).toEqual({
      clientName: 'Alice Johnson',
      serviceAddress: '742 Evergreen Terrace',
      activeJobRef: 'JOB-77',
      activeJobScope: 'Fix water heater',
      scheduledFor: '2026-09-05 at 10:00',
    });

    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Alice Johnson');
    expect(prompt).toContain('JOB-77');
  });

  it('recognizes office staff calling from verified auth user phone', async () => {
    const { loadVoiceGroundingContext } = await import('@/lib/voice/grounding');

    const mockAdmin = createMockSupabase({
      accounts: { id: ACCOUNT_ID, business_name: 'Apex Plumbing' },
      memberships: [{ user_id: 'user-office-1', role: 'office' }],
    });

    const context = await loadVoiceGroundingContext(mockAdmin, ACCOUNT_ID, '+12485554321');

    expect(context.contractorStaffCaller).toEqual({
      name: 'Clara Office',
      role: 'office',
    });

    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Hey Clara, what job or lead are you updating today?');
  });
});

