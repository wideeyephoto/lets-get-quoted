import { describe, it, expect } from 'vitest';
import {
  formatHomeownerInspectionPrepSms,
  generateInspectionIcsFeed,
} from '../src/lib/permit-intel/inspection-calendar-sync';

describe('Homeowner Inspection Prep SMS & Crew Calendar Sync Engine', () => {
  describe('Homeowner Prep SMS Formatting', () => {
    it('formats roofing inspection access guidance with gate & ladder checklist', () => {
      const msg = formatHomeownerInspectionPrepSms({
        clientName: 'Michael Chang',
        businessName: 'Apex Roofing LLC',
        authorityName: 'City of Royal Oak',
        inspectionType: 'Mid-Roof / Ice Barrier Inspection',
        scheduledDate: 'Tomorrow, Aug 27',
        timeWindow: '9:00 AM - 1:00 PM',
      });

      expect(msg).toContain('Hi Michael');
      expect(msg).toContain('Mid-Roof / Ice Barrier Inspection');
      expect(msg).toContain('unlock backyard gates');
      expect(msg).toContain('keep pets indoors');
    });

    it('formats electrical inspection access guidance with panel clearance checklist', () => {
      const msg = formatHomeownerInspectionPrepSms({
        clientName: 'Diana Prince',
        businessName: 'Metro Electric',
        authorityName: 'City of Detroit',
        inspectionType: 'Rough Electrical Inspection',
        scheduledDate: 'Aug 28',
      });

      expect(msg).toContain('clear 3-foot clearance around the electrical breaker panel');
      expect(msg).toContain('secure pets indoors');
    });
  });

  describe('iCalendar (.ics) Feed Generator', () => {
    it('generates a valid RFC 5545 iCalendar feed with VEVENT and VALARM', () => {
      const ics = generateInspectionIcsFeed('Municipal Inspections', [
        {
          id: 'insp-101',
          permitNumber: 'BLD-2026-8819',
          inspectionType: 'Final Building Inspection',
          authorityName: 'City of Royal Oak',
          scheduledDate: '2026-08-27',
          timeWindow: '09:00 AM - 01:00 PM',
          jobAddress: '211 S Williams St, Royal Oak, MI',
          clientName: 'Sarah Jenkins',
          clientPhone: '(248) 555-8833',
          contractorName: 'Apex Roofing LLC',
          notes: 'Inspector requested ladder set up on east elevation.',
          status: 'scheduled',
        },
      ]);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:permit-insp-insp-101@letsgetquoted.com');
      expect(ics).toContain('SUMMARY:🔍 City of Royal Oak Inspection: Final Building Inspection (#BLD-2026-8819)');
      expect(ics).toContain('LOCATION:211 S Williams St\\, Royal Oak\\, MI');
      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('TRIGGER:-PT1440M'); // 24hr reminder
      expect(ics).toContain('END:VCALENDAR');
    });
  });
});
