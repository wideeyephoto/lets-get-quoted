'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import type { FormTemplate } from '@/lib/forms/types';
import {
  deleteFormTemplate,
  getFormTemplate,
  saveFormTemplate,
} from '@/lib/forms/forms-data';
import { PRESET_FORM_TEMPLATES } from '@/lib/forms/preset-templates';

/**
 * Saves or updates a form template.
 */
export async function saveTemplateAction(
  template: FormTemplate,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();

    const saved = await saveFormTemplate(supabase, accountId, template);
    revalidatePath('/dashboard/forms');
    revalidatePath(`/dashboard/forms/${saved.id}`);
    return { success: true, id: saved.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save template.' };
  }
}

/**
 * Soft deletes / archives a custom form template.
 */
export async function deleteTemplateAction(
  templateId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    await deleteFormTemplate(supabase, accountId, templateId);
    revalidatePath('/dashboard/forms');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete template.' };
  }
}

/**
 * Clones an existing template (or preset) into a new editable template.
 */
export async function cloneTemplateAction(
  templateId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    const existing = await getFormTemplate(supabase, accountId, templateId);
    if (!existing) {
      return { success: false, error: 'Template not found.' };
    }

    const cloned: Partial<FormTemplate> & { title: string; category: any; trade: any } = {
      ...existing,
      id: undefined,
      title: `${existing.title} (Copy)`,
      isPreset: false,
    };

    const saved = await saveFormTemplate(supabase, accountId, cloned);
    revalidatePath('/dashboard/forms');
    return { success: true, id: saved.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to clone template.' };
  }
}

/**
 * Installs a preset template into the account's active library.
 */
export async function installPresetAction(
  presetId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    const preset = PRESET_FORM_TEMPLATES.find((p) => p.id === presetId);
    if (!preset) {
      return { success: false, error: 'Preset not found.' };
    }

    const customCopy: Partial<FormTemplate> & { title: string; category: any; trade: any } = {
      ...preset,
      id: undefined,
      isPreset: false,
    };

    const saved = await saveFormTemplate(supabase, accountId, customCopy);
    revalidatePath('/dashboard/forms');
    return { success: true, id: saved.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to install preset.' };
  }
}
