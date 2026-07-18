'use client';

import { useState } from 'react';
import type { CrewMember } from '@/lib/crew';

type JobExpenseFieldsProps = {
  crew: CrewMember[];
};

const DESCRIPTION_PRESETS = [
  'Additional material charge',
  'Permit fee',
  'Crew Labor',
  'Subcontractor labor',
  'Change order',
  'Dump fee',
];

const LABOR_DESCRIPTION = 'Crew Labor';

export default function JobExpenseFields({ crew }: JobExpenseFieldsProps) {
  const [description, setDescription] = useState('');
  const isLabor = description.trim().toLowerCase() === LABOR_DESCRIPTION.toLowerCase();

  return (
    <>
      <input type="hidden" name="type" value={isLabor ? 'labor' : 'material'} />

      <div className="field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          required
          placeholder="Architectural shingles - Owens Corning Duration"
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
        <div className="field">
          <label htmlFor="amount">Amount ($)</label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="Material / sub / receipt / other"
          />
        </div>
      ) : (
        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="hours">Hours (labor only)</label>
            <input id="hours" name="hours" type="number" min="0" step="0.25" required placeholder="32" />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate $/hr (labor only)</label>
            <input id="rate" name="rate" type="number" min="0" step="0.01" required placeholder="45" />
          </div>
          <div className="field">
            <label htmlFor="crewId">Crew member (labor only)</label>
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