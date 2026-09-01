/**
 * Data access and persistence for Form Templates and Job Form Submissions.
 * Supports Supabase database queries with in-memory resilient fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormCategory, FormTemplate, JobFormSubmission, TradeSpecialization } from './types';
import { PRESET_FORM_TEMPLATES } from './preset-templates';
import { calculateFormCompliance } from './conditional-engine';

// In-memory cache & fallback store for templates & submissions
const inMemoryTemplates = new Map<string, FormTemplate>();
const inMemorySubmissions = new Map<string, JobFormSubmission>();

// Initialize presets in memory
for (const preset of PRESET_FORM_TEMPLATES) {
  inMemoryTemplates.set(preset.id, preset);
}

function normalizeTemplateFromDb(row: Record<string, any>): FormTemplate {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    description: row.description || '',
    category: row.category as FormCategory,
    trade: row.trade as TradeSpecialization,
    requireCustomerSignature: Boolean(row.require_customer_signature),
    customerSignatureDisclaimer: row.customer_signature_disclaimer || undefined,
    requireTechSignature: Boolean(row.require_tech_signature),
    sections: Array.isArray(row.sections) ? row.sections : [],
    isPreset: Boolean(row.is_preset),
    archived: Boolean(row.archived),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

function normalizeSubmissionFromDb(row: Record<string, any>): JobFormSubmission {
  return {
    id: row.id,
    accountId: row.account_id,
    jobId: row.job_id,
    templateId: row.template_id,
    templateSnapshot: row.template_snapshot || {},
    status: row.status,
    values: row.values || {},
    photos: Array.isArray(row.photos) ? row.photos : [],
    techSignature: row.tech_signature || null,
    customerSignature: row.customer_signature || null,
    summary: row.summary || {
      totalItems: 0,
      passedItems: 0,
      failedItems: 0,
      naItems: 0,
      compliancePct: 100,
      criticalIssues: [],
      isCompliant: true,
      unresolvedRequiredCount: 0,
    },
    submittedByCrewId: row.submitted_by_crew_id || null,
    submittedByName: row.submitted_by_name || null,
    submittedAt: row.submitted_at || null,
    customerSignedAt: row.customer_signed_at || null,
    notes: row.notes || null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

/**
 * Lists all active form templates for an account (including preset libraries).
 */
export async function listFormTemplates(
  supabase: SupabaseClient | null,
  accountId: string,
  filter?: {
    category?: FormCategory;
    trade?: TradeSpecialization;
    includePresets?: boolean;
  },
): Promise<FormTemplate[]> {
  const includePresets = filter?.includePresets !== false;
  let customTemplates: FormTemplate[] = [];

  if (supabase) {
    try {
      let query = supabase
        .from('form_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (filter?.category) {
        query = query.eq('category', filter.category);
      }
      if (filter?.trade && filter.trade !== 'all') {
        query = query.in('trade', [filter.trade, 'all']);
      }

      const { data, error } = await query;
      if (!error && data) {
        customTemplates = data.map(normalizeTemplateFromDb);
      }
    } catch {
      // Fallback below
    }
  }

  // If no DB rows or fallback needed, merge with in-memory templates
  const inMemCustom = Array.from(inMemoryTemplates.values()).filter(
    (t) => t.accountId === accountId && !t.archived,
  );
  for (const item of inMemCustom) {
    if (!customTemplates.some((t) => t.id === item.id)) {
      customTemplates.push(item);
    }
  }

  let results: FormTemplate[] = [...customTemplates];

  if (includePresets) {
    const presets = PRESET_FORM_TEMPLATES.filter((preset) => {
      if (filter?.category && preset.category !== filter.category) return false;
      if (filter?.trade && filter.trade !== 'all' && preset.trade !== 'all' && preset.trade !== filter.trade) return false;
      return true;
    });

    results = [...presets, ...customTemplates];
  }

  return results;
}

/**
 * Gets a specific template by ID.
 */
export async function getFormTemplate(
  supabase: SupabaseClient | null,
  accountId: string,
  templateId: string,
): Promise<FormTemplate | null> {
  // Check presets first
  const preset = PRESET_FORM_TEMPLATES.find((p) => p.id === templateId);
  if (preset) return preset;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', templateId)
        .maybeSingle();

      if (!error && data) {
        return normalizeTemplateFromDb(data);
      }
    } catch {
      // Fallback to memory
    }
  }

  return inMemoryTemplates.get(templateId) || null;
}

/**
 * Creates or updates a form template.
 */
export async function saveFormTemplate(
  supabase: SupabaseClient | null,
  accountId: string,
  template: Partial<FormTemplate> & { title: string; category: FormCategory; trade: TradeSpecialization },
): Promise<FormTemplate> {
  const id = template.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const fullTemplate: FormTemplate = {
    id,
    accountId,
    title: template.title,
    description: template.description || '',
    category: template.category,
    trade: template.trade,
    requireCustomerSignature: Boolean(template.requireCustomerSignature),
    customerSignatureDisclaimer: template.customerSignatureDisclaimer,
    requireTechSignature: Boolean(template.requireTechSignature),
    sections: template.sections || [],
    isPreset: false,
    archived: false,
    createdAt: template.createdAt || now,
    updatedAt: now,
  };

  if (supabase) {
    try {
      await supabase.from('form_templates').upsert({
        id: fullTemplate.id,
        account_id: fullTemplate.accountId,
        title: fullTemplate.title,
        description: fullTemplate.description,
        category: fullTemplate.category,
        trade: fullTemplate.trade,
        require_customer_signature: fullTemplate.requireCustomerSignature,
        customer_signature_disclaimer: fullTemplate.customerSignatureDisclaimer,
        require_tech_signature: fullTemplate.requireTechSignature,
        sections: fullTemplate.sections,
        is_preset: false,
        archived: false,
        updated_at: now,
      });
    } catch {
      // Fallback
    }
  }

  inMemoryTemplates.set(id, fullTemplate);
  return fullTemplate;
}

/**
 * Soft deletes / archives a form template.
 */
export async function deleteFormTemplate(
  supabase: SupabaseClient | null,
  accountId: string,
  templateId: string,
): Promise<boolean> {
  if (templateId.startsWith('preset_')) {
    return false; // Cannot delete system presets
  }

  if (supabase) {
    try {
      await supabase
        .from('form_templates')
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('id', templateId);
    } catch {
      // Fallback
    }
  }

  const existing = inMemoryTemplates.get(templateId);
  if (existing) {
    existing.archived = true;
    inMemoryTemplates.set(templateId, existing);
  }
  return true;
}

/**
 * Lists all form submissions associated with a specific job.
 */
export async function listJobFormSubmissions(
  supabase: SupabaseClient | null,
  accountId: string,
  jobId: string,
): Promise<JobFormSubmission[]> {
  let dbSubmissions: JobFormSubmission[] = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('job_form_submissions')
        .select('*')
        .eq('account_id', accountId)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        dbSubmissions = data.map(normalizeSubmissionFromDb);
      }
    } catch {
      // Fallback
    }
  }

  // Merge with memory
  const inMem = Array.from(inMemorySubmissions.values()).filter(
    (s) => s.accountId === accountId && s.jobId === jobId,
  );
  for (const s of inMem) {
    if (!dbSubmissions.some((existing) => existing.id === s.id)) {
      dbSubmissions.push(s);
    }
  }

  return dbSubmissions;
}

/**
 * Gets a specific job form submission.
 */
export async function getJobFormSubmission(
  supabase: SupabaseClient | null,
  accountId: string,
  submissionId: string,
): Promise<JobFormSubmission | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('job_form_submissions')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', submissionId)
        .maybeSingle();

      if (!error && data) {
        return normalizeSubmissionFromDb(data);
      }
    } catch {
      // Fallback
    }
  }

  return inMemorySubmissions.get(submissionId) || null;
}

/**
 * Instantiates a new form submission on a job from a template.
 */
export async function createJobFormSubmission(
  supabase: SupabaseClient | null,
  accountId: string,
  jobId: string,
  templateId: string,
  options?: {
    crewId?: string;
    crewName?: string;
  },
): Promise<JobFormSubmission> {
  const template = await getFormTemplate(supabase, accountId, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // Populate default values
  const defaultValues: Record<string, any> = {};
  for (const sec of template.sections) {
    for (const field of sec.fields) {
      if (field.defaultValue !== undefined) {
        defaultValues[field.id] = field.defaultValue;
      }
    }
  }

  const summary = calculateFormCompliance(template, defaultValues);

  const submission: JobFormSubmission = {
    id,
    accountId,
    jobId,
    templateId,
    templateSnapshot: template,
    status: 'draft',
    values: defaultValues,
    photos: [],
    techSignature: null,
    customerSignature: null,
    summary,
    submittedByCrewId: options?.crewId || null,
    submittedByName: options?.crewName || null,
    submittedAt: null,
    customerSignedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    try {
      await supabase.from('job_form_submissions').insert({
        id: submission.id,
        account_id: submission.accountId,
        job_id: submission.jobId,
        template_id: submission.templateId,
        template_snapshot: submission.templateSnapshot,
        status: submission.status,
        values: submission.values,
        photos: submission.photos,
        tech_signature: submission.techSignature,
        customer_signature: submission.customerSignature,
        summary: submission.summary,
        submitted_by_crew_id: submission.submittedByCrewId,
        submitted_by_name: submission.submittedByName,
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Fallback
    }
  }

  inMemorySubmissions.set(id, submission);
  return submission;
}

/**
 * Saves/updates an existing job form submission with new answers, photos, and signatures.
 */
export async function saveJobFormSubmission(
  supabase: SupabaseClient | null,
  accountId: string,
  submission: JobFormSubmission,
): Promise<JobFormSubmission> {
  const now = new Date().toISOString();
  const summary = calculateFormCompliance(submission.templateSnapshot, submission.values);

  // Compute status
  let status = submission.status;
  if (status !== 'draft') {
    if (summary.failedItems > 0) {
      status = 'needs_remediation';
    } else if (
      submission.templateSnapshot.requireCustomerSignature &&
      !submission.customerSignature
    ) {
      status = 'awaiting_customer_signature';
    } else if (submission.customerSignature || summary.isCompliant || status === 'completed') {
      status = 'completed';
    } else {
      status = 'submitted';
    }
  }

  const updated: JobFormSubmission = {
    ...submission,
    summary,
    status,
    updatedAt: now,
  };

  if (supabase) {
    try {
      await supabase.from('job_form_submissions').upsert({
        id: updated.id,
        account_id: updated.accountId,
        job_id: updated.jobId,
        template_id: updated.templateId,
        template_snapshot: updated.templateSnapshot,
        status: updated.status,
        values: updated.values,
        photos: updated.photos,
        tech_signature: updated.techSignature,
        customer_signature: updated.customerSignature,
        summary: updated.summary,
        submitted_by_crew_id: updated.submittedByCrewId,
        submitted_by_name: updated.submittedByName,
        submitted_at: updated.submittedAt,
        customer_signed_at: updated.customerSignedAt,
        notes: updated.notes,
        updated_at: now,
      });
    } catch {
      // Fallback
    }
  }

  inMemorySubmissions.set(updated.id, updated);
  return updated;
}

/**
 * E-signs a completion certificate by the customer via client portal.
 */
export async function signCustomerFormSubmission(
  supabase: SupabaseClient | null,
  submissionId: string,
  signatureData: {
    signaturePath: string;
    signerName: string;
    ip?: string;
  },
): Promise<JobFormSubmission | null> {
  let submission: JobFormSubmission | null = inMemorySubmissions.get(submissionId) || null;

  if (!submission && supabase) {
    try {
      const { data } = await supabase
        .from('job_form_submissions')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle();
      if (data) {
        submission = normalizeSubmissionFromDb(data);
      }
    } catch {
      // Fallback
    }
  }

  if (!submission) return null;

  const now = new Date().toISOString();
  submission.customerSignature = {
    path: signatureData.signaturePath,
    name: signatureData.signerName,
    title: 'Homeowner / Authorized Client',
    signedAt: now,
    ip: signatureData.ip || '127.0.0.1',
  };
  submission.customerSignedAt = now;
  submission.status = 'completed';

  return saveJobFormSubmission(supabase, submission.accountId, submission);
}
