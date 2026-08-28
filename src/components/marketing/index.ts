/* The shared marketing pieces. Import from here or from the individual files —
 * this barrel just keeps page imports to one line.
 *
 * ONE EXCEPTION, AND IT IS A BUILD ERROR RATHER THAN A SUBTLE ONE: a CLIENT
 * component must import from the individual files. FeatureDetailLayout below
 * reads the request's CSP nonce (next/headers) and is server-only, and a barrel
 * puts every export in the importer's module graph regardless of which names
 * are destructured — so a 'use client' page that wants ExampleFrame from here
 * fails with "you're importing a component that needs next/headers". See the
 * note at the top of app/home-next/page.tsx, which is where that happened. */

// FeatureDetailLayout is server-only (reads CSP nonce) and must be imported
// directly from './feature-detail-layout' rather than this barrel.

export { default as MarketingCta } from './marketing-cta';
export type { MarketingCtaProps } from './marketing-cta';

export { default as MarketingHeader } from './marketing-header';
export type { MarketingHeaderProps } from './marketing-header';

export { MARKETING_PAGE_CLASS, MARKETING_MAIN_ID } from './marketing-page';

export { default as ExampleFrame } from './example-frame';
export type { ExampleFrameProps } from './example-frame';

export { default as ShotSlider } from './shot-slider';
export type { Shot } from './shot-slider';

export { default as ExampleSiteShowcase } from './example-site-showcase';
export type { ExampleSiteShowcaseProps, ExampleSiteMode } from './example-site-showcase';

export { default as PriceZeroDial } from './price-zero-dial';
export type { PriceZeroDialProps } from './price-zero-dial';

export { default as FaqList } from './faq-list';
export type { FaqItem } from './faq-list';

export { default as RealProof, CustomerProof } from './real-proof';
export type { RealProofProps, CustomerStory } from './real-proof';

export { default as AllFeaturesModal } from './AllFeaturesModal';
export type { AllFeaturesModalProps } from './AllFeaturesModal';

export { CtaLink, APP_SIGNUP_URL, DEMO_URL, FEATURES_URL, SECONDARY_SIGNUP_LABEL } from './links';
export type { CtaLinkSpec } from './links';

