/**
 * Preset Form Templates for Contractor Trades.
 * Pre-configured with realistic fields, measurement units, conditional logic, and signature workflows.
 */

import type { FormTemplate } from './types';

export const PRESET_FORM_TEMPLATES: FormTemplate[] = [
  // 1. HVAC Commissioning & System Startup
  {
    id: 'preset_hvac_commissioning',
    accountId: 'preset',
    title: 'HVAC Commissioning & System Startup Report',
    description: 'Comprehensive system commissioning verifying static pressures, refrigeration cycle, airflow CFM, electrical draw, and customer handover.',
    category: 'commissioning',
    trade: 'hvac',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I confirm the HVAC system was started, tested, and demonstrated in my presence. Operating instructions and filter maintenance guidelines have been provided.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_hvac_equip',
        title: '1. Equipment & System Info',
        description: 'Installed equipment serial numbers and specifications.',
        fields: [
          { id: 'f_hvac_model', label: 'Condenser / Outdoor Unit Model & Serial', type: 'text', required: true, placeholder: 'e.g. Carrier 24VNA936 / SN 2824X8812' },
          { id: 'f_hvac_furnace_model', label: 'Air Handler / Furnace Model & Serial', type: 'text', required: true, placeholder: 'e.g. Carrier 59MN7B080 / SN 1924A1029' },
          { id: 'f_hvac_refrig_type', label: 'Refrigerant Type', type: 'select', required: true, options: ['R-410A', 'R-32', 'R-454B', 'R-22'] },
          { id: 'f_hvac_filter_size', label: 'Filter Size & MERV Rating', type: 'text', required: true, placeholder: 'e.g. 16x25x4 MERV 11' },
        ],
      },
      {
        id: 'sec_hvac_electrical',
        title: '2. Electrical Measurements',
        description: 'Voltage, amperage, and capacitor readings under full load.',
        fields: [
          { id: 'f_hvac_volts', label: 'Supply Voltage (L1 to L2)', type: 'number', unit: 'Volts', required: true, min: 100, max: 260, placeholder: '240' },
          { id: 'f_hvac_comp_amps', label: 'Compressor Running Amps', type: 'number', unit: 'Amps', required: true, step: 0.1, placeholder: '11.4' },
          { id: 'f_hvac_fan_amps', label: 'Blower Motor Running Amps', type: 'number', unit: 'Amps', required: true, step: 0.1, placeholder: '3.2' },
          {
            id: 'f_hvac_elec_check',
            label: 'Electrical Connections Torqued & Wire Gauge Verified',
            type: 'pass_fail_na',
            required: true,
            conditionalRules: [
              {
                id: 'r_hvac_elec_fail',
                triggerFieldId: 'f_hvac_elec_check',
                operator: 'is_fail',
                action: 'flag_critical_issue',
                warningMessage: 'CRITICAL: Electrical connections failed torque check. Immediate retorque required before energizing.',
              },
            ],
          },
        ],
      },
      {
        id: 'sec_hvac_airflow',
        title: '3. Airflow & Static Pressure Testing',
        description: 'Ductwork static pressures and total external static pressure (TESP).',
        fields: [
          { id: 'f_hvac_supply_static', label: 'Supply Static Pressure', type: 'number', unit: 'in. w.c.', required: true, step: 0.01, placeholder: '0.25' },
          { id: 'f_hvac_return_static', label: 'Return Static Pressure', type: 'number', unit: 'in. w.c.', required: true, step: 0.01, placeholder: '0.22' },
          {
            id: 'f_hvac_tesp',
            label: 'Total External Static Pressure (TESP)',
            type: 'number',
            unit: 'in. w.c.',
            required: true,
            step: 0.01,
            placeholder: '0.47',
            conditionalRules: [
              {
                id: 'r_hvac_high_static',
                triggerFieldId: 'f_hvac_tesp',
                operator: 'greater_than',
                value: 0.75,
                action: 'flag_critical_issue',
                warningMessage: 'WARNING: Total static pressure exceeds 0.75 in. w.c. Duct restriction or undersized return detected.',
              },
              {
                id: 'r_hvac_static_remediation',
                triggerFieldId: 'f_hvac_tesp',
                operator: 'greater_than',
                value: 0.75,
                action: 'show',
                targetFieldId: 'f_hvac_static_notes',
              },
            ],
          },
          {
            id: 'f_hvac_static_notes',
            label: 'High Static Pressure Remediation Plan',
            type: 'textarea',
            helpText: 'Detail dampener adjustments or duct modifications made to lower static pressure.',
            required: false,
            placeholder: 'Adjusted supply damper on zone 2 and increased return grille area.',
          },
          { id: 'f_hvac_cfm', label: 'Measured Total Airflow', type: 'number', unit: 'CFM', required: true, min: 400, max: 3000, placeholder: '1200' },
        ],
      },
      {
        id: 'sec_hvac_refrig',
        title: '4. Temperatures & Refrigerant Charge',
        description: 'Temperature split across coil and refrigerant subcooling / superheat.',
        fields: [
          { id: 'f_hvac_return_temp', label: 'Return Air Temp (Dry Bulb)', type: 'number', unit: '°F', required: true, placeholder: '74' },
          { id: 'f_hvac_supply_temp', label: 'Supply Air Temp (Dry Bulb)', type: 'number', unit: '°F', required: true, placeholder: '55' },
          { id: 'f_hvac_delta_t', label: 'Temperature Split (Delta T)', type: 'number', unit: '°F', required: true, placeholder: '19' },
          { id: 'f_hvac_subcooling', label: 'Target / Actual Subcooling', type: 'number', unit: '°F', required: true, step: 0.1, placeholder: '10.5' },
          { id: 'f_hvac_superheat', label: 'Actual Superheat', type: 'number', unit: '°F', required: true, step: 0.1, placeholder: '12.0' },
        ],
      },
      {
        id: 'sec_hvac_safety',
        title: '5. Safety & Drain Verification',
        description: 'Condensate safety switches and leak tests.',
        fields: [
          { id: 'f_hvac_drain_float', label: 'Condensate Secondary Drain Float Switch Tested & Operational', type: 'pass_fail_na', required: true },
          { id: 'f_hvac_leak_check', label: 'Nitrogen Pressure Test & Electronic Refrigerant Leak Check', type: 'pass_fail_na', required: true },
          { id: 'f_hvac_flue_draft', label: 'Combustion Gas Draft & CO Detector Test (< 9 ppm)', type: 'pass_fail_na', required: true },
          { id: 'f_hvac_startup_photo', label: 'Startup Gauges & Data Plate Photo Evidence', type: 'photo', required: true, minPhotos: 1, allowPhotoCaption: true },
        ],
      },
    ],
  },

  // 2. Electrical Panel QA & Safety Inspection
  {
    id: 'preset_electrical_panel_qa',
    title: 'Electrical Panel & Service QA Inspection',
    description: 'Detailed inspection checklist for service panel upgrades, grounding electrode verification, arc-fault testing, and torque audits.',
    category: 'qa',
    trade: 'electrical',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I acknowledge the electrical panel installation and safety test inspection were completed. Panel directory and breaker operations have been reviewed.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_elec_service',
        title: '1. Service Entrance & Main Disconnect',
        fields: [
          { id: 'f_elec_main_size', label: 'Main Breaker Rating', type: 'select', required: true, options: ['100 Amp', '125 Amp', '150 Amp', '200 Amp', '400 Amp'] },
          { id: 'f_elec_meter_socket', label: 'Meter Socket Jaw Tension & Neutral Lug Secure', type: 'pass_fail_na', required: true },
          { id: 'f_elec_working_clearance', label: '36" Front Working Clearance & Dedicated Space Compliant (NEC 110.26)', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_elec_grounding',
        title: '2. Grounding & Bonding System',
        fields: [
          { id: 'f_elec_ground_rod', label: 'Dual Ground Rods (6ft apart) or Ufer Ground Connected (#4 Cu)', type: 'pass_fail_na', required: true },
          { id: 'f_elec_water_bond', label: 'Metallic Water Pipe Bond within 5ft of Entrance', type: 'pass_fail_na', required: true },
          { id: 'f_elec_gas_bond', label: 'Gas Piping Bond Connected', type: 'pass_fail_na', required: true },
          { id: 'f_elec_neutral_separation', label: 'Neutral & Ground Isolated in Subpanel (No green bonding screw)', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_elec_torque_breakers',
        title: '3. Lug Torque & Breakers Audit',
        fields: [
          { id: 'f_elec_torque_main', label: 'Main Lug Torque Applied (Manufacturer Spec ft-lbs)', type: 'number', unit: 'ft-lbs', required: true, placeholder: '250' },
          { id: 'f_elec_afci_test', label: 'All AFCI / GFCI Dual-Function Breakers Tested with Trip Button', type: 'pass_fail_na', required: true },
          {
            id: 'f_elec_trip_fail',
            label: 'Any Breakers Failed Trip or Arc-Fault Test?',
            type: 'radio',
            options: ['No - All Passed', 'Yes - Defect Identified'],
            required: true,
            conditionalRules: [
              {
                id: 'r_elec_trip_remediation',
                triggerFieldId: 'f_elec_trip_fail',
                operator: 'equals',
                value: 'Yes - Defect Identified',
                action: 'show',
                targetFieldId: 'f_elec_defect_notes',
              },
              {
                id: 'r_elec_trip_flag',
                triggerFieldId: 'f_elec_trip_fail',
                operator: 'equals',
                value: 'Yes - Defect Identified',
                action: 'flag_critical_issue',
                warningMessage: 'CRITICAL: One or more AFCI/GFCI breakers failed trip test. Defective device must be replaced before closing.',
              },
            ],
          },
          {
            id: 'f_elec_defect_notes',
            label: 'Failed Circuit Identification & Remediation',
            type: 'textarea',
            required: false,
            placeholder: 'Circuit #7 Bedroom Arc Fault identified neutral ground short in receptacle box; repaired and re-tested OK.',
          },
          { id: 'f_elec_labeling', label: 'Complete Typed Panel Circuit Directory Affixed', type: 'pass_fail_na', required: true },
          { id: 'f_elec_photo_panel', label: 'Finished Panel Interior & Deadfront Photos', type: 'photo', required: true, minPhotos: 2, allowPhotoCaption: true },
        ],
      },
    ],
  },

  // 3. Plumbing Rough-In & Pressure Test Inspection
  {
    id: 'preset_plumbing_roughin',
    title: 'Plumbing Rough-In & Pressure Test Certificate',
    description: 'Statutory pressure test verification for domestic water lines, DWV drain-waste-vent slope, and cleanout accessibility.',
    category: 'inspection',
    trade: 'plumbing',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I certify that the plumbing rough-in pressure test was performed and held gauge pressure without leakage.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_plumb_water_test',
        title: '1. Potable Water Pressure Test',
        fields: [
          { id: 'f_plumb_pipe_type', label: 'Water Supply Piping Material', type: 'select', required: true, options: ['PEX-A (Expansion)', 'PEX-B (Crimp)', 'Type L Copper', 'CPVC'] },
          { id: 'f_plumb_test_medium', label: 'Pressure Test Medium', type: 'select', required: true, options: ['Air Pressure (Pneumatic)', 'Water Pressure (Hydrostatic)'] },
          { id: 'f_plumb_test_psi', label: 'Test Pressure Applied', type: 'number', unit: 'PSI', required: true, placeholder: '80' },
          { id: 'f_plumb_hold_minutes', label: 'Pressure Hold Duration', type: 'number', unit: 'Minutes', required: true, placeholder: '15' },
          {
            id: 'f_plumb_pressure_drop',
            label: 'Any Measurable Pressure Drop Observed During Hold?',
            type: 'radio',
            options: ['No (0 PSI Drop - Pass)', 'Yes (Leak Detected - Fail)'],
            required: true,
            conditionalRules: [
              {
                id: 'r_plumb_drop_flag',
                triggerFieldId: 'f_plumb_pressure_drop',
                operator: 'equals',
                value: 'Yes (Leak Detected - Fail)',
                action: 'flag_critical_issue',
                warningMessage: 'CRITICAL FAILURE: Pressure drop detected on water line. Test failed. Isolate and repair joint before retesting.',
              },
              {
                id: 'r_plumb_drop_notes',
                triggerFieldId: 'f_plumb_pressure_drop',
                operator: 'equals',
                value: 'Yes (Leak Detected - Fail)',
                action: 'show',
                targetFieldId: 'f_plumb_leak_remediation',
              },
            ],
          },
          {
            id: 'f_plumb_leak_remediation',
            label: 'Leak Location & Remediation Actions Taken',
            type: 'textarea',
            required: false,
            placeholder: 'Defective fitting located at master bath vanity riser; recrimped and retested at 80 PSI for 15 mins with 0 drop.',
          },
          { id: 'f_plumb_gauge_photo', label: 'Calibrated Test Gauge Photo (Start & Finish)', type: 'photo', required: true, minPhotos: 1, allowPhotoCaption: true },
        ],
      },
      {
        id: 'sec_plumb_dwv',
        title: '2. DWV (Drain-Waste-Vent) Inspection',
        fields: [
          { id: 'f_plumb_dwv_slope', label: 'Proper Slope Maintained (Min 1/4" per foot for ≤2", 1/8" for ≥3")', type: 'pass_fail_na', required: true },
          { id: 'f_plumb_dwv_hanger_spacing', label: 'Pipe Hangers & Support Spacing Compliant (4ft max horizontal)', type: 'pass_fail_na', required: true },
          { id: 'f_plumb_cleanouts', label: 'All Required Cleanouts Accessible with Clearance', type: 'pass_fail_na', required: true },
          { id: 'f_plumb_nail_plates', label: 'Steel Stud Protection Nail Plates Installed on all Stud Penetrations', type: 'pass_fail_na', required: true },
        ],
      },
    ],
  },

  // 4. Roofing QA & Final Completion Certificate
  {
    id: 'preset_roofing_qa_certificate',
    title: 'Roofing Quality Assurance & Final Completion Certificate',
    description: 'Comprehensive roof installation verification covering decking, ice & water shield, flashings, fastener patterns, and property magnetic sweep.',
    category: 'completion_certificate',
    trade: 'roofing',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I certify that the roofing replacement and clean-up have been completed to my satisfaction. I have inspected the property perimeter and received warranty documentation.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_roof_underlayment',
        title: '1. Decking & Underlayment Layer',
        fields: [
          { id: 'f_roof_decking_condition', label: 'Plywood / OSB Decking Inspected & Rotted Sheets Replaced', type: 'pass_fail_na', required: true },
          { id: 'f_roof_ice_water', label: 'Self-Adhering Ice & Water Shield in Valleys, Eaves (24" inside wall), & Penetrations', type: 'pass_fail_na', required: true },
          { id: 'f_roof_drip_edge', label: 'Drip Edge Flashing Installed Over Underlayment at Rakes & Under at Eaves', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_roof_flashing',
        title: '2. Flashings & Chimney Waterproofing',
        fields: [
          { id: 'f_roof_step_flashing', label: 'Step Flashing Interwoven with Each Shingle Course along Sidewalls', type: 'pass_fail_na', required: true },
          { id: 'f_roof_pipe_boots', label: 'All Plumbing Vent Pipe Boot Flashing Brand New & Sealed', type: 'pass_fail_na', required: true },
          { id: 'f_roof_chimney_counter', label: 'Counter Flashing Mortared / Reglet-Cut into Brick Chimney', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_roof_shingles',
        title: '3. Shingle Installation & Fastening',
        fields: [
          { id: 'f_roof_nail_pattern', label: 'Proper 4-6 Nail Fastener Pattern Below Seal Strip (No High/Crooked Nails)', type: 'pass_fail_na', required: true },
          { id: 'f_roof_ridge_vent', label: 'Continuous Ridge Vent Installed with Baffles for Airflow', type: 'pass_fail_na', required: true },
          { id: 'f_roof_overhang', label: 'Shingle Overhang at Eaves & Rakes (3/8" to 3/4" uniform)', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_roof_cleanup',
        title: '4. Magnetic Nail Sweep & Site Cleanup',
        fields: [
          { id: 'f_roof_magnetic_sweep', label: 'Magnetic Nail Roller Sweep of Driveway, Lawn, and Landscaping Completed', type: 'pass_fail_na', required: true },
          { id: 'f_roof_gutters_cleaned', label: 'Gutters and Downspouts Cleared of All Shingle Grit & Nails', type: 'pass_fail_na', required: true },
          { id: 'f_roof_after_photos', label: 'Full Roof Slope & Property Cleanliness Photos', type: 'photo', required: true, minPhotos: 2, allowPhotoCaption: true },
        ],
      },
    ],
  },

  // 5. General Job Completion & Handover Certificate
  {
    id: 'preset_general_completion_certificate',
    title: 'Work Order Handover & Certificate of Completion',
    description: 'Universal contractor certificate confirming scope execution, punch list resolution, customer walkthrough demonstration, and required sign-off.',
    category: 'completion_certificate',
    trade: 'general',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I hereby confirm that the scope of work described in the contract and approved change orders has been fully executed to my complete satisfaction. All punch-list items have been resolved, the work site is clean, and I accept the completed work as delivered.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_general_scope',
        title: '1. Scope of Work & Deliverables',
        fields: [
          { id: 'f_gen_scope_complete', label: 'All Contract Scope Items & Change Orders 100% Executed', type: 'pass_fail_na', required: true },
          { id: 'f_gen_workmanship_qa', label: 'Contractor Quality Inspection Passed with Zero Defects', type: 'pass_fail_na', required: true },
          {
            id: 'f_gen_punch_list',
            label: 'Punch List Status',
            type: 'select',
            required: true,
            options: ['No Punch List - Zero Items Outstanding', 'All Punch List Items Completed & Accepted', 'Minor Punch List Agreed for Follow-up'],
            conditionalRules: [
              {
                id: 'r_gen_punch_items',
                triggerFieldId: 'f_gen_punch_list',
                operator: 'equals',
                value: 'Minor Punch List Agreed for Follow-up',
                action: 'show',
                targetFieldId: 'f_gen_punch_notes',
              },
            ],
          },
          {
            id: 'f_gen_punch_notes',
            label: 'Outstanding Punch List Items & Scheduled Completion Date',
            type: 'textarea',
            required: false,
            placeholder: '1. Touch up paint on baseboard corner (scheduled Friday 2 PM).',
          },
        ],
      },
      {
        id: 'sec_general_handover',
        title: '2. Homeowner Handover & Demonstration',
        fields: [
          { id: 'f_gen_demo_done', label: 'System Operations & Features Demonstrated to Customer', type: 'pass_fail_na', required: true },
          { id: 'f_gen_warranty_docs', label: 'Warranty Documentation, Manuals & Spare Materials Delivered', type: 'pass_fail_na', required: true },
          { id: 'f_gen_site_clean', label: 'Work Area Thoroughly Cleaned, Vacuumed & Debris Hauled Away', type: 'pass_fail_na', required: true },
          { id: 'f_gen_completed_photos', label: 'Completed Project Photos', type: 'photo', required: true, minPhotos: 2, allowPhotoCaption: true },
        ],
      },
      {
        id: 'sec_general_satisfaction',
        title: '3. Customer Satisfaction Rating',
        fields: [
          { id: 'f_gen_rating', label: 'Overall Experience & Quality Rating', type: 'scale', min: 1, max: 5, defaultValue: 5, required: true },
          { id: 'f_gen_customer_feedback', label: 'Customer Feedback or Special Comments', type: 'textarea', placeholder: 'The crew was prompt, clean, and delivered outstanding craftsmanship!' },
        ],
      },
    ],
  },

  // 6. Solar PV Commissioning & Grid Intertie QA
  {
    id: 'preset_solar_commissioning',
    title: 'Solar PV Commissioning & Grid Intertie QA',
    description: 'Commissioning log for solar photovoltaic arrays, string VOC/ISC testing, rapid shutdown test, and utility placard verification.',
    category: 'commissioning',
    trade: 'solar',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I certify that the solar PV system commissioning tests were performed and the system monitoring application has been activated.',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_solar_array',
        title: '1. Array String Measurements',
        fields: [
          { id: 'f_solar_module_count', label: 'Total Module Count', type: 'number', required: true, placeholder: '24' },
          { id: 'f_solar_str1_voc', label: 'String 1 Open Circuit Voltage (VOC)', type: 'number', unit: 'Volts DC', required: true, placeholder: '385.2' },
          { id: 'f_solar_str2_voc', label: 'String 2 Open Circuit Voltage (VOC)', type: 'number', unit: 'Volts DC', required: true, placeholder: '384.8' },
          { id: 'f_solar_str1_isc', label: 'String 1 Short Circuit Current (ISC)', type: 'number', unit: 'Amps DC', required: true, step: 0.1, placeholder: '10.8' },
        ],
      },
      {
        id: 'sec_solar_inverter',
        title: '2. Inverter & Rapid Shutdown Verification',
        fields: [
          { id: 'f_solar_inverter_sync', label: 'Inverter Grid Synchronization & AC Output Verified', type: 'pass_fail_na', required: true },
          { id: 'f_solar_rsd_test', label: 'Rapid Shutdown Initiator Switch Tested (< 30V within 30 seconds)', type: 'pass_fail_na', required: true },
          { id: 'f_solar_placards', label: 'NEC Compliant Red Reflective Warning Placards Affixed at Meter & AC Disconnect', type: 'pass_fail_na', required: true },
          { id: 'f_solar_app_paired', label: 'Homeowner Solar Monitoring App Paired & Gateway Online', type: 'pass_fail_na', required: true },
          { id: 'f_solar_photos', label: 'Inverter Installation, Placards & Utility Meter Photos', type: 'photo', required: true, minPhotos: 2 },
        ],
      },
    ],
  },

  // 7. Pre-Job Hazard Assessment (JHA) & Field Safety Checklist
  {
    id: 'preset_safety_jha',
    title: 'Pre-Job Hazard Assessment (JHA) & Safety Checklist',
    description: 'Pre-work site hazard analysis verifying overhead power lines, ladder tie-off, PPE compliance, and emergency protocols.',
    category: 'safety',
    trade: 'all',
    accountId: 'preset',
    requireTechSignature: true,
    requireCustomerSignature: false,
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_safety_hazards',
        title: '1. Site & Overhead Hazards',
        fields: [
          {
            id: 'f_safe_overhead_lines',
            label: 'Overhead Power Lines Present within 10ft of Work Area?',
            type: 'radio',
            options: ['No - Clear Area', 'Yes - Lines Present (Hazard Control Required)'],
            required: true,
            conditionalRules: [
              {
                id: 'r_safe_lines_flag',
                triggerFieldId: 'f_safe_overhead_lines',
                operator: 'equals',
                value: 'Yes - Lines Present (Hazard Control Required)',
                action: 'flag_critical_issue',
                warningMessage: 'CRITICAL SAFETY HAZARD: Overhead power lines in vicinity. Maintain minimum 10ft clearance at all times with fiberglass ladders only.',
              },
              {
                id: 'r_safe_lines_control',
                triggerFieldId: 'f_safe_overhead_lines',
                operator: 'equals',
                value: 'Yes - Lines Present (Hazard Control Required)',
                action: 'show',
                targetFieldId: 'f_safe_lines_notes',
              },
            ],
          },
          {
            id: 'f_safe_lines_notes',
            label: 'Power Line Clearance Control Plan',
            type: 'textarea',
            required: false,
            placeholder: 'Non-conductive ladders used; safety spotter assigned during material staging.',
          },
          { id: 'f_safe_underground_811', label: '811 Dig Safe Utility Markings Verified Prior to Excavation', type: 'pass_fail_na', required: true },
        ],
      },
      {
        id: 'sec_safety_ppe',
        title: '2. PPE & Fall Protection',
        fields: [
          { id: 'f_safe_ppe_checked', label: 'All Crew Equipped with Eye, Ear, Foot & Head Protection', type: 'pass_fail_na', required: true },
          { id: 'f_safe_ladder_4to1', label: 'Extension Ladders Secured at Top & Positioned at 4:1 Pitch (3ft extension above landing)', type: 'pass_fail_na', required: true },
          { id: 'f_safe_first_aid', label: 'Vehicle First Aid Kit & ABC Fire Extinguisher Inspected', type: 'pass_fail_na', required: true },
        ],
      },
    ],
  },
];
