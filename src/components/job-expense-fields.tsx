'use client';

import { useEffect, useState } from 'react';
import type { CrewMember } from '@/lib/crew';
import type { CostType } from '@/lib/jobs';
import { COST_SOURCE_LABEL, COST_SOURCE_NOTE, SELECTABLE_COST_SOURCES, type CostSource } from '@/lib/cost-truth';

type JobExpenseFieldsProps = {
  crew: CrewMember[];
};

const DESCRIPTION_PRESETS = [
  'Additional material charge',
  'Permit fee',
  'Change order',
  'Dump fee',
];

// Explicit expense type instead of guessing from a magic description string, so
// Subcontractor and Other are reachable (they were unreachable before) and the
// margin breakdown buckets each cost correctly. 'receipt' stays valid in the DB
// but isn't offered here.
const TYPE_OPTIONS: { value: CostType; label: string }[] = [
  { value: 'material', label: 'Materials' },
  { value: 'sub', label: 'Subcontractor' },
  { value: 'labor', label: 'Labor' },
  { value: 'other', label: 'Other' },
];

export default function JobExpenseFields({ crew }: JobExpenseFieldsProps) {
  const [type, setType] = useState<CostType>('material');
  const [description, setDescription] = useState('');
  const isLabor = type === 'labor';
  // Hours typed after the fact are a recollection; a material spend usually has
  // a receipt behind it. Defaulting each to its likely truth means the honest
  // answer is also the one that takes no clicks.
  const [source, setSource] = useState<CostSource>('receipt');
  useEffect(() => {
    setSource(isLabor ? 'estimated' : 'receipt');
  }, [isLabor]);

  return (
    <>
      <div className="field">
        <label htmlFor="cost-type">Expense type</label>
        <select id="cost-type" name="type" value={type} onChange={(event) => setType(event.currentTarget.value as CostType)}>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Where the number came from, asked at the moment it's entered rather
          than reconstructed later. "Receipt" and "I think it was about $400"
          are both legitimate ways to record a cost — what isn't legitimate is a
          margin that can't tell you which one it was built from. */}
      <div className="field">
        <label htmlFor="cost-source">Where this figure came from</label>
        <select
          id="cost-source"
          name="costSource"
          value={source}
          onChange={(event) => setSource(event.currentTarget.value as CostSource)}
        >
          {SELECTABLE_COST_SOURCES.map((option) => (
            <option key={option} value={option}>
              {COST_SOURCE_LABEL[option]}
            </option>
          ))}
        </select>
        <small className="field-hint">{COST_SOURCE_NOTE[source]}</small>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          required
          placeholder={isLabor ? 'Framing crew - 2 days' : 'Architectural shingles - Owens Corning Duration'}
          list="cost-description-presets"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <datalist id="cost-description-presets">
          {DESCRIPTION_PRESETS.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
        <div className="quick-add-buttons" aria-label="Quick add:">
          <span>Quick add:</span>
          {DESCRIPTION_PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setDescription(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </div>

      {!isLabor ? (
        <div className="field money-field">
          <label htmlFor="amount">Amount ($)</label>
          <div className="currency-input">
            <span aria-hidden="true">$</span>
            <input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              placeholder="450.00"
            />
          </div>
        </div>
      ) : (
        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="hours">Hours</label>
            <input id="hours" name="hours" type="number" min="0" step="0.25" required placeholder="32" />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate $/hr</label>
            <input id="rate" name="rate" type="number" min="0" step="0.01" required placeholder="45" />
          </div>
          <div className="field">
            <label htmlFor="crewId">Crew member</label>
            <select id="crewId" name="crewId" defaultValue="">
              <option value="">- Unassigned -</option>
              {crew.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field full">
        <label htmlFor="supplier">Notes</label>
        <textarea id="supplier" name="supplier" placeholder="Optional notes for this expense" />
      </div>
    </>
  );
}
