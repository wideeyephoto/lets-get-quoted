# Voice quote writes paused after a live-call defect

A caller asked dispatch to reduce an existing $2,375 quote to $2,300. The tool supplied a positive $2,300 line item; the database appended it and saved a $4,675 total. The assistant nevertheless said the total had been reduced to $2,300. The added item's unit_price representation also did not match the quote editor's amount representation.

The user-approved record correction removed the erroneous added item and set the original included work to $2,300, with a quote revision event. No customer text, email, payment request, or invoice was sent.

This release contains a temporary application guard for telephone dispatch. It rejects quote-price fields before any job mutation, including old-call requests and mixed price/schedule requests. The provider tool schema no longer offers quote-price inputs, the staff prompt directs price changes to the signed-in quote editor, and the phone-hotline UI describes the supported operations. Registered staff can still read jobs and save scope, schedule, status, and notes without verification codes. Draft change orders for genuine additional scope remain separate.

Restoring voice quote-price editing requires explicit add-item versus set-total operations; canonical quote items and consistent totals; approval/revision checks; an audit event; idempotency; and responses that report the financial result actually saved. The current legacy database helper is not a safe way to implement total reductions. This guard does not claim to implement that feature.

Voice-minute measurement was separately enabled in production with LGQ_VOICE_MINUTE_METER_ENABLED=1 and LGQ_VOICE_MINUTE_GATE_ENABLED=0. The health dashboard confirmed measurement mode. The call that exposed this defect began before activation and remained unmetered. Minute enforcement is still awaiting live metered-call checks and provider invoice reconciliation.
