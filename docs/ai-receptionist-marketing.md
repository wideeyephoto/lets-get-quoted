# AI Receptionist marketing integration

The existing public route `/features/ai-voice` now presents after-hours and full-time receptionist coverage. The homepage and feature index link to it. Signup preserves `feature=ai_receptionist` through authentication and onboarding and resolves to `/dashboard/voice-calls?view=settings`.

## Assets

- `public/images/ai-receptionist/coverage.webp`: 1672 × 941, 140,732 bytes. Created with the built-in image-generation tool from the approved campaign artwork, then encoded as WebP at quality 84. Labels remain accessible HTML.
- `public/features/og-ai-voice.jpg`: the existing site-native social-card template, refreshed with the receptionist message. Regenerate with `node scripts/build-feature-og.mjs ai-voice`.
- `public/audio/ai-receptionist-example.wav`: 36.29 seconds, mono 16 kHz / 16-bit PCM. Scripted illustration synthesized locally using Windows System.Speech (David Desktop for the receptionist, Zira Desktop for the homeowner), with 400 ms between lines. This is not a recording of the production receptionist. The player explicitly discloses this. Its exact transcript is in `src/lib/ai-receptionist-marketing.ts`.

## Final artwork prompt

Edit the referenced approved Let's Get Quoted AI Receptionist ad into a WEBSITE HERO PHOTOGRAPHIC ASSET. Output a clean 16:9 wide landscape diptych, high resolution. Preserve the same friendly adult male contractor's appearance, dark navy work shirt, tan work trousers, premium cinematic realism, navy/amber palette and the two narrative moments: LEFT half contractor relaxing at his kitchen table at night holding a dark mug with warm lamp light and navy evening windows; RIGHT half same contractor at a residential jobsite during daytime measuring cabinetry. Two balanced equal-width panels with a subtle dark central seam. Both figures clear at small responsive size, comfortable padding around faces and hands, waist-up compositions. REMOVE ALL TEXT, LETTERING, BRAND LOGOS (including shirt embroidery), UI PANELS, phone graphics, waveform graphics, captions, connectors, borders, icons, buttons and footers. No top blank headline area: extend the photographic scenes to fill the whole canvas. The website will overlay all labels as real HTML. The result is only two beautiful complementary photographic scenes side by side, full bleed, tasteful contrast, coherent characters, natural hands, no extra people. Do not change this into a screenshot or poster. No typography anywhere.

## Verification

- TypeScript: `npm run typecheck` passed.
- 427 tests across signup continuity, public links, feature pages, social cards, shared layout, launch banners, marketing navigation, pricing, and substantiated claims passed.
- Changed TypeScript/TSX files passed lint; existing unused-variable warnings remain in the feature index and welcome form.
- Browser: homepage, feature index, and receptionist page loaded. Both entry links reached the feature page. Checked desktop and 390 px phone width; no horizontal page overflow. Fixed parchment-theme text contrast in dark campaign panels.
- The native audio player loaded and played all 36.29 seconds; the asset responds with HTTP 200 and `audio/wav`.
- Hero, closing CTA and mobile dock retain the receptionist signup URL. Phone-line activation and plan access remain prerequisites; this change does not activate a workspace or change billing.

This commit contains marketing and signup-routing changes only. It does not deploy the website.

