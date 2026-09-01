import type { Lead, LeadInput, LeadSource, LeadStatus } from '@/lib/leads';
import { getLeadTriage } from '@/lib/leads';

export type PublicLeadDto = {
  id: string;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  source: string;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  project: {
    project_type: string | null;
    description: string | null;
    estimated_hours: number | null;
    timeline: string | null;
    photo_urls: string[];
  };
  triage: {
    score: 'hot' | 'warm' | 'low';
    flags: string[];
    contact_preference: 'any' | 'text_only';
  };
  created_at: string;
  updated_at: string;
};

export type PublicCreateLeadInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  project_type?: string | null;
  description?: string | null;
  estimated_hours?: number | null;
  source?: string | null;
  timeline?: string | null;
  contact_preference?: 'any' | 'text_only';
  score?: 'hot' | 'warm' | 'low';
};

export type PublicUpdateLeadInput = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  project_type?: string | null;
  description?: string | null;
  estimated_hours?: number | null;
  status?: 'new' | 'contacted' | 'quoted' | 'lost';
  timeline?: string | null;
  contact_preference?: 'any' | 'text_only';
  score?: 'hot' | 'warm' | 'low';
};

/**
 * Maps an internal database Lead row to a stable, versioned PublicLeadDto.
 */
export function toPublicLeadDto(lead: Lead): PublicLeadDto {
  const triage = getLeadTriage(lead);
  return {
    id: lead.id,
    status: lead.status,
    source: lead.source,
    customer: {
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      email: lead.email ?? null,
      address: lead.address ?? null,
    },
    project: {
      project_type: lead.project_type ?? null,
      description: lead.message ?? null,
      estimated_hours: lead.estimated_hours ?? null,
      timeline: triage.timeline ?? null,
      photo_urls: Array.isArray(lead.photo_paths) ? lead.photo_paths : [],
    },
    triage: {
      score: triage.score,
      flags: triage.flags,
      contact_preference: triage.contactPreference === 'text_only' ? 'text_only' : 'any',
    },
    created_at: new Date(lead.created_at).toISOString(),
    updated_at: new Date(lead.updated_at).toISOString(),
  };
}

/**
 * Validates and converts public creation parameters to internal LeadInput.
 */
export function parseCreateLeadInput(body: unknown): {
  leadInput: LeadInput;
  errors?: string[];
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object.'], leadInput: {} as LeadInput };
  }

  const raw = body as Record<string, unknown>;
  const errors: string[] = [];

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    errors.push('Field "name" is required and must be a non-empty string.');
  }

  const phone = raw.phone === undefined || raw.phone === null ? null : String(raw.phone).trim();
  const email = raw.email === undefined || raw.email === null ? null : String(raw.email).trim().toLowerCase();
  const address = raw.address === undefined || raw.address === null ? null : String(raw.address).trim();
  const projectType = raw.project_type === undefined || raw.project_type === null ? null : String(raw.project_type).trim();
  const message = raw.description === undefined || raw.description === null ? null : String(raw.description).trim();

  let estimatedHours: number | null = null;
  if (raw.estimated_hours !== undefined && raw.estimated_hours !== null) {
    const num = Number(raw.estimated_hours);
    if (!Number.isFinite(num) || num < 0 || num > 1000) {
      errors.push('Field "estimated_hours" must be a positive number between 0 and 1000.');
    } else {
      estimatedHours = Math.round(num * 10) / 10;
    }
  }

  let source: LeadSource = 'website_form';
  if (typeof raw.source === 'string') {
    const cleanSource = raw.source.trim().toLowerCase();
    if (['website_form', 'missed_call', 'manual', 'referral', 'ai_voice'].includes(cleanSource)) {
      source = cleanSource as LeadSource;
    }
  }

  const contactPref = raw.contact_preference === 'text_only' ? 'text_only' : 'any';
  const score = raw.score === 'hot' || raw.score === 'low' ? raw.score : 'warm';
  const timeline = typeof raw.timeline === 'string' ? raw.timeline.trim() : undefined;

  if (errors.length > 0) {
    return { errors, leadInput: {} as LeadInput };
  }

  const leadInput: LeadInput = {
    name,
    phone,
    email,
    address,
    projectType,
    message,
    estimatedHours,
    source,
    triage: {
      score,
      flags: [],
      timeline,
      contactPreference: contactPref,
    },
  };

  return { leadInput };
}

/**
 * Validates and converts public patch parameters for safe updates.
 */
export function parseUpdateLeadInput(body: unknown): {
  patch: Partial<LeadInput> & { status?: LeadStatus };
  errors?: string[];
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object.'], patch: {} };
  }

  const raw = body as Record<string, unknown>;
  const errors: string[] = [];
  const patch: Partial<LeadInput> & { status?: LeadStatus } = {};

  if (raw.name !== undefined) {
    const cleanName = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!cleanName) {
      errors.push('Field "name" cannot be empty.');
    } else {
      patch.name = cleanName;
    }
  }

  if (raw.phone !== undefined) {
    patch.phone = raw.phone === null ? null : String(raw.phone).trim();
  }

  if (raw.email !== undefined) {
    patch.email = raw.email === null ? null : String(raw.email).trim().toLowerCase();
  }

  if (raw.address !== undefined) {
    patch.address = raw.address === null ? null : String(raw.address).trim();
  }

  if (raw.project_type !== undefined) {
    patch.projectType = raw.project_type === null ? null : String(raw.project_type).trim();
  }

  if (raw.description !== undefined) {
    patch.message = raw.description === null ? null : String(raw.description).trim();
  }

  if (raw.estimated_hours !== undefined) {
    if (raw.estimated_hours === null) {
      patch.estimatedHours = null;
    } else {
      const num = Number(raw.estimated_hours);
      if (!Number.isFinite(num) || num < 0 || num > 1000) {
        errors.push('Field "estimated_hours" must be a positive number between 0 and 1000.');
      } else {
        patch.estimatedHours = Math.round(num * 10) / 10;
      }
    }
  }

  if (raw.status !== undefined) {
    const cleanStatus = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
    if (cleanStatus === 'won') {
      errors.push('Direct transition to status "won" is not allowed via public API (requires quote conversion or job completion).');
    } else if (['new', 'contacted', 'quoted', 'lost'].includes(cleanStatus)) {
      patch.status = cleanStatus as LeadStatus;
    } else {
      errors.push('Field "status" must be one of: "new", "contacted", "quoted", "lost".');
    }
  }

  if (raw.score !== undefined || raw.contact_preference !== undefined || raw.timeline !== undefined) {
    patch.triage = {
      score: raw.score === 'hot' || raw.score === 'low' ? raw.score : 'warm',
      flags: [],
      contactPreference: raw.contact_preference === 'text_only' ? 'text_only' : 'any',
      timeline: typeof raw.timeline === 'string' ? raw.timeline.trim() : undefined,
    };
  }

  if (errors.length > 0) {
    return { errors, patch: {} };
  }

  return { patch };
}
