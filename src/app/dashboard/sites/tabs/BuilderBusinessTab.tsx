import React, { useContext } from 'react';
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import type { Site, TemplateType } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getSiteContent, getTradeGlyphOptions, getUnreviewedGeneratedSections, glyphForContent, mergeSiteContent, COLOR_SCHEMES, getActiveColorSchemes, getColorScheme, HEADER_STYLES,
  MENU_BUTTON_STYLES,
  BLOG_STYLES, BUTTON_STYLES, HEADER_BUTTON_STYLES, WORDMARK_STYLES, HERO_TEXT_SHADOW_STYLES, QUOTE_FORM_STYLES, QUOTE_FORM_FIELD_BGS, QUOTE_FORM_RADII, QUOTE_FORM_STEPPERS, QUOTE_FORM_BADGES, QUOTE_FORM_WIDTHS, QUOTE_FORM_TRUST_CUES, DEFAULT_QUOTE_FORM_TRUST_ITEMS, HERO_BADGE_PRESETS, HERO_BADGE_STYLES, IMAGE_SLOT_LABELS, MAX_EXTRA_HERO_IMAGES, PROJECT_SHOWCASE_STYLES, MAX_PROJECT_SHOWCASE_ITEMS, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS, DEFAULT_PROJECT_SHOWCASE_EYEBROW, DEFAULT_PROJECT_SHOWCASE_TITLE, STOCK_PROJECT_SHOWCASE_EYEBROW, STOCK_PROJECT_SHOWCASE_TITLE, QUICK_STOP_SECTION_STYLES, VIDEO_SECTION_STYLES, videoStyleCapacity, videoSectionKey, MAX_VIDEO_SECTIONS, DEFAULT_VIDEOS_NAV_LABEL, type NormalizedSiteContent, type SiteHeroTextShadowStyle, type SiteProjectShowcaseContent, type SiteVideoSectionContent, type SiteBlogContent, type SiteAnnouncementContent, type SiteBeforeAfterContent, type SiteServicesContent, type SiteQuickStopContent, type SiteQuickStopStyle, type SiteHowItWorksContent, type SiteFaqContent, type SiteQuoteFormContent, type SiteRatingBadgeContent, type SiteServiceAreasContent, type SiteShowcaseContent, type SiteShowcaseItem, type SiteStatItem, type SiteStatsContent, type SiteTestimonialItem, type SiteStickyCallBarContent, type SiteChatButtonContent, type SiteAnalyticsContent, type SiteTestimonialsContent, type SiteTrustBadgesContent, type SiteWhyUsContent, type SiteLegalContent, type QuoteFormRadius, type QuoteFormWidth, type QuoteFormStepper, type QuoteFormBadge, type PendingAiLogo } from '@/lib/site-content';
import { generatePrivacyPolicy, generateTermsOfService } from '@/lib/legal/legal-copy';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import ServiceIcon, { SERVICE_ICON_KEYS } from '@/lib/templates/ServiceIcon';
import { checkSubdomainAvailableAction, generateSiteTextAction, getAvailableAiCreditsAction, getAiLogosAction, importJobPhotoToSiteImageAction, listCompletedJobPhotoOptionsAction, listCompletedJobReviewsAction, publishSiteAction, regenerateSeoCopyAction, regenerateStockImagesAction, syncClientReviewsToSiteAction, syncCompletedJobsToSiteAction, updateSiteAction, uploadSiteImageAction, verifyCustomDomainAction, type JobPhotoImportOption, type CompletedJobReviewOption, type GeneratedAiLogo } from '../actions';
import { SEO_TITLE_MAX as SEO_TITLE_LIMIT, SEO_DESC_MAX as SEO_DESC_LIMIT } from '@/lib/seo/seo-copy';
import { parseVerificationToken, verificationTokenProblem } from '@/lib/seo/search-console';
import { applyGeneratedSiteText, applyStockImages, siteIsUnwritten } from '@/lib/site-seed';
import type { PexelsPickPhoto } from '@/lib/stock/types';
import { compressImage } from '@/lib/client-images';
import ImagePickerModal from '../ImagePickerModal';
import DomainConnector from '../DomainConnector';
import GoogleReviewImport from '../GoogleReviewImport';
import IntroVideoField from '../IntroVideoField';
import HeroVideoField from '../HeroVideoField';
import LivePreview from '../LivePreview';
import BuilderTabStrip from '../BuilderTabStrip';
import SectionCard from '../SectionCard';
import SocialsField from '../SocialsField';
import ChatButtonField from '../ChatButtonField';
import type { MessagingSetup } from '@/lib/owner-sms';
import { displayPhone } from '@/lib/phone';
import { phoneDigits } from '@/lib/chat-button';
import AnalyticsField from '../AnalyticsField';
import ThemeIcon from '../ThemeIcon';
import VideoStudio from '../VideoStudio';
import AiLogoCreatorModal from '../AiLogoCreatorModal';
import ServiceAreasField from '../ServiceAreasField';
import styles from '../SiteEditor.module.css';
import { WebsiteBuilderContext } from '../WebsiteBuilderContext';

export function BuilderBusinessTab() {
  const { openSection, toggleSection, site, handleChange, siteContent, updateSiteContent, handleGenerateText, isGeneratingText, AiCreditIndicator, availableAiCredits, setShowLogoStudio, updateAnalytics } = useContext(WebsiteBuilderContext);

  return (
    (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}>
                  <h2>Setup</h2>
                  <p>Who you are — the business facts your whole website pulls from.</p>
                </div>

                <SectionCard title="Business basics" description="Your company name and trade power everything else — including the AI quick-start below." open={openSection === 'basics'} onToggleOpen={() => toggleSection('basics')}>
                  <div className={styles.drivers}>
                    <p className={styles.driversKicker}>✦ These power your whole site</p>
                    <div className={styles.formColumns}>
                      <label className={styles.formField}><span>Company name</span><input id="bf-company" value={site.company_name} onChange={(event) => handleChange('company_name', event.target.value)} /></label>
                      <label className={styles.formField}><span>Field of work / trade</span><input value={siteContent.trade} onChange={(event) => updateSiteContent({ trade: event.target.value })} placeholder="e.g. Window cleaning, roofing, HVAC" /></label>
                    </div>
                    <label className={styles.formField}><span>ZIP code</span><input value={siteContent.zip} maxLength={12} inputMode="numeric" onChange={(event) => updateSiteContent({ zip: event.target.value })} placeholder="e.g. 48226" /><small className={styles.fieldHint}>Sets your service area — the AI names the real nearby cities and towns you serve.</small></label>
                    <p className={styles.fieldHint} style={{ marginTop: '0.4rem' }}>Also editable under <a href="/dashboard/settings#business-basics">Settings &rarr; Business</a> — both stay in sync.</p>
                    <p className={styles.driversCaption}>Your headline, services, FAQs, service area, and Google listing are all generated from these.</p>
                  </div>
                  <div className={styles.aiButtonGroup}>
                    <button type="button" className={`btn primary ${styles.aiButton}`} onClick={handleGenerateText} disabled={isGeneratingText}>
                      {isGeneratingText ? 'Creating your tailored Website...' : '✨ Generate a full example site with AI'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <AiCreditIndicator credits={availableAiCredits} cost={1} />
                      <small className={styles.fieldHint} style={{ margin: 0 }}>Instant full website generation</small>
                    </div>
                  </div>
                  <small className={styles.fieldHint}>Fills in your whole site — headline, services, FAQs, Google listing, and more — from these two fields. Watch it appear in the preview. Reviews and stats are filled with examples — swap in your real ones before you publish.</small>

                  {/* Brand Identity & Jobsite Gear Quick-Launch Card */}
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1.1rem',
                      borderRadius: '12px',
                      background: 'radial-gradient(ellipse at 88% 12%, rgba(168, 85, 247, 0.12), transparent 55%), rgba(var(--tint), 0.03)',
                      border: '1.5px solid rgba(168, 85, 247, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#a855f7',
                            marginBottom: '0.15rem',
                          }}
                        >
                          ✦ Step 2: Brand Identity &amp; Jobsite Gear
                        </span>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text)' }}>
                          {site.logo_url ? 'Your Company Brand & Merch' : 'Give Your Website a Custom Brand Logo'}
                        </h3>
                      </div>
                      {site.logo_url && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'rgba(var(--tint), 0.06)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(var(--tint), 0.12)',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={site.logo_url} alt="Active brand logo" style={{ height: '22px', maxWidth: '44px', objectFit: 'contain' }} />
                          <span style={{ fontSize: '0.72rem', color: 'var(--good)', fontWeight: 700 }}>Active Logo</span>
                        </div>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                      {site.logo_url
                        ? 'Your custom logo is active in your website header. Open Brand Studio to generate new vector variations, or outfit your crew with matching uniforms and truck signs.'
                        : 'A custom logo replaces the plain text header on your website and establishes your visual identity. Generate bespoke vector concepts in seconds or order matching real-world swag.'}
                    </p>

                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowLogoStudio(true)}
                        style={{
                          flex: '1 1 180px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 0.9rem',
                          borderRadius: '8px',
                          border: '1.5px solid #a855f7',
                          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(99, 102, 241, 0.18))',
                          color: '#c084fc',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🎨 {site.logo_url ? 'Open AI Brand Studio' : '✨ Generate AI Logo Now'}
                      </button>

                      <Link
                        href="/dashboard/merchandise"
                        style={{
                          flex: '1 1 200px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 0.9rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(var(--tint), 0.12)',
                          background: 'rgba(var(--tint), 0.05)',
                          color: 'var(--text)',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        👕 Order Uniforms &amp; Merch &rarr;
                      </Link>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Socials &amp; listings"
                  description="Link your Facebook, Instagram, Google Business Profile and review listings."
                  evidence="Homeowners check your reviews before they call — linking the listings you already have is the cheapest trust you can add."
                  hint={siteContent.socials.length > 0 ? `${siteContent.socials.length} linked` : undefined}
                  open={openSection === 'socials'}
                  onToggleOpen={() => toggleSection('socials')}
                >
                  <SocialsField
                    socials={siteContent.socials}
                    socialsInHeader={siteContent.socialsInHeader}
                    onChange={(socials) => updateSiteContent({ socials })}
                    onHeaderChange={(socialsInHeader) => updateSiteContent({ socialsInHeader })}
                  />
                </SectionCard>

                <SectionCard
                  title="Visitor tracking"
                  description="Connect your own Google Analytics or Facebook pixel, with a consent banner that actually waits for a yes."
                  hint={siteContent.analytics.ga4.trim() || siteContent.analytics.metaPixel.trim() ? 'Connected' : undefined}
                  open={openSection === 'analytics'}
                  onToggleOpen={() => toggleSection('analytics')}
                >
                  <AnalyticsField analytics={siteContent.analytics} onChange={updateAnalytics} />
                </SectionCard>

              </div>
            )
  );
}
