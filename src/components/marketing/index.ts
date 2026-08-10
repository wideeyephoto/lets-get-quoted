/* The shared marketing pieces. Import from here or from the individual files —
 * both work; this barrel just keeps page imports to one line. */

export { default as FeatureDetailLayout } from './feature-detail-layout';
export type {
  FeatureDetailLayoutProps,
  FeatureDetailCard,
  FeatureProofPoint,
} from './feature-detail-layout';

export { default as MarketingCta } from './marketing-cta';
export type { MarketingCtaProps } from './marketing-cta';

export { default as MarketingHeader } from './marketing-header';
export type { MarketingHeaderProps } from './marketing-header';

export { MARKETING_PAGE_CLASS, MARKETING_MAIN_ID } from './marketing-page';

export { default as ExampleFrame } from './example-frame';
export type { ExampleFrameProps } from './example-frame';

export { default as ShotSlider } from './shot-slider';
export type { Shot } from './shot-slider';

export { default as PriceZeroDial } from './price-zero-dial';
export type { PriceZeroDialProps } from './price-zero-dial';

export { CtaLink, APP_SIGNUP_URL, DEMO_URL, FEATURES_URL } from './links';
export type { CtaLinkSpec } from './links';
