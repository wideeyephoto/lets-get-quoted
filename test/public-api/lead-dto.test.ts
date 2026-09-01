import { describe, it, expect } from 'vitest';
import {
  toPublicLeadDto,
  parseCreateLeadInput,
  parseUpdateLeadInput,
} from '@/lib/public-api/lead-dto';
import type { Lead } from '@/lib/leads';

describe('Public Lead DTO & Validation', () => {
  const sampleLead: Lead = {
    id: 'lead-uuid-1234',
    account_id: 'acc-uuid-5678',
    name: 'Jane Doe',
    phone: '555-123-4567',
    email: 'jane@example.com',
    address: '123 Main St, Springfield',
    project_type: 'Roof Repair',
    message: 'Need an estimate asap',
    estimated_hours: 4.5,
    status: 'new',
    source: 'website_form',
    quote_visit: null,
    photo_paths: [],
    source_page: null,
    converted_job: null,
    client_id: null,
    lat: null,
    lng: null,
    geocoded_at: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:30:00Z',
    triage: {
      score: 'hot',
      flags: [],
      timeline: '2 weeks',
      contactPreference: 'any',
    },
  };

  it('maps internal lead record to public DTO shape', () => {
    const dto = toPublicLeadDto(sampleLead);
    expect(dto.id).toBe('lead-uuid-1234');
    expect(dto.customer.name).toBe('Jane Doe');
    expect(dto.customer.phone).toBe('555-123-4567');
    expect(dto.customer.email).toBe('jane@example.com');
    expect(dto.customer.address).toBe('123 Main St, Springfield');
    expect(dto.project.project_type).toBe('Roof Repair');
    expect(dto.status).toBe('new');
    expect(dto.triage.score).toBe('hot');
    // Internal fields not in DTO
    expect((dto as unknown as Record<string, unknown>).account_id).toBeUndefined();
  });

  it('validates required fields on lead creation', () => {
    const valid = parseCreateLeadInput({
      name: 'Bob Builder',
      phone: '555-987-6543',
      email: 'bob@example.com',
      project_type: 'Deck Installation',
    });
    expect(valid.errors).toBeUndefined();
    expect(valid.leadInput.name).toBe('Bob Builder');
    expect(valid.leadInput.phone).toBe('555-987-6543');

    const invalid = parseCreateLeadInput({
      email: 'no-name@example.com',
    });
    expect(invalid.errors).toBeDefined();
    expect(invalid.errors?.length).toBeGreaterThan(0);
    expect(invalid.errors?.[0]).toContain('name');
  });

  it('rejects attempts to mark lead "won" directly via Public API patch', () => {
    const wonAttempt = parseUpdateLeadInput({
      status: 'won',
    });
    expect(wonAttempt.errors).toBeDefined();
    expect(wonAttempt.errors?.[0]).toContain('won');
  });

  it('allows safe updates to contact info and status', () => {
    const validPatch = parseUpdateLeadInput({
      name: 'Jane Smith',
      status: 'quoted',
      score: 'hot',
    });
    expect(validPatch.errors).toBeUndefined();
    expect(validPatch.patch.name).toBe('Jane Smith');
    expect(validPatch.patch.status).toBe('quoted');
    expect(validPatch.patch.triage?.score).toBe('hot');
  });
});
