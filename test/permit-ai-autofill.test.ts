import { describe, it, expect } from 'vitest';
import {
  autofillPermitWithAI,
  synthesizeMunicipalScopeDescription,
} from '../src/lib/permit-intel/ai-autofill';

describe('AI Permit Autofill Engine', () => {
  describe('Municipal Scope Synthesizer', () => {
    it('synthesizes professional municipal description for residential roof replacement in Michigan', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'roofing',
        'Tear off existing roof and replace with GAF Timberline HDZ 26 sq',
        [{ description: 'Tear off & shingle replacement', quantity: 26, total: 13500 }],
        13500,
        'MI',
      );

      expect(desc).toContain('Tear off existing roof covering');
      expect(desc).toContain('ice barrier');
      expect(desc).toContain('26 squares');
      expect(desc).toContain('Total job valuation: $13,500');
    });

    it('synthesizes Florida FBC 2023 sealed roof deck & product approval scope', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'roofing',
        'Replace asphalt shingles 30 sq in Miami',
        [],
        18000,
        'FL',
      );

      expect(desc).toContain('FBC 2023');
      expect(desc).toContain('sealed roof deck');
      expect(desc).toContain('Miami-Dade NOA / Florida Product Approval');
      expect(desc).toContain('30 squares');
    });

    it('synthesizes Canadian NBC/OBC eave protection 900mm scope', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'roofing',
        'New roof installation 24 sq in Toronto',
        [],
        14000,
        'ON',
      );

      expect(desc).toContain('NBC Part 9.26.5');
      expect(desc).toContain('900mm (36")');
      expect(desc).toContain('24 squares');
    });

    it('synthesizes Mexican NOM-018-ENER impermeabilización prefabricada scope', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'roofing',
        'Impermeabilización de azotea con membrana termofusionada 120 m2',
        [],
        45000,
        'CDMX',
      );

      expect(desc).toContain('impermeabilizante prefabricado termofusionado');
      expect(desc).toContain('NOM-018-ENER');
      expect(desc).toContain('pendiente pluvial del 2%');
    });

    it('synthesizes dedicated EV charger electrical circuit scope', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'electrical',
        'Install Tesla Level 2 EV charger in attached garage',
        [{ description: '50A 240V circuit & NEMA 14-50', total: 1200 }],
        1200,
        'MI',
      );

      expect(desc).toContain('dedicated 240V / 50A branch circuit');
      expect(desc).toContain('Level 2 EVSE');
      expect(desc).toContain('NEC Article 625');
    });

    it('synthesizes 200A service panel upgrade scope', () => {
      const desc = synthesizeMunicipalScopeDescription(
        'electrical',
        'Upgrade main breaker panel to 200 amps',
        [],
        3500,
        'MI',
      );

      expect(desc).toContain('Upgrade existing residential electrical service to 200A');
      expect(desc).toContain('NEC Article 230');
    });
  });

  describe('Full AI Permit Application Autofill', () => {
    it('autofills complete municipal permit application with confidence scores and affirmations', () => {
      const app = autofillPermitWithAI({
        propertyAddress: '1500 N Main St, Royal Oak, MI 48067',
        trade: 'roofing',
        scopeText: 'Tear off 1 layer shingles and install Owens Corning Duration 24 sq',
        estimatedValuation: 14500,
        owner: {
          name: 'Sarah Jenkins',
          phone: '(248) 555-8833',
          email: 'sarah@example.com',
        },
        contractor: {
          businessName: 'Apex Roofing & Solar LLC',
          contactName: 'John Miller',
          licenseNumber: 'MI-210199482',
          insuranceCarrier: 'Travelers Property Casualty',
          policyNumber: 'TRV-994821',
          workersCompCarrier: 'Accident Fund',
          workersCompPolicy: 'WC-449201',
        },
        propertyData: {
          parcelNumber: '25-14-302-019',
          subdivision: 'Northwood Subdivision Lot 14',
          yearBuilt: 1985,
          occupancyClass: 'R-3 Residential',
          constructionType: 'Type V-B',
        },
      });

      // Metadata
      expect(app.metadata.jurisdictionId).toBe('mi-royal-oak');
      expect(app.metadata.authorityName).toBe('City of Royal Oak');
      expect(app.metadata.country).toBe('US');

      // Project Info
      expect(app.projectInfo.formattedAddress.value).toContain('Royal Oak');
      expect(app.projectInfo.parcelId.value).toBe('25-14-302-019');
      expect(app.projectInfo.parcelId.confidence).toBe('verified');
      expect(app.projectInfo.synthesizedProjectDescription.value).toContain('Tear off existing roof covering');
      expect(app.projectInfo.valuation.total.value).toBe(14500);
      expect(app.projectInfo.valuation.materials.value).toBeGreaterThan(0);
      expect(app.projectInfo.valuation.labor.value).toBeGreaterThan(0);

      // Owner & Contractor
      expect(app.ownerInfo.name.value).toBe('Sarah Jenkins');
      expect(app.contractorInfo.businessName.value).toBe('Apex Roofing & Solar LLC');
      expect(app.contractorInfo.stateLicense.value).toBe('MI-210199482');
      expect(app.contractorInfo.liabilityInsurance.value).toContain('Travelers');

      // Code Compliance Affirmations
      expect(app.codeComplianceAffirmations.smokeAndCoDetectorAffidavit.value).toBe(true);
      expect(app.codeComplianceAffirmations.iceBarrierRequired.value).toBe(true);
      expect(app.codeComplianceAffirmations.layersCountAllowed.value).toBe(2);

      // Fees and Requirements
      expect(app.feeSchedule.estimatedTotalFee).toBeGreaterThan(100);
      expect(app.requiredDocuments.length).toBeGreaterThan(0);
      expect(app.requiredInspections.length).toBeGreaterThan(0);
      expect(app.applicableCitations.length).toBeGreaterThan(0);
    });
  });
});
