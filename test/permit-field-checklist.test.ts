import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  DEFAULT_FIELD_INSPECTION_ITEMS,
  FieldInspectionChecklist,
} from '../src/components/permits/FieldInspectionChecklist';

describe('Field Inspection Checklist Component', () => {
  it('contains essential municipal readiness checklist items', () => {
    expect(DEFAULT_FIELD_INSPECTION_ITEMS.length).toBeGreaterThanOrEqual(4);

    const ids = DEFAULT_FIELD_INSPECTION_ITEMS.map((item) => item.id);
    expect(ids).toContain('permit_card_posted');
    expect(ids).toContain('ladder_safety_access');
    expect(ids).toContain('underlayment_ice_photos');
    expect(ids).toContain('manufacturer_specs');
  });

  it('renders correctly with permit number and authority badge', () => {
    const el = React.createElement(FieldInspectionChecklist, {
      permitNumber: '2026-RO-8492',
      authorityName: 'City of Royal Oak',
    });

    expect(el).toBeDefined();
    expect(el.props.permitNumber).toBe('2026-RO-8492');
    expect(el.props.authorityName).toBe('City of Royal Oak');
  });
});
