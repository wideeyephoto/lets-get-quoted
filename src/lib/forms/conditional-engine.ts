/**
 * Conditional Engine for Field Forms, Inspections, QA, Commissioning & Certificates.
 * Evaluates dynamic visibility, requirement overrides, and safety alerts in real time.
 */

import type {
  ConditionalRule,
  FormComplianceSummary,
  FormField,
  FormSection,
  FormTemplate,
  RuleOperator,
} from './types';

/**
 * Checks whether a specific condition is met based on the current form values.
 */
export function evaluateRule(
  rule: ConditionalRule,
  values: Record<string, any>,
): boolean {
  const triggerVal = values[rule.triggerFieldId];

  switch (rule.operator) {
    case 'is_pass':
      return triggerVal === 'pass';

    case 'is_fail':
      return triggerVal === 'fail';

    case 'equals':
      if (typeof rule.value === 'boolean') {
        return Boolean(triggerVal) === rule.value;
      }
      if (rule.value === undefined || rule.value === null) {
        return triggerVal === undefined || triggerVal === null || triggerVal === '';
      }
      return String(triggerVal ?? '').toLowerCase() === String(rule.value).toLowerCase();

    case 'not_equals':
      if (typeof rule.value === 'boolean') {
        return Boolean(triggerVal) !== rule.value;
      }
      return String(triggerVal ?? '').toLowerCase() !== String(rule.value ?? '').toLowerCase();

    case 'greater_than': {
      const numVal = Number(triggerVal);
      const targetNum = Number(rule.value);
      return !Number.isNaN(numVal) && !Number.isNaN(targetNum) && numVal > targetNum;
    }

    case 'less_than': {
      const numVal = Number(triggerVal);
      const targetNum = Number(rule.value);
      return !Number.isNaN(numVal) && !Number.isNaN(targetNum) && numVal < targetNum;
    }

    case 'contains': {
      if (Array.isArray(triggerVal)) {
        return triggerVal.includes(rule.value);
      }
      return String(triggerVal ?? '')
        .toLowerCase()
        .includes(String(rule.value ?? '').toLowerCase());
    }

    case 'is_empty':
      return (
        triggerVal === undefined ||
        triggerVal === null ||
        triggerVal === '' ||
        (Array.isArray(triggerVal) && triggerVal.length === 0)
      );

    case 'is_not_empty':
      return (
        triggerVal !== undefined &&
        triggerVal !== null &&
        triggerVal !== '' &&
        (!Array.isArray(triggerVal) || triggerVal.length > 0)
      );

    default:
      return false;
  }
}

export interface ResolvedFormState {
  visibleFieldIds: Set<string>;
  requiredFieldIds: Set<string>;
  criticalIssues: string[];
  fieldWarnings: Record<string, string[]>; // fieldId -> warning messages
}

/**
 * Resolves the active state of all fields in the template based on current inputs.
 */
export function resolveFormState(
  template: FormTemplate,
  values: Record<string, any> = {},
): ResolvedFormState {
  const visibleFieldIds = new Set<string>();
  const requiredFieldIds = new Set<string>();
  const criticalIssues: string[] = [];
  const fieldWarnings: Record<string, string[]> = {};

  // Step 1: Initialize all fields as visible by default, unless they have a 'show' rule
  // If a field has a conditional 'show' rule targeting it, it starts hidden until triggered.
  const fieldsControlledByShowRule = new Set<string>();

  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.conditionalRules) {
        for (const rule of field.conditionalRules) {
          const target = rule.targetFieldId || field.id;
          if (rule.action === 'show') {
            fieldsControlledByShowRule.add(target);
          }
        }
      }
    }
  }

  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!fieldsControlledByShowRule.has(field.id)) {
        visibleFieldIds.add(field.id);
      }
      if (field.required) {
        requiredFieldIds.add(field.id);
      }
    }
  }

  // Step 2: Evaluate conditional rules across all fields
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!field.conditionalRules || field.conditionalRules.length === 0) {
        continue;
      }

      for (const rule of field.conditionalRules) {
        const isTriggered = evaluateRule(rule, values);
        const targetId = rule.targetFieldId || field.id;

        if (isTriggered) {
          switch (rule.action) {
            case 'show':
              visibleFieldIds.add(targetId);
              break;

            case 'hide':
              visibleFieldIds.delete(targetId);
              break;

            case 'require':
              requiredFieldIds.add(targetId);
              break;

            case 'flag_critical_issue':
              if (rule.warningMessage) {
                criticalIssues.push(rule.warningMessage);
                if (!fieldWarnings[targetId]) {
                  fieldWarnings[targetId] = [];
                }
                fieldWarnings[targetId].push(rule.warningMessage);
              }
              break;
          }
        }
      }
    }
  }

  return {
    visibleFieldIds,
    requiredFieldIds,
    criticalIssues,
    fieldWarnings,
  };
}

/**
 * Calculates compliance stats, pass/fail counts, and completion readiness.
 */
export function calculateFormCompliance(
  template: FormTemplate,
  values: Record<string, any> = {},
): FormComplianceSummary {
  const state = resolveFormState(template, values);

  let totalItems = 0;
  let passedItems = 0;
  let failedItems = 0;
  let naItems = 0;
  let unresolvedRequiredCount = 0;

  for (const section of template.sections) {
    for (const field of section.fields) {
      // Only evaluate visible fields
      if (!state.visibleFieldIds.has(field.id)) {
        continue;
      }

      const val = values[field.id];

      // Check Pass/Fail metrics
      if (field.type === 'pass_fail_na') {
        totalItems += 1;
        if (val === 'pass') {
          passedItems += 1;
        } else if (val === 'fail') {
          failedItems += 1;
        } else if (val === 'na') {
          naItems += 1;
        }
      }

      // Check Required completeness
      const isRequired = state.requiredFieldIds.has(field.id);
      if (isRequired) {
        const isEmpty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          unresolvedRequiredCount += 1;
        }
      }
    }
  }

  // Calculate compliance percentage
  const scorableItems = passedItems + failedItems;
  const compliancePct =
    scorableItems > 0 ? Math.round((passedItems / scorableItems) * 100) : 100;

  const isCompliant =
    failedItems === 0 &&
    state.criticalIssues.length === 0 &&
    unresolvedRequiredCount === 0;

  return {
    totalItems,
    passedItems,
    failedItems,
    naItems,
    compliancePct,
    criticalIssues: state.criticalIssues,
    isCompliant,
    unresolvedRequiredCount,
  };
}

/**
 * Validates whether a form is ready to be finalized/approved.
 */
export function validateSubmission(
  template: FormTemplate,
  values: Record<string, any>,
  options?: {
    hasTechSig?: boolean;
    hasCustomerSig?: boolean;
  },
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const state = resolveFormState(template, values);

  // Check required fields
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (state.visibleFieldIds.has(field.id) && state.requiredFieldIds.has(field.id)) {
        const val = values[field.id];
        const isEmpty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          errors.push(`"${field.label}" is required.`);
        }
      }
    }
  }

  if (template.requireTechSignature && !options?.hasTechSig) {
    errors.push('Technician signature is required.');
  }

  if (template.requireCustomerSignature && !options?.hasCustomerSig) {
    errors.push('Customer signature is required for completion certificate.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
