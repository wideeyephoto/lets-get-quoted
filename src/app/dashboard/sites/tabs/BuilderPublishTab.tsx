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

export function BuilderPublishTab() {
  const { site, handlePublish, isPending, unreviewedSections, liveUrl, launchChecklist, label, done, go, hint, ROOT_DOMAIN, handleChange, checkSubdomain, subdomainStatus, verifyCustomDomain, domainStatus, domainVerification, openSection, toggleSection, liveDomain, handleRegenerateSeo, isRegeneratingSeo, AiCreditIndicator, availableAiCredits, googleBusinessLinked, verificationToken, siteContent, jumpTo, updateSiteContent, verificationProblem, updateLegal } = useContext(WebsiteBuilderContext);

  return (
    (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Publish</h2><p>Go live — put your website on the internet, then fine-tune your web address below.</p></div>

                <div className={`${styles.publishHero}${site.published ? ` ${styles.publishHeroLive}` : ''}`}>
                  <div className={styles.publishHeroInfo}>
                    <span className={`${styles.statusDot} ${site.published ? styles.liveDot : ''}`} aria-hidden="true" />
                    <div>
                      <strong>{site.published ? '🎉 Your website is live!' : 'Ready to go live?'}</strong>
                      <p>{site.published ? 'Homeowners can visit your website right now.' : 'Publishing puts your site on the internet for anyone to visit. You can switch it back to private anytime.'}</p>
                    </div>
                  </div>
                  <button type="button" className={styles.publishHeroBtn} onClick={handlePublish} disabled={isPending}>{isPending ? 'Working…' : site.published ? 'Unpublish' : '🚀 Publish my website'}</button>
                </div>
                {!site.published && !site.company_name.trim() && <p className={styles.publishRequirement}>A company name is required to publish. Add one on the Setup tab.</p>}
                {unreviewedSections.length > 0 && <p className={styles.publishRequirement}>{unreviewedSections.join(' and ')} still hold AI-written examples. Replace them with your real ones, delete them, or switch those sections off before {site.published ? 'saving to your live site' : 'publishing'}.</p>}
                {site.published && liveUrl && <a className={styles.publicLink} href={liveUrl} target="_blank" rel="noopener noreferrer">Open live website ↗</a>}

                <div className={styles.checklistCard}>
                  <strong>Launch checklist</strong>
                  <ul>
                    {launchChecklist.map((item: any) => (
                      <li key={item.label} data-done={item.done ? 'true' : 'false'}>
                        <span className={styles.checklistMark} aria-hidden="true">{item.done ? '✓' : '○'}</span>
                        {item.done
                          ? <span>{item.label}</span>
                          : <button type="button" className={styles.checklistGo} onClick={item.go}><span>{item.label}</span><small>{item.hint}</small></button>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.subdomainCard}>
                  <div className={styles.subdomainCardHead}>
                    <span className={styles.subdomainBadge}>★ Fastest way to go live</span>
                    <strong>Get your free address</strong>
                    <p>Free, instant, and included — pick a name and you&apos;re live at <span>{ROOT_DOMAIN}</span>. No DNS, no waiting.</p>
                  </div>
                  <label className={styles.formField}>
                    <div className={styles.domainControl}>
                      <div className={styles.subdomainInput}>
                        <input id="pub-subdomain" value={site.subdomain || ''} onChange={(event) => handleChange('subdomain', event.target.value.toLowerCase() || null)} placeholder="northline-builders" aria-label="Subdomain" />
                        <span className={styles.subdomainSuffix} aria-hidden="true">.{ROOT_DOMAIN}</span>
                      </div>
                      <button type="button" onClick={checkSubdomain} disabled={isPending}>Check</button>
                    </div>
                    <small>{subdomainStatus === 'available' ? `✓ ${site.subdomain}.${ROOT_DOMAIN} is available` : subdomainStatus === 'taken' ? '✕ That subdomain is already taken — try another' : 'Lowercase letters, numbers, and hyphens.'}</small>
                  </label>
                </div>
                <label className={styles.formField}><span>Custom domain</span><div className={styles.domainControl}><input value={site.custom_domain || ''} disabled={isPending} onChange={(event) => handleChange('custom_domain', event.target.value || null)} placeholder="www.yourbusiness.com" /><button type="button" onClick={verifyCustomDomain} disabled={isPending}>{domainStatus === 'checking' ? 'Checking...' : 'Check connection'}</button></div><small role="status">{domainStatus === 'verified' ? 'Connected with active SSL.' : domainVerification?.message || 'Enter your custom domain above, configure the DNS records below, then check connection.'}</small></label>
                <DomainConnector domain={site.custom_domain} target={domainVerification?.expectedCname || 'domains.letsgetquoted.com'} apexIp={domainVerification?.expectedIp || '76.76.21.21'} apexDomain={domainVerification?.apexDomain} />
                {domainVerification?.verification.map((record: any) => (
                  <div key={`${record.type}:${record.domain}:${record.value}`} className={styles.formField}>
                    <span>Domain ownership verification ({record.type})</span>
                    <small>Host: <code>{record.domain}</code></small>
                    <small>Value: <code>{record.value}</code></small>
                  </div>
                ))}

                <div className={styles.cardGroupLabel}>Search appearance</div>
                <SectionCard title="How you show up on Google" description="The page title and description searchers see before they click. Your hero image is used when your site is shared on social." open={openSection === 'seo'} onToggleOpen={() => toggleSection('seo')}>
                  <div className={styles.googleSnippet}>
                    <span className={styles.googleSnippetUrl}>{liveDomain || `${site.subdomain || 'your-business'}.${ROOT_DOMAIN}`}</span>
                    <strong className={styles.googleSnippetTitle}>{site.seo_title || site.company_name || 'Your company name'}</strong>
                    <p className={styles.googleSnippetDesc}>{site.seo_description || site.tagline || 'Your description appears here — one sentence on what you do and where.'}</p>
                  </div>
                  <div className={styles.seoActions}>
                    <small className={styles.fieldHint}>A live preview of how your site can appear in Google. Edit either field, or let us write it from your business details.</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <button type="button" className={styles.secondaryAction} onClick={handleRegenerateSeo} disabled={isRegeneratingSeo}>{isRegeneratingSeo ? 'Writing…' : '✨ Regenerate SEO text'}</button>
                      <AiCreditIndicator credits={availableAiCredits} />
                    </div>
                  </div>
                  <label className={styles.formField}>
                    <span>SEO page title</span>
                    <input id="bf-seo-title" maxLength={SEO_TITLE_LIMIT + 20} value={site.seo_title || ''} onChange={(event) => handleChange('seo_title', event.target.value || null)} placeholder={site.company_name || 'Your business, service and city'} />
                    <small className={(site.seo_title || '').length > SEO_TITLE_LIMIT ? styles.counterOver : undefined}>{(site.seo_title || '').length}/{SEO_TITLE_LIMIT} characters{(site.seo_title || '').length > SEO_TITLE_LIMIT ? ' — a bit long; Google may trim it' : ''}</small>
                  </label>
                  <label className={styles.formField}>
                    <span>Meta description</span>
                    <textarea id="bf-seo-description" rows={3} maxLength={SEO_DESC_LIMIT + 40} value={site.seo_description || ''} onChange={(event) => handleChange('seo_description', event.target.value || null)} placeholder={site.tagline || 'One sentence on what you do, where, and how customers book.'} />
                    <small className={(site.seo_description || '').length > SEO_DESC_LIMIT ? styles.counterOver : undefined}>{(site.seo_description || '').length}/{SEO_DESC_LIMIT} characters{(site.seo_description || '').length > SEO_DESC_LIMIT ? ' — a bit long; Google may trim it' : ''}</small>
                  </label>
                </SectionCard>

                <SectionCard
                  title="Get found on Google"
                  description="Two things outside your website that decide whether people find it."
                  hint={googleBusinessLinked && verificationToken ? 'Both done' : googleBusinessLinked || verificationToken ? '1 of 2 done' : undefined}
                  open={openSection === 'found'}
                  onToggleOpen={() => toggleSection('found')}
                >
                  {/* The map pack is three results, it sits above every ordinary
                      search result, and only Business Profiles appear in it. No
                      amount of work on this website can put you there — which is
                      exactly why it belongs in the builder, next to the work
                      people assume is enough. */}
                  <div className={styles.contentSubhead}>
                    <strong>1. Your Google Business Profile</strong>
                    <small>{googleBusinessLinked ? '✅ Linked' : 'Not linked yet'}</small>
                  </div>
                  <p className={styles.fieldHint}>
                    When someone searches “{siteContent.trade || 'plumber'} near me”, the map with three businesses
                    sits above everything else — and only businesses with a Google Business Profile can appear
                    in it. It’s free, and it’s the single biggest thing you can do to get calls.
                  </p>
                  {!googleBusinessLinked && (
                    <p className={styles.fieldHint}>
                      Claim yours at <a href="https://business.google.com" target="_blank" rel="noopener noreferrer">business.google.com</a>,
                      then add the link here so your website and your listing point at each other — Google uses that
                      to confirm they’re the same business.
                    </p>
                  )}
                  <div className={styles.legalEditActions}>
                    <button type="button" className={styles.secondaryAction} onClick={() => jumpTo('business', 'socials')}>
                      {googleBusinessLinked ? 'Edit the link' : 'Add my Business Profile link'}
                    </button>
                  </div>

                  <div className={styles.contentSubhead}>
                    <strong>2. Tell Google your site exists</strong>
                    <small>{verificationToken ? '✅ Verified tag added' : 'Optional'}</small>
                  </div>
                  <p className={styles.fieldHint}>
                    Your site publishes a sitemap at <code>/sitemap.xml</code> listing every page — but nobody has told
                    Google to read it. In <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Search Console</a>,
                    add {liveDomain || `${site.subdomain || 'your-site'}.${ROOT_DOMAIN}`} as a URL prefix property, choose the
                    <strong> HTML tag</strong> method, and paste what it gives you below. Save, publish, then click Verify.
                  </p>
                  <label className={styles.formField}>
                    <span>Google verification tag</span>
                    <input
                      id="bf-google-verification"
                      value={siteContent.googleSiteVerification}
                      onChange={(event) => updateSiteContent({ googleSiteVerification: event.target.value })}
                      placeholder='<meta name="google-site-verification" content="…" />'
                    />
                    {verificationProblem
                      ? <small className={styles.counterOver}>{verificationProblem}</small>
                      : <small className={styles.fieldHint}>Paste the whole tag or just the code — either works. Leave blank if you’d rather not.</small>}
                  </label>
                  <p className={styles.fieldHint}>
                    Once verified, submit <code>sitemap.xml</code> in Search Console. It’s also where you’ll see which
                    searches are finding you.
                  </p>
                </SectionCard>

                <SectionCard title="Legal pages" description="Auto-written Privacy Policy and Terms, linked in your footer at /privacy and /terms." open={openSection === 'legal'} onToggleOpen={() => toggleSection('legal')}>
                  {(() => {
                    const legalInput = { companyName: site.company_name, location: site.service_area || '', phone: siteContent.phonePublic ? (site.phone || '') : '', updated: siteContent.legal.updated };
                    return (
                      <>
                        <p className={styles.legalDisclaimer}>⚠️ These are starter templates tailored to your business — a helpful head start, <strong>not legal advice</strong>. Review them, and check with a lawyer for anything specific to how you operate, before publishing.</p>
                        <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.legal.privacyEnabled} onChange={(event) => updateLegal({ ...siteContent.legal, privacyEnabled: event.target.checked })} /><span><strong>Show a Privacy Policy</strong><small>Recommended — often required when you collect contact info, and by the text-message and payment providers that power your site.</small></span></label>
                        <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.legal.termsEnabled} onChange={(event) => updateLegal({ ...siteContent.legal, termsEnabled: event.target.checked })} /><span><strong>Show Terms of Service</strong><small>Sets expectations that quotes are estimates and covers basic use of your site.</small></span></label>
                        <label className={styles.formField}><span>Effective date (optional)</span><input type="date" value={siteContent.legal.updated} onChange={(event) => updateLegal({ ...siteContent.legal, updated: event.target.value })} /><small className={styles.fieldHint}>Shown at the top of both pages. Leave blank to omit.</small></label>

                        <div className={styles.contentSubhead}><strong>Privacy Policy text</strong><small>{siteContent.legal.privacyBody ? 'Custom' : 'Auto-written'}</small></div>
                        <textarea className={styles.legalTextarea} rows={6} value={siteContent.legal.privacyBody} placeholder="Using the auto-written Privacy Policy. Click “Load the template to edit” to customize it." onChange={(event) => updateLegal({ ...siteContent.legal, privacyBody: event.target.value })} />
                        <div className={styles.legalEditActions}>
                          <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, privacyBody: generatePrivacyPolicy(legalInput) })}>Load the template to edit</button>
                          {siteContent.legal.privacyBody && <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, privacyBody: '' })}>Reset to auto-written</button>}
                        </div>

                        <div className={styles.contentSubhead}><strong>Terms of Service text</strong><small>{siteContent.legal.termsBody ? 'Custom' : 'Auto-written'}</small></div>
                        <textarea className={styles.legalTextarea} rows={6} value={siteContent.legal.termsBody} placeholder="Using the auto-written Terms of Service. Click “Load the template to edit” to customize it." onChange={(event) => updateLegal({ ...siteContent.legal, termsBody: event.target.value })} />
                        <div className={styles.legalEditActions}>
                          <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, termsBody: generateTermsOfService(legalInput) })}>Load the template to edit</button>
                          {siteContent.legal.termsBody && <button type="button" className={styles.secondaryAction} onClick={() => updateLegal({ ...siteContent.legal, termsBody: '' })}>Reset to auto-written</button>}
                        </div>
                      </>
                    );
                  })()}
                </SectionCard>
              </div>
            )
  );
}
