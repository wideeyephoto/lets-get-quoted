export type QuickStopExclusionRule = {
  key: string;
  label: string;
  unsafe: boolean;
  patterns: RegExp[];
  // Shown to the customer instead of booking options when unsafe.
  safety?: string;
};

// Ordered most-dangerous first. Patterns are intentionally conservative for the
// unsafe rules — a borderline gas/CO/fire mention SHOULD divert to safety copy.
export const QUICK_STOP_EXCLUSIONS: QuickStopExclusionRule[] = [
  {
    key: 'gas_leak',
    label: 'Possible gas leak',
    unsafe: true,
    patterns: [/\bgas (leak|smell|odou?r)\b/i, /\bsmell(s|ing)?\b[^.]*\bgas\b/i, /\bnatural gas\b[^.]*\bleak\b/i],
    safety:
      'If you smell gas or suspect a leak, treat it as an emergency: get everyone outside now, don’t switch anything on or off, and call 911 or your gas utility from a safe distance. This isn’t something to book online.',
  },
  {
    key: 'carbon_monoxide',
    label: 'Carbon monoxide concern',
    unsafe: true,
    patterns: [/\bcarbon monoxide\b/i, /\bco (alarm|detector) (going off|beeping|sounding)\b/i],
    safety:
      'A carbon monoxide alarm is an emergency. Get everyone into fresh air immediately and call 911. Don’t wait for a scheduled visit.',
  },
  {
    key: 'fire_smoke',
    label: 'Fire or smoke',
    unsafe: true,
    patterns: [/\b(on fire|caught fire|catching fire|flames?|smoke (coming|pouring)|burning smell|smells? burning)\b/i],
    safety: 'If there’s active fire or smoke, leave the building and call 911 right away.',
  },
  {
    key: 'electrical_hazard',
    label: 'Active electrical hazard',
    unsafe: true,
    patterns: [/\b(sparking|sparks|arcing|exposed (wire|wiring)|live wire|electrical fire|getting shocked|shock(ed|ing))\b/i],
    safety:
      'Sparking, arcing, or exposed live wiring is dangerous. Stay clear, shut the power off at the breaker only if you can do so safely, and call an emergency electrician or 911.',
  },
  {
    key: 'structural_failure',
    label: 'Structural failure',
    unsafe: true,
    patterns: [/\b(structural (failure|damage|collapse)|collaps(e|ed|ing)|sagging (roof|floor|ceiling)|foundation (failure|shifting))\b/i],
    safety:
      'Possible structural failure isn’t safe to occupy or to handle with a quick visit. Keep clear of the area and contact a structural engineer or emergency services.',
  },
  {
    key: 'uncontrolled_flooding',
    label: 'Uncontrolled flooding',
    unsafe: true,
    patterns: [/\b(flood(ing|ed)|water (pouring|gushing|everywhere)|uncontrolled water)\b/i],
    safety:
      'For active flooding, shut off the water at the main if you can reach it safely, and call an emergency plumber. If water is near electrical outlets or panels, stay clear and call 911.',
  },
  {
    key: 'sewage',
    label: 'Sewage remediation',
    unsafe: true,
    patterns: [/\b(raw sewage|sewage backup|sewer backup|septic (overflow|backup))\b/i],
    safety: 'A sewage backup is a health hazard that needs specialized remediation, not a short service visit. Please contact an emergency plumbing / remediation service.',
  },
  {
    key: 'mold_asbestos',
    label: 'Mold or asbestos',
    unsafe: true,
    patterns: [/\b(black mold|mold|mould|asbestos)\b/i],
    safety: 'Suspected mold or asbestos requires certified testing and remediation. This can’t be handled as a quick Quick Stop — please contact a licensed remediation specialist.',
  },
  {
    key: 'hazmat',
    label: 'Hazardous materials',
    unsafe: true,
    patterns: [/\b(hazardous material|hazmat|chemical spill|biohazard)\b/i],
    safety: 'Hazardous materials need specialized handling. Please contact the appropriate emergency or remediation service rather than booking a visit.',
  },
  // Non-unsafe: out of scope for a short single-tech visit. No safety copy.
  { key: 'permit_required', label: 'Permit-required work', unsafe: false, patterns: [/\b(permit|permitting|pull a permit|inspection required|code (upgrade|violation))\b/i] },
  { key: 'excavation', label: 'Excavation', unsafe: false, patterns: [/\b(excavat\w*|dig(ging)? (up|out|a trench)|trench(ing)?|backhoe)\b/i] },
  { key: 'large_replacement', label: 'Large replacement', unsafe: false, patterns: [/\b(re-?roof|whole[- ]house|full (replacement|rewire|repipe|reroof))\b/i, /\breplace\b[^.]{0,20}\b(roof|furnace|hvac|water heater|electrical panel|driveway|siding|windows)\b/i] },
  { key: 'multi_worker', label: 'Multi-worker job', unsafe: false, patterns: [/\b(two (guys|techs|technicians|workers)|multiple (workers|technicians)|crew of|needs? a crew)\b/i] },
  { key: 'multi_day', label: 'Multi-day job', unsafe: false, patterns: [/\b(multi(-| )?day|several days|couple of days|over (a )?few days|takes days)\b/i] },
  { key: 'special_order', label: 'Special-order materials', unsafe: false, patterns: [/\b(special[- ]order|custom (order|fabricat\w*)|order(ed)? (in )?parts|back[- ]?ordered)\b/i] },
];

export type ScreenResult = {
  matched: QuickStopExclusionRule[];
  unsafe: boolean;
  safety: string | null;
  labels: string[];
};

// Deterministic first line of defense. Scans the combined intake text against
// every rule; returns all matches, whether any are unsafe, and the safety copy
// for the first unsafe match. Pure — no I/O, no AI.
export function screenHardExclusions(text: string): ScreenResult {
  const hay = (text ?? '').toString();
  const matched = QUICK_STOP_EXCLUSIONS.filter((rule) => rule.patterns.some((p) => p.test(hay)));
  const firstUnsafe = matched.find((r) => r.unsafe);
  return {
    matched,
    unsafe: Boolean(firstUnsafe),
    safety: firstUnsafe?.safety ?? null,
    labels: matched.map((r) => r.label),
  };
}
