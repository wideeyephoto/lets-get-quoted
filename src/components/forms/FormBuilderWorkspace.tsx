'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  ConditionalRule,
  FormCategory,
  FormField,
  FormFieldType,
  FormSection,
  FormTemplate,
  RuleAction,
  RuleOperator,
  TradeSpecialization,
} from '@/lib/forms/types';
import {
  calculateFormCompliance,
  resolveFormState,
} from '@/lib/forms/conditional-engine';
import styles from './forms.module.css';

const FIELD_TYPE_LABELS: Record<FormFieldType, { label: string; icon: string }> = {
  pass_fail_na: { label: 'Pass / Fail / N/A Checklist', icon: '✅' },
  number: { label: 'Measurement & Number (with Unit)', icon: '📐' },
  photo: { label: 'Photo Evidence Attachment', icon: '📷' },
  text: { label: 'Short Text Input', icon: '📝' },
  textarea: { label: 'Multi-Line Notes / Remediation', icon: '📄' },
  select: { label: 'Dropdown Select', icon: '🔽' },
  radio: { label: 'Radio Button Choice', icon: '🔘' },
  checkbox: { label: 'Multiple Checkboxes', icon: '☑️' },
  signature: { label: 'Digital Signature Pad', icon: '✍️' },
  scale: { label: 'Rating / Quality Scale (1-5)', icon: '⭐' },
  date: { label: 'Date Picker', icon: '📅' },
  time: { label: 'Time Picker', icon: '⏰' },
};

export default function FormBuilderWorkspace({
  initialTemplate,
  onSaveAction,
}: {
  initialTemplate?: FormTemplate | null;
  onSaveAction: (template: FormTemplate) => Promise<{ success: boolean; id?: string; error?: string }>;
}) {
  const [template, setTemplate] = useState<FormTemplate>(
    initialTemplate || {
      id: '',
      accountId: '',
      title: 'New Field Inspection Form',
      description: 'Quality assurance checklist and completion certificate.',
      category: 'inspection',
      trade: 'general',
      requireCustomerSignature: true,
      customerSignatureDisclaimer: 'I certify that the work described above has been completed to my satisfaction.',
      requireTechSignature: true,
      sections: [
        {
          id: 'sec_1',
          title: '1. Quality & Safety Checklist',
          fields: [
            {
              id: 'f_work_inspect',
              label: 'Workmanship Inspected & Meets Specification',
              type: 'pass_fail_na',
              required: true,
              conditionalRules: [
                {
                  id: 'r_fail_notes',
                  triggerFieldId: 'f_work_inspect',
                  operator: 'is_fail',
                  action: 'show',
                  targetFieldId: 'f_fail_remediation',
                },
                {
                  id: 'r_fail_warn',
                  triggerFieldId: 'f_work_inspect',
                  operator: 'is_fail',
                  action: 'flag_critical_issue',
                  warningMessage: 'CRITICAL: Workmanship inspection failed. Remediation action is required before customer sign-off.',
                },
              ],
            },
            {
              id: 'f_fail_remediation',
              label: 'Defect Details & Remediation Required',
              type: 'textarea',
              placeholder: 'Describe the issue and steps taken to remediate.',
            },
            {
              id: 'f_photos',
              label: 'Job Site Completion Photos',
              type: 'photo',
              required: true,
              minPhotos: 1,
              allowPhotoCaption: true,
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );

  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Simulator state
  const [simValues, setSimValues] = useState<Record<string, any>>({});
  const [selectedFieldForRules, setSelectedFieldForRules] = useState<FormField | null>(null);

  // All fields in the template flattened for easy referencing in rules
  const allFields = template.sections.flatMap((s) => s.fields);

  // Resolve simulator dynamic state
  const simState = resolveFormState(template, simValues);
  const simCompliance = calculateFormCompliance(template, simValues);

  // ----------------------------------------------------
  // Section & Field Mutators
  // ----------------------------------------------------
  function updateTemplateMeta(key: keyof FormTemplate, value: any) {
    setTemplate((prev) => ({ ...prev, [key]: value }));
  }

  function addSection() {
    const newSec: FormSection = {
      id: `sec_${Date.now()}`,
      title: `${template.sections.length + 1}. New Section`,
      fields: [],
    };
    setTemplate((prev) => ({ ...prev, sections: [...prev.sections, newSec] }));
  }

  function removeSection(secId: string) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== secId),
    }));
  }

  function updateSectionTitle(secId: string, title: string) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, title } : s)),
    }));
  }

  function addField(secId: string, type: FormFieldType = 'pass_fail_na') {
    const newField: FormField = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      label: `New ${FIELD_TYPE_LABELS[type].label}`,
      type,
      required: false,
    };
    if (type === 'number') newField.unit = 'Units';
    if (type === 'select' || type === 'radio' || type === 'checkbox') {
      newField.options = ['Option 1', 'Option 2', 'Option 3'];
    }

    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === secId ? { ...s, fields: [...s.fields, newField] } : s,
      ),
    }));
  }

  function updateField(secId: string, fieldId: string, patch: Partial<FormField>) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === secId
          ? {
              ...s,
              fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
            }
          : s,
      ),
    }));
  }

  function removeField(secId: string, fieldId: string) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === secId
          ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
          : s,
      ),
    }));
  }

  // ----------------------------------------------------
  // Conditional Rule Mutators
  // ----------------------------------------------------
  function addRuleToField(fieldId: string) {
    const newRule: ConditionalRule = {
      id: `rule_${Date.now()}`,
      triggerFieldId: fieldId,
      operator: 'is_fail',
      action: 'show',
      targetFieldId: allFields.find((f) => f.id !== fieldId)?.id || fieldId,
    };

    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => ({
        ...sec,
        fields: sec.fields.map((f) =>
          f.id === fieldId
            ? { ...f, conditionalRules: [...(f.conditionalRules || []), newRule] }
            : f,
        ),
      })),
    }));
  }

  function updateRule(fieldId: string, ruleId: string, patch: Partial<ConditionalRule>) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => ({
        ...sec,
        fields: sec.fields.map((f) =>
          f.id === fieldId
            ? {
                ...f,
                conditionalRules: (f.conditionalRules || []).map((r) =>
                  r.id === ruleId ? { ...r, ...patch } : r,
                ),
              }
            : f,
        ),
      })),
    }));
  }

  function removeRule(fieldId: string, ruleId: string) {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => ({
        ...sec,
        fields: sec.fields.map((f) =>
          f.id === fieldId
            ? {
                ...f,
                conditionalRules: (f.conditionalRules || []).filter((r) => r.id !== ruleId),
              }
            : f,
        ),
      })),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await onSaveAction(template);
      if (res.success) {
        setSaveSuccess(true);
        if (res.id && res.id !== template.id) {
          setTemplate((prev) => ({ ...prev, id: res.id! }));
        }
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setSaveError(res.error || 'Failed to save template.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={`wide-shell workspace-shell ${styles.container}`}>
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <p className="eyebrow" style={{ margin: '0 0 0.35rem' }}>Visual Form Architecture</p>
          <h1>
            <span>📋</span> Conditional Field-Form Builder
          </h1>
          <p className={styles.headerDesc}>
            Build trade-specific inspections, commissioning logs, QA checklists, and customer completion certificates with reactive conditional logic.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.categoryPills}>
            <button
              type="button"
              className={`${styles.pill} ${activeTab === 'editor' ? styles.pillActive : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <span>🛠️</span> <span>Form Schema Editor</span>
            </button>
            <button
              type="button"
              className={`${styles.pill} ${activeTab === 'preview' ? styles.pillActive : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <span>⚡</span> <span>Live Reactive Simulator</span>
            </button>
          </div>

          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={saving}
            style={{ minWidth: '130px' }}
          >
            {saving ? 'Saving...' : '💾 Save Template'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div style={{ background: 'rgba(74, 222, 128, 0.15)', color: 'var(--ink-green-1, #15803d)', border: '1px solid rgba(74, 222, 128, 0.25)', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 600 }}>
          ✓ Form template successfully saved and ready for field deployment!
        </div>
      )}

      {saveError && (
        <div style={{ background: 'rgba(248, 113, 113, 0.15)', color: 'var(--ink-red-1, #b91c1c)', border: '1px solid rgba(248, 113, 113, 0.25)', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 600 }}>
          ✗ Error: {saveError}
        </div>
      )}

      {/* Main Workspace */}
      <div className={styles.builderWorkspace}>
        {/* LEFT COLUMN: Template Meta & Schema Builder */}
        <div className={styles.builderPanel}>
          <h2 className={styles.panelTitle}>
            <span>1. Template Settings</span>
            <span className={`${styles.badge} ${styles.badgeCategory}`}>
              {template.sections.reduce((acc, s) => acc + s.fields.length, 0)} Total Fields
            </span>
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Form Title
              <input
                type="text"
                className="input"
                value={template.title}
                onChange={(e) => updateTemplateMeta('title', e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Category
              <select
                className="select"
                value={template.category}
                onChange={(e) => updateTemplateMeta('category', e.target.value as FormCategory)}
              >
                <option value="inspection">Inspection & Diagnostics</option>
                <option value="commissioning">System Commissioning & Startup</option>
                <option value="qa">Quality Assurance (QA)</option>
                <option value="completion_certificate">Completion Certificate & Sign-Off</option>
                <option value="safety">Safety Audit & JHA</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Trade Specialization
              <select
                className="select"
                value={template.trade}
                onChange={(e) => updateTemplateMeta('trade', e.target.value as TradeSpecialization)}
              >
                <option value="all">Universal / All Trades</option>
                <option value="hvac">HVAC & Heating/Cooling</option>
                <option value="electrical">Electrical & Power</option>
                <option value="plumbing">Plumbing & Gas</option>
                <option value="roofing">Roofing & Siding</option>
                <option value="general">General Contracting</option>
                <option value="painting">Painting & Coating</option>
                <option value="solar">Solar PV & Battery Storage</option>
                <option value="carpentry">Carpentry & Framing</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Description
              <input
                type="text"
                className="input"
                value={template.description}
                onChange={(e) => updateTemplateMeta('description', e.target.value)}
              />
            </label>
          </div>

          {/* Signatures Requirements */}
          <div style={{ background: 'rgba(var(--tint), 0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>✍️ Signatures &amp; Legal Handover</span>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={template.requireTechSignature}
                  onChange={(e) => updateTemplateMeta('requireTechSignature', e.target.checked)}
                />
                Require Technician Digital Sign-off
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={template.requireCustomerSignature}
                  onChange={(e) => updateTemplateMeta('requireCustomerSignature', e.target.checked)}
                />
                Require Customer Acceptance Signature
              </label>
            </div>

            {template.requireCustomerSignature && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                Customer Signature Legal Disclaimer / Acceptance Terms:
                <textarea
                  rows={2}
                  className="input"
                  style={{ fontSize: '0.8rem' }}
                  value={template.customerSignatureDisclaimer || ''}
                  onChange={(e) => updateTemplateMeta('customerSignatureDisclaimer', e.target.value)}
                />
              </label>
            )}
          </div>

          {/* Form Sections & Fields */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>2. Form Sections & Conditional Fields</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }} onClick={addSection}>
              + Add Section
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {template.sections.map((sec, secIdx) => (
              <div key={sec.id} className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <input
                    type="text"
                    className="input"
                    style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}
                    value={sec.title}
                    onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                  />
                  <button
                    type="button"
                    title="Remove Section"
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem', marginLeft: '0.5rem' }}
                    onClick={() => removeSection(sec.id)}
                  >
                    🗑️
                  </button>
                </div>

                {/* Fields inside Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {sec.fields.map((field) => (
                    <div key={field.id} className={styles.fieldItem}>
                      <div className={styles.fieldHead}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                          <span>{FIELD_TYPE_LABELS[field.type]?.icon || '📌'}</span>
                          <input
                            type="text"
                            className="input"
                            style={{ fontSize: '0.88rem', fontWeight: 600, padding: '0.2rem 0.5rem' }}
                            value={field.label}
                            onChange={(e) => updateField(sec.id, field.id, { label: e.target.value })}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className={`${styles.pill} ${field.conditionalRules?.length ? styles.pillActive : ''}`}
                            style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}
                            onClick={() => setSelectedFieldForRules(selectedFieldForRules?.id === field.id ? null : field)}
                          >
                            ⚡ Rules ({field.conditionalRules?.length || 0})
                          </button>
                          <button
                            type="button"
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            onClick={() => removeField(sec.id, field.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className={styles.fieldMeta}>
                        <select
                          aria-label="Field type"
                          className="select"
                          style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem' }}
                          value={field.type}
                          onChange={(e) => updateField(sec.id, field.id, { type: e.target.value as FormFieldType })}
                        >
                          {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.icon} {v.label}
                            </option>
                          ))}
                        </select>

                        {field.type === 'number' && (
                          <input
                            type="text"
                            placeholder="Unit (e.g. PSI, Volts, CFM)"
                            style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem', width: '110px' }}
                            value={field.unit || ''}
                            onChange={(e) => updateField(sec.id, field.id, { unit: e.target.value })}
                          />
                        )}

                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => updateField(sec.id, field.id, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      </div>

                      {/* Rule Editor Drawer if selected */}
                      {selectedFieldForRules?.id === field.id && (
                        <div style={{ background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.28)', borderRadius: '6px', padding: '0.65rem', marginTop: '0.35rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-amber-1, #b45309)' }}>
                              ⚡ Conditional Logic for &quot;{field.label}&quot;
                            </span>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                              onClick={() => addRuleToField(field.id)}
                            >
                              + Add Condition
                            </button>
                          </div>

                          {(!field.conditionalRules || field.conditionalRules.length === 0) ? (
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-amber-1, #b45309)' }}>
                              No rules configured. Add a rule to show/hide fields, require notes, or trigger critical safety flags based on this field&apos;s value.
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {field.conditionalRules.map((rule) => (
                                <div key={rule.id} style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(251, 191, 36, 0.35)', borderRadius: '4px', padding: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text)' }}>
                                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600 }}>WHEN this field</span>
                                    <select
                                      aria-label="Rule operator"
                                      value={rule.operator}
                                      onChange={(e) => updateRule(field.id, rule.id, { operator: e.target.value as RuleOperator })}
                                      style={{ padding: '0.15rem' }}
                                    >
                                      <option value="is_fail">is FAIL</option>
                                      <option value="is_pass">is PASS</option>
                                      <option value="equals">Equals</option>
                                      <option value="greater_than">Greater than (&gt;)</option>
                                      <option value="less_than">Less than (&lt;)</option>
                                    </select>

                                    {(rule.operator === 'equals' || rule.operator === 'greater_than' || rule.operator === 'less_than') && (
                                      <input
                                        type="text"
                                        placeholder="Value"
                                        value={String(rule.value ?? '')}
                                        onChange={(e) => updateRule(field.id, rule.id, { value: e.target.value })}
                                        style={{ width: '80px', padding: '0.15rem' }}
                                      />
                                    )}

                                    <span style={{ fontWeight: 600 }}>THEN</span>
                                    <select
                                      aria-label="Rule action"
                                      value={rule.action}
                                      onChange={(e) => updateRule(field.id, rule.id, { action: e.target.value as RuleAction })}
                                      style={{ padding: '0.15rem' }}
                                    >
                                      <option value="show">SHOW Field</option>
                                      <option value="hide">HIDE Field</option>
                                      <option value="require">REQUIRE Field</option>
                                      <option value="flag_critical_issue">FLAG Critical Alert</option>
                                    </select>

                                    {rule.action !== 'flag_critical_issue' && (
                                      <select
                                        aria-label="Target field for rule"
                                        value={rule.targetFieldId || field.id}
                                        onChange={(e) => updateRule(field.id, rule.id, { targetFieldId: e.target.value })}
                                        style={{ padding: '0.15rem' }}
                                      >
                                        {allFields.map((target) => (
                                          <option key={target.id} value={target.id}>
                                            {target.label}
                                          </option>
                                        ))}
                                      </select>
                                    )}

                                    <button
                                      type="button"
                                      style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}
                                      onClick={() => removeRule(field.id, rule.id)}
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {rule.action === 'flag_critical_issue' && (
                                    <input
                                      type="text"
                                      placeholder="Warning message (e.g. CRITICAL SAFETY ISSUE: Breaker failed trip test)"
                                      style={{ width: '100%', padding: '0.2rem', fontSize: '0.73rem' }}
                                      value={rule.warningMessage || ''}
                                      onChange={(e) => updateRule(field.id, rule.id, { warningMessage: e.target.value })}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Field Buttons */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => addField(sec.id, 'pass_fail_na')}
                  >
                    + ✅ Pass/Fail Check
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => addField(sec.id, 'number')}
                  >
                    + 📐 Measurement
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => addField(sec.id, 'photo')}
                  >
                    + 📷 Photo Proof
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => addField(sec.id, 'text')}
                  >
                    + 📝 Text Input
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => addField(sec.id, 'textarea')}
                  >
                    + 📄 Notes / Remediation
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Interactive Simulator / Preview */}
        <div className={styles.simulatorBox}>
          <div className={styles.simHeader}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-sky-1, #0284c7)', fontWeight: 700 }}>
                ⚡ Live Reactive Preview
              </span>
              <h3 style={{ margin: '0.1rem 0 0 0', fontSize: '1.1rem', color: 'var(--text)' }}>
                {template.title}
              </h3>
            </div>
            <button
              type="button"
              className={styles.pill}
              style={{ fontSize: '0.75rem' }}
              onClick={() => setSimValues({})}
            >
              🔄 Reset Form
            </button>
          </div>

          {/* Compliance & Scorecard */}
          <div className={styles.scorecard}>
            <div className={styles.scoreItem}>
              <strong style={{ color: simCompliance.compliancePct >= 90 ? 'var(--good, #16a34a)' : 'var(--warn, #ea580c)' }}>
                {simCompliance.compliancePct}%
              </strong>
              <span>Pass Score</span>
            </div>
            <div className={styles.scoreItem}>
              <strong style={{ color: 'var(--good, #16a34a)' }}>{simCompliance.passedItems}</strong>
              <span>Passed</span>
            </div>
            <div className={styles.scoreItem}>
              <strong style={{ color: simCompliance.failedItems > 0 ? 'var(--bad, #dc2626)' : 'var(--muted-2, #64748b)' }}>
                {simCompliance.failedItems}
              </strong>
              <span>Failed</span>
            </div>
            <div className={styles.scoreItem}>
              <strong>{simCompliance.unresolvedRequiredCount}</strong>
              <span>Required Open</span>
            </div>
          </div>

          {/* Critical Warnings */}
          {simCompliance.criticalIssues.length > 0 && (
            <div className={styles.criticalAlert}>
              <strong>⚠️ Active Critical Safety &amp; QA Warnings:</strong>
              {simCompliance.criticalIssues.map((issue, idx) => (
                <div key={idx}>• {issue}</div>
              ))}
            </div>
          )}

          {/* Live Form Runner Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {template.sections.map((sec) => {
              const visibleFields = sec.fields.filter((f) => simState.visibleFieldIds.has(f.id));
              if (visibleFields.length === 0) return null;

              return (
                <div key={sec.id} style={{ background: 'rgba(var(--tint), 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text)', fontWeight: 700 }}>
                    {sec.title}
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {visibleFields.map((field) => {
                      const isRequired = simState.requiredFieldIds.has(field.id);
                      const currentVal = simValues[field.id];

                      return (
                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>
                              {field.label} {isRequired && <span style={{ color: 'var(--bad, #ef4444)' }}>*</span>}
                            </span>
                            {field.unit && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Unit: {field.unit}</span>}
                          </label>

                          {/* Pass/Fail/NA */}
                          {field.type === 'pass_fail_na' && (
                            <div className={styles.passFailGroup}>
                              <button
                                type="button"
                                className={`${styles.passFailBtn} ${currentVal === 'pass' ? styles.passActive : ''}`}
                                onClick={() => setSimValues((prev) => ({ ...prev, [field.id]: 'pass' }))}
                              >
                                ✓ Pass
                              </button>
                              <button
                                type="button"
                                className={`${styles.passFailBtn} ${currentVal === 'fail' ? styles.failActive : ''}`}
                                onClick={() => setSimValues((prev) => ({ ...prev, [field.id]: 'fail' }))}
                              >
                                ✕ Fail
                              </button>
                              <button
                                type="button"
                                className={`${styles.passFailBtn} ${currentVal === 'na' ? styles.naActive : ''}`}
                                onClick={() => setSimValues((prev) => ({ ...prev, [field.id]: 'na' }))}
                              >
                                N/A
                              </button>
                            </div>
                          )}

                          {/* Number with Unit */}
                          {field.type === 'number' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="number"
                                step={field.step || 'any'}
                                placeholder={field.placeholder || 'Enter measurement...'}
                                className="input"
                                style={{ flex: 1 }}
                                value={currentVal ?? ''}
                                onChange={(e) => setSimValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                              />
                              {field.unit && <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '0.85rem' }}>{field.unit}</span>}
                            </div>
                          )}

                          {/* Text / Textarea */}
                          {field.type === 'text' && (
                            <input
                              type="text"
                              placeholder={field.placeholder || ''}
                              className="input"
                              value={currentVal ?? ''}
                              onChange={(e) => setSimValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            />
                          )}

                          {field.type === 'textarea' && (
                            <textarea
                              rows={2}
                              placeholder={field.placeholder || ''}
                              className="input"
                              value={currentVal ?? ''}
                              onChange={(e) => setSimValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            />
                          )}

                          {/* Select */}
                          {field.type === 'select' && (
                            <select
                              aria-label={field.label || 'Select option'}
                              className="select"
                              value={currentVal ?? ''}
                              onChange={(e) => setSimValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            >
                              <option value="">-- Select option --</option>
                              {field.options?.map((opt, i) => (
                                <option key={i} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Radio */}
                          {field.type === 'radio' && (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                              {field.options?.map((opt, i) => (
                                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={field.id}
                                    checked={currentVal === opt}
                                    onChange={() => setSimValues((prev) => ({ ...prev, [field.id]: opt }))}
                                  />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          )}

                          {/* Photo Evidence Placeholder */}
                          {field.type === 'photo' && (
                            <div className={styles.photoUploadBox}>
                              <span style={{ fontSize: '1.2rem' }}>📷</span>
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                                Camera Photo Evidence Capture Active ({field.minPhotos || 1} required)
                              </p>
                            </div>
                          )}

                          {/* Scale / Rating */}
                          {field.type === 'scale' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  className={styles.pill}
                                  style={{
                                    fontSize: '1rem',
                                    padding: '0.3rem 0.6rem',
                                    background: (currentVal || 5) >= star ? 'rgba(251, 191, 36, 0.2)' : 'rgba(var(--tint), 0.04)',
                                    color: (currentVal || 5) >= star ? 'var(--ink-amber-1, #b45309)' : 'var(--muted)',
                                    border: '1px solid ' + ((currentVal || 5) >= star ? 'rgba(251, 191, 36, 0.35)' : 'var(--line)'),
                                  }}
                                  onClick={() => setSimValues((prev) => ({ ...prev, [field.id]: star }))}
                                >
                                  ⭐ {star}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Customer Sign-off preview */}
            {template.requireCustomerSignature && (
              <div style={{ background: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.25)', borderRadius: '8px', padding: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink-green-1, #15803d)' }}>
                  ✍️ Customer Completion Certificate Sign-Off
                </span>
                <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.78rem', color: 'var(--ink-green-1, #15803d)', fontStyle: 'italic' }}>
                  &quot;{template.customerSignatureDisclaimer}&quot;
                </p>
                <div style={{ border: '2px dashed rgba(74, 222, 128, 0.4)', borderRadius: '6px', height: '65px', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-green-1, #15803d)', fontSize: '0.85rem', fontWeight: 600 }}>
                  Customer Digital Signature Pad
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
