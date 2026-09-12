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

export function BuilderPageTab() {
  const { pageSearchQuery, setPageSearchQuery, PAGE_CATEGORIES, id, pageCategory, setPageCategory, label, isSectionVisible, siteContent, updateQuoteForm, openSection, toggleSection, site, handleChange, dedicatedNumber, alertPhone, updateSiteContent, setActiveTab, setOpenSection, dragGroupRef, dragKey, pinnedHeaderReorder, jumpTo, pinnedHeroReorder, heroEyebrowPlaceholder, openPicker, setPicker, removeHeroExtraImage, handleRegenerateStockImages, isRegeneratingImages, AiCreditIndicator, availableAiCredits, flashField, reorderProps, updateServices, contentHint, StackItem, editingItemId, setEditingItemId, saveItem, createContentId, updateQuickStop, updateShowcase, galleryAutoTitle, autoSyncCompletedJobs, isPending, loadJobPhotoOptions, jobPhotosLoaded, jobPhotoOptions, importJobPhoto, updateBeforeAfter, importJobPhotoToBeforeAfter, videoCards, key, section, updateVideoSection, hint, styleLabel, clips, shown, setVideoStudioId, removeVideoSection, allVideoClipCount, addVideoSection, updateTestimonials, reviewHint, generatedReviewCount, gateSentence, removeGeneratedTestimonials, reviewCount, googleSearchGuess, autoSyncClientReviews, isLoadingInternalReviews, loadInternalReviews, internalReviewsLoaded, internalReviewOptions, importInternalReview, editTestimonial, uploadingTestimonialId, handleTestimonialImageUpload, selectableImages, updateHowItWorks, updateFaqs, updateStats, statsHint, generatedStatCount, removeGeneratedStats, resetSlotImage, editStat, updateBlog, blogHint, updateServiceAreas, updateProjectShowcase, projectShowcaseHint, projectBandOwnPhotos, projectPhotos, importJobPhotoToProject, pinnedFooterReorder, FOOTER_STYLES, desc, updateRatingBadge, setRatingInput, setReviewCountInput, ratingInput, reviewCountInput, updateTrustBadges, updateAnnouncement, updateStickyCallBar, updateChatButton, messagingSetup, updateWhyUs } = useContext(WebsiteBuilderContext);

  return (
    (
              <div className={styles.formSection}>
                <div className={styles.pageFilterBar}>
                  <div className={styles.pageSearchWrapper}>
                    <span className={styles.pageSearchIcon} aria-hidden="true">🔍</span>
                    <input
                      type="search"
                      className={styles.pageSearchInput}
                      value={pageSearchQuery}
                      onChange={(event) => setPageSearchQuery(event.target.value)}
                      placeholder="Filter sections (e.g. reviews, photos, services, phone)..."
                      aria-label="Filter page sections"
                    />
                    {pageSearchQuery && (
                      <button
                        type="button"
                        className={styles.pageSearchClear}
                        onClick={() => setPageSearchQuery('')}
                        aria-label="Clear filter search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className={styles.pageFilterChips} role="group" aria-label="Section category filter">
                    {PAGE_CATEGORIES.map((cat: any) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`${styles.pageFilterChip}${pageCategory === cat.id ? ` ${styles.pageFilterChipActive}` : ''}`}
                        onClick={() => setPageCategory(cat.id)}
                        aria-pressed={pageCategory === cat.id}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isSectionVisible('estimate', 'lead capture quote form smart intake contact thank you video phone') && (
                  <>
                    <div className={styles.cardGroupLabel}>Lead capture</div>
                    <p className={styles.cardGroupHint}>One intake runs at a time — pick which, then set it up below.</p>

                    <div className={styles.intakePicker} role="radiogroup" aria-label="How visitors reach you">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!siteContent.quoteForm.enabled}
                        className={`${styles.intakeChoice}${!siteContent.quoteForm.enabled ? ` ${styles.intakeChoiceOn}` : ''}`}
                        onClick={() => updateQuoteForm({ ...siteContent.quoteForm, enabled: false })}
                      >
                        <span className={styles.intakeChoiceMark} aria-hidden="true" />
                        <span className={styles.intakeChoiceCopy}>
                          <strong>Smart Intake <em>Recommended</em></strong>
                          <small>AI asks a couple of questions and shows an instant ballpark price.</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={siteContent.quoteForm.enabled}
                        className={`${styles.intakeChoice}${siteContent.quoteForm.enabled ? ` ${styles.intakeChoiceOn}` : ''}`}
                        onClick={() => updateQuoteForm({ ...siteContent.quoteForm, enabled: true })}
                      >
                        <span className={styles.intakeChoiceMark} aria-hidden="true" />
                        <span className={styles.intakeChoiceCopy}>
                          <strong>Classic quote form</strong>
                          <small>Visitors type out the job and wait for you to reply with a price.</small>
                        </span>
                      </button>
                    </div>

                    <SectionCard
                      variant="featured"
                      title="Contact & thank-you video"
                      description="The number on your call buttons, and what plays after somebody submits."
                      open={openSection === 'estimate'}
                      onToggleOpen={() => toggleSection('estimate')}
                    >
                      <label className={styles.formField}>
                        <span>Phone</span>
                        <input
                          id="bf-phone"
                          type="tel"
                          value={site.phone || ''}
                          onChange={(event) => handleChange('phone', event.target.value || null)}
                          placeholder={dedicatedNumber ? displayPhone(dedicatedNumber) : alertPhone ? displayPhone(alertPhone) : '(555) 123-4567'}
                        />
                        {(dedicatedNumber || alertPhone) && (
                          <div className={styles.chatNumberChips} style={{ marginTop: '0.4rem', marginBottom: '0.2rem' }}>
                            {dedicatedNumber && (
                              <button
                                type="button"
                                className={`${styles.chatNumberChip} ${site.phone && phoneDigits(site.phone) === phoneDigits(dedicatedNumber) ? styles.chatNumberChipActive : ''}`}
                                onClick={() => handleChange('phone', dedicatedNumber)}
                              >
                                💬 Use Dedicated Business Number ({displayPhone(dedicatedNumber)})
                              </button>
                            )}
                            {alertPhone && (!dedicatedNumber || phoneDigits(alertPhone) !== phoneDigits(dedicatedNumber)) && (
                              <button
                                type="button"
                                className={`${styles.chatNumberChip} ${site.phone && phoneDigits(site.phone) === phoneDigits(alertPhone) ? styles.chatNumberChipActive : ''}`}
                                onClick={() => handleChange('phone', alertPhone)}
                              >
                                📱 Use Account Mobile ({displayPhone(alertPhone)})
                              </button>
                            )}
                          </div>
                        )}
                        <small className={styles.fieldHint}>Powers your call buttons and the text/call follow-up on leads.</small>
                      </label>
                      {/* Customer Inbound Lead Funnel Selector */}
                      <div className={styles.formField} style={{ marginTop: '0.85rem', marginBottom: '0.85rem' }}>
                        <span>Customer Inbound Lead Funnel</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginTop: '0.35rem' }}>
                          <button
                            type="button"
                            className={`${styles.chatNumberChip} ${siteContent.phonePublic ? styles.chatNumberChipActive : ''}`}
                            style={{ padding: '0.75rem 0.9rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem', height: 'auto' }}
                            onClick={() => updateSiteContent({ phonePublic: true })}
                          >
                            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>📞</span> AI Phone Calls Funnel
                            </span>
                            <span style={{ fontSize: '0.74rem', opacity: 0.85, lineHeight: 1.3 }}>
                              Publishes call buttons so website visitors talk directly with your 24/7 AI Receptionist.
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`${styles.chatNumberChip} ${!siteContent.phonePublic ? styles.chatNumberChipActive : ''}`}
                            style={{ padding: '0.75rem 0.9rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem', height: 'auto' }}
                            onClick={() => updateSiteContent({ phonePublic: false })}
                          >
                            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>📝</span> Online Forms Funnel
                            </span>
                            <span style={{ fontSize: '0.74rem', opacity: 0.85, lineHeight: 1.3 }}>
                              Hides phone &amp; call buttons to funnel 100% of visitors into instant quote &amp; booking intake forms.
                            </span>
                          </button>
                        </div>
                        <small className={styles.fieldHint}>
                          {siteContent.phonePublic
                            ? '● Active Funnel: Call buttons live on website. Homeowners can tap to call your AI Receptionist.'
                            : '● Active Funnel: Phone hidden. Visitors are guided 100% into your online estimate and booking forms.'}
                        </small>
                      </div>
                      {siteContent.quoteForm.enabled && (
                        <label className={styles.formField}><span>What visitors see the form called</span><input type="text" maxLength={40} value={siteContent.quoteForm.formHeading} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, formHeading: event.target.value })} placeholder="Request an Estimate" /><small className={styles.fieldHint}>The heading on the hero capture and the button in your header. The classic form replies later rather than pricing on the spot, so avoid wording that promises an instant number.</small></label>
                      )}
                      <div className={styles.formField} id="bf-quote-form-style">
                        <span>Instant quote form appearance</span>
                        <div className={styles.formStyleLinkCard}>
                          <div>
                            <strong>
                              {QUOTE_FORM_STYLES.find((s: any) => s.key === (siteContent.quoteFormStyle || 'clean'))?.label || 'Clean & Crisp'}
                              {' · '}
                              {QUOTE_FORM_FIELD_BGS.find((s: any) => s.key === (siteContent.quoteFormFieldBg || 'auto'))?.label || 'Theme default'}
                              {QUOTE_FORM_STYLES.find((s: any) => s.key === (siteContent.quoteFormStyle || 'clean'))?.badge && (
                                <span className={styles.formStyleBadge}>
                                  {QUOTE_FORM_STYLES.find((s: any) => s.key === (siteContent.quoteFormStyle || 'clean'))?.badge}
                                </span>
                              )}
                            </strong>
                            <small>{QUOTE_FORM_STYLES.find((s: any) => s.key === (siteContent.quoteFormStyle || 'clean'))?.desc || 'Clear and trustworthy — best for most businesses'}</small>
                          </div>
                          <button
                            type="button"
                            className={styles.formStyleLinkBtn}
                            onClick={() => {
                              setActiveTab('design');
                              setOpenSection('quoteFormStyle');
                            }}
                          >
                            Customize in Design →
                          </button>
                        </div>
                        <small className={styles.fieldHint}>Visual styling, framing, and field backgrounds for the estimate card are configured under Brand &amp; Design.</small>
                      </div>
                      <div className={styles.contentSubhead}><strong>Thank-you video</strong><small>optional</small></div>
                      <IntroVideoField
                        video={siteContent.introVideo}
                        onChange={(introVideo) => updateSiteContent({ introVideo })}
                      />
                    </SectionCard>

                    <a className={styles.intakeSettingsLink} href="/dashboard/automations#intake-ai">
                      <span>
                        <strong>Configure Smart Intake</strong>
                        <small>
                          {siteContent.quoteForm.enabled
                            ? 'Set up its questions, qualification, pricing posture, alerts, and live preview.'
                            : 'Questions, qualification, pricing posture, alerts — and a live preview.'}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </>
                )}

                {(() => {
                  const mainDefs = [
                    { key: 'header', terms: 'header navigation menu bar style cta button mobile logo' },
                    { key: 'hero', terms: 'hero headline tagline photo video floating badges first impression' },
                    { key: 'services', terms: 'services work icon cards what we do list' },
                    { key: 'showcase', terms: 'photo gallery showcase images portfolio pictures completed jobs' },
                    { key: 'beforeAfter', terms: 'before after comparison sliders transformations' },
                    { key: 'video', terms: 'video sections clips youtube phone studio' },
                    { key: 'testimonials', terms: 'customer reviews testimonials google ratings feedback' },
                    { key: 'howItWorks', terms: 'how it works steps process walkthrough book' },
                    { key: 'faqs', terms: 'common questions faqs answers questions faq' },
                    { key: 'stats', terms: 'animated stats numbers counter jobs completed years in business' },
                    { key: 'blog', terms: 'blog posts articles news stories marketing' },
                    { key: 'serviceAreas', terms: 'cities you serve service areas towns locations coverage map' },
                    { key: 'projectShowcase', terms: 'project carousel showcase slider coverflow spotlight photos' },
                    { key: 'footer', terms: 'footer hours license copyright bottom' },
                  ];
                  const trustDefs = [
                    { key: 'rating', terms: 'star rating badge average reviews google trust' },
                    { key: 'trustBadges', terms: 'trust badges licensed insured bonded chips reassurance' },
                  ];
                  const barDefs = [
                    { key: 'announcement', terms: 'announcement bar banner top message urgent booking promo' },
                    { key: 'stickyBar', terms: 'sticky button mobile call tap to call quote bar bottom' },
                    { key: 'chatButton', terms: 'message button chat sms whatsapp texting number floating' },
                  ];
                  const careDefs = [
                    { key: 'whyUs', terms: 'why choose us points checklist promises care' },
                  ];

                  const hasEstimate = isSectionVisible('estimate', 'lead capture quote form smart intake contact thank you video phone');
                  const hasMain = mainDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasTrust = trustDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasBars = barDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasCare = site.template === 'handy' && careDefs.some((d) => isSectionVisible(d.key, d.terms));
                  const hasAny = hasEstimate || hasMain || hasTrust || hasBars || hasCare;

                  if (!hasAny) {
                    return (
                      <div className={styles.pageSearchEmpty}>
                        <span>No sections match &ldquo;{pageSearchQuery || pageCategory}&rdquo;</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPageSearchQuery('');
                            setPageCategory('all');
                          }}
                        >
                          Show all sections
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      {hasMain && (
                        <>
                          <div className={styles.cardGroupLabel}>Main sections</div>
                          <p className={styles.cardGroupHint}>Drag a section by its ⠿ handle to reorder it on your live page. Turned-off sections keep their spot but stay hidden until you switch them on.</p>
                          <div ref={dragGroupRef} className={`${styles.sectionDragGroup}${dragKey ? ` ${styles.sectionDragGroupActive}` : ''}`}>
                            {isSectionVisible('header', 'header navigation menu bar style cta button mobile logo') && (
                              <SectionCard reorder={pinnedHeaderReorder()} title="Header" description="Your navigation bar — the logo, business name, and menu at the very top of every page." open={openSection === 'header'} onToggleOpen={() => toggleSection('header')}>
                                <div className={styles.contentSubhead}><strong>Header style</strong><small>Adapts to your theme and accent color.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Header style">
                                  <button type="button" className={`${styles.footerPickerBtn}${siteContent.headerStyle === '' ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.headerStyle === ''} onClick={() => updateSiteContent({ headerStyle: '' })}>
                                    <strong>Theme default</strong><small>Each theme&apos;s own built-in header.</small>
                                  </button>
                                  {HEADER_STYLES.map((h) => (
                                    <button type="button" key={h.key} className={`${styles.footerPickerBtn}${siteContent.headerStyle === h.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.headerStyle === h.key} onClick={() => updateSiteContent({ headerStyle: h.key })}>
                                      <strong>{h.label}</strong><small>{h.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.headerCta} onChange={(event) => updateSiteContent({ headerCta: event.target.checked })} /><span><strong>Show the button in the header</strong><small>The call-to-action at the top-right of every page. Off = just your logo and menu. (Always hidden on phones — the menu carries the action there.)</small></span></label>
                                <label className={styles.toggleRow} style={{ marginTop: '.65rem' }}>
                                   <input
                                     type="checkbox"
                                     checked={!siteContent.hideHeaderCompanyName}
                                     onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                                   />
                                   <span>
                                     <strong>Show company name in header</strong>
                                     <small>Display your text business name next to your logo or icon. Turn off if your logo already includes your name.</small>
                                   </span>
                                 </label>
                                 <label className={styles.formField} style={{ marginTop: '.65rem' }}>
                                   <span>Header tagline / slogan</span>
                                   <input
                                     type="text"
                                     value={siteContent.headerTagline || ''}
                                     maxLength={100}
                                     placeholder="e.g. 24/7 Emergency Service • Licensed & Insured"
                                     onChange={(event) => updateSiteContent({ headerTagline: event.target.value })}
                                   />
                                   <small className={styles.fieldHint}>Displayed in the website header next to your logo or company name.</small>
                                 </label>

                                <hr className={styles.logoDivider} />
                                <div className={styles.contentSubhead}><strong>Mobile menu button</strong><small>The hamburger shown on phones.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Mobile menu button style">
                                  {MENU_BUTTON_STYLES.map((m) => (
                                    <button type="button" key={m.key} className={`${styles.footerPickerBtn}${siteContent.menuButton === m.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.menuButton === m.key} onClick={() => updateSiteContent({ menuButton: m.key })}>
                                      <strong>{m.label}</strong><small>{m.desc}</small>
                                    </button>
                                  ))}
                                </div>

                                <hr className={styles.logoDivider} />
                                <div className={styles.chatNumberChips} style={{ marginTop: '0.6rem' }}>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('design', 'logo')}>
                                    🎨 Logo &amp; Brand Icon (on Brand tab) →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('design', 'typography')}>
                                    ✏️ Typography &amp; Buttons (on Brand tab) →
                                  </button>
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('hero', 'hero headline tagline photo video floating badges first impression') && (
                              <SectionCard reorder={pinnedHeroReorder()} title="Hero" description="The whole top-of-page first impression — your headline, photo, and floating badges, in one place." hint={site.headline ? `“${site.headline.length > 46 ? `${site.headline.slice(0, 46).trimEnd()}…` : site.headline}”` : undefined} open={openSection === 'hero'} onToggleOpen={() => toggleSection('hero')}>
                                <div className={styles.contentSubhead}><strong>Headline &amp; message</strong></div>
                                <label className={styles.formField}><span>Small line above headline</span><input id="bf-hero-eyebrow" value={siteContent.heroEyebrow} maxLength={50} onChange={(event) => updateSiteContent({ heroEyebrow: event.target.value })} placeholder={heroEyebrowPlaceholder} /><small className={styles.fieldHint}>{site.template === 'shine' ? 'Optional — Shine shows this only if you add one.' : 'Leave empty to keep your template’s own wording.'}</small></label>
                                <label className={styles.formField}><span>Headline</span><textarea id="bf-headline" rows={2} value={site.headline || ''} onChange={(event) => handleChange('headline', event.target.value || null)} placeholder="Built with purpose. Finished with care." /></label>
                                <label className={styles.formField}><span>Tagline</span><textarea id="bf-tagline" rows={3} value={site.tagline || ''} onChange={(event) => handleChange('tagline', event.target.value || null)} placeholder="Tell homeowners what makes your business different." /></label>
                                <label className={styles.formField} id="bf-hero-shadow">
                                  <span>Headline readability &amp; text glow</span>
                                  <select
                                    id="bf-hero-shadow-select"
                                    value={siteContent.heroTextShadow || 'none'}
                                    onChange={(event) => updateSiteContent({ heroTextShadow: event.target.value as SiteHeroTextShadowStyle })}
                                  >
                                    {HERO_TEXT_SHADOW_STYLES.map((style) => (
                                      <option key={style.key} value={style.key}>{style.label}</option>
                                    ))}
                                  </select>
                                  <small className={styles.fieldHint}>
                                    Adds a dark glow, dropshadow, or backdrop behind your headline to ensure light text is easily readable over bright or busy photos.
                                  </small>
                                </label>
                                <div className={styles.contentSubhead}><strong>Hero photos</strong></div>
                                <div className={styles.imageSlot}>
                                  <div className={styles.imageSlotHead}><strong>Hero image</strong><small>The big photo at the top of your homepage.</small></div>
                                  {site.hero_url
                                    ? <div className={styles.heroSlotPreview}><img src={site.hero_url} alt="Current hero image" /></div>
                                    : <div className={styles.imageSlotEmpty}>No hero image yet</div>}
                                  <div className={styles.imageSlotActions}>
                                    <button type="button" className={styles.secondaryAction} onClick={() => openPicker('the hero image', 'hero')}>{site.hero_url ? 'Replace photo' : 'Add a hero image'}</button>
                                    {site.hero_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('hero_url', null)}>Remove</button>}
                                  </div>
                                </div>
                                <div className={styles.formField}>
                                  <span>Extra hero photos <em className={styles.fieldOptional}>optional</em></span>
                                  {siteContent.heroImages.length > 0 && (
                                    <div className={styles.imageSlots}>
                                      {siteContent.heroImages.map((url: any, index: any) => (
                                        <div key={`${index}-${url}`} className={styles.imageSlot}>
                                          <div className={styles.heroSlotPreview}><img src={url} alt={`Extra hero photo ${index + 2}`} /></div>
                                          <div className={styles.imageSlotActions}>
                                            <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: `hero photo ${index + 2}`, kind: 'heroExtra', heroExtraIndex: index })}>Replace</button>
                                            <button type="button" className={styles.secondaryAction} onClick={() => removeHeroExtraImage(index)}>Remove</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {siteContent.heroImages.length < MAX_EXTRA_HERO_IMAGES && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'an extra hero photo', kind: 'heroExtra' })}>Add hero photo</button>}
                                  <small className={styles.fieldHint}>Add up to {MAX_EXTRA_HERO_IMAGES} more. They cross-fade with your hero image and reappear as parallax bands further down the page.</small>
                                </div>
                                <HeroVideoField
                                  video={siteContent.heroVideo}
                                  heroImage={site.hero_url}
                                  onChange={(heroVideo) => updateSiteContent({ heroVideo })}
                                />
                                <div className={styles.stockBlock}>
                                  <div>
                                    <strong>Stock photos</strong>
                                    <p className={styles.fieldHint}>Representative stock photos from Pexels. Replace any one with a photo of your own work anytime. This picks a fresh set for every image on your site and keeps your uploads.</p>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                    <button type="button" className={styles.secondaryAction} onClick={handleRegenerateStockImages} disabled={isRegeneratingImages}>{isRegeneratingImages ? 'Finding photos…' : '✨ Regenerate all stock images'}</button>
                                    <AiCreditIndicator credits={availableAiCredits} />
                                  </div>
                                </div>
                                <div className={styles.contentSubhead}><strong>Floating badges</strong></div>
                                <div className={`${styles.formField}${flashField === 'heroBadge' ? ` ${styles.fieldFlash}` : ''}`} id="design-hero-badge">
                                  <label htmlFor="hero-badge-preset">Hero badge</label>
                                  <select id="hero-badge-preset" value={siteContent.heroBadge.preset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, preset: event.target.value } })}>{HERO_BADGE_PRESETS.map((badge: any) => <option key={badge.key} value={badge.key}>{badge.title}</option>)}<option value="custom">Custom badge…</option><option value="none">No badge</option></select>
                                  <small className={styles.fieldHint}>The floating trust chip on your hero photo (Fixit, Shine, Coat &amp; more).</small>
                                  {siteContent.heroBadge.preset === 'custom' && (
                                    <div className={styles.customBadgeFields}>
                                      <div className={styles.customBadgeRow}>
                                        <input value={siteContent.heroBadge.customIcon || ''} maxLength={4} className={styles.customBadgeIconInput} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customIcon: event.target.value } })} placeholder="Icon (e.g. ✓, ★, 🏆, 🛡️)" title="Badge icon" aria-label="Custom badge icon" />
                                        <input value={siteContent.heroBadge.customLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customLabel: event.target.value } })} placeholder="Badge title (e.g. Veteran Owned)" aria-label="Custom badge title" />
                                      </div>
                                      <input value={siteContent.heroBadge.customSubtitle || ''} maxLength={50} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customSubtitle: event.target.value } })} placeholder="Subtitle (optional, e.g. 10% Military Discount)" aria-label="Custom badge subtitle" />
                                    </div>
                                  )}
                                </div>
                                <label className={styles.formField}><span>Badge style</span><select value={siteContent.heroBadge.style} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, style: event.target.value } })}>{HERO_BADGE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                                <div className={styles.formField}>
                                  <label htmlFor="hero-badge-second">Extra floating badge</label>
                                  <select id="hero-badge-second" value={siteContent.heroBadge.secondPreset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondPreset: event.target.value } })}>
                                    <option value="default">Template default (e.g. &ldquo;500+ customers&rdquo;)</option>
                                    {HERO_BADGE_PRESETS.map((badge: any) => <option key={`second-${badge.key}`} value={badge.key}>{badge.title}</option>)}
                                    <option value="custom">Custom badge…</option>
                                    <option value="none">No extra badge</option>
                                  </select>
                                  <small className={styles.fieldHint}>The second chip beside your hero photo (Shine, Fixit &amp; Guild).</small>
                                  {siteContent.heroBadge.secondPreset === 'custom' && (
                                    <div className={styles.customBadgeFields}>
                                      <div className={styles.customBadgeRow}>
                                        <input value={siteContent.heroBadge.secondCustomIcon || ''} maxLength={4} className={styles.customBadgeIconInput} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomIcon: event.target.value } })} placeholder="Icon (e.g. ★, ⚡, 🛡️)" title="Second badge icon" aria-label="Custom second badge icon" />
                                        <input value={siteContent.heroBadge.secondCustomLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomLabel: event.target.value } })} placeholder="Badge title (e.g. Family Owned)" aria-label="Custom second badge title" />
                                      </div>
                                      <input value={siteContent.heroBadge.secondCustomSubtitle || ''} maxLength={50} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomSubtitle: event.target.value } })} placeholder="Subtitle (optional, e.g. 3 Generations)" aria-label="Custom second badge subtitle" />
                                    </div>
                                  )}
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('services', 'services work icon cards what we do list') && (
                              <SectionCard reorder={reorderProps('services', 'Services')} title="Services" description="Icon cards for the work you do — the first thing most home-services visitors scan for. Add a few with an icon, name, and one-line description." evidence="A clear service grid lets a visitor confirm 'they do what I need' in seconds — the fastest way to hold a home-services visitor's attention." enabled={siteContent.services.enabled} onToggleEnabled={(value) => updateServices({ ...siteContent.services, enabled: value })} {...contentHint(siteContent.services.enabled, siteContent.services.items.filter((svc: any) => svc.title.trim()).length, 'service')} open={openSection === 'services'} onToggleOpen={() => toggleSection('services')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.services.title} onChange={(event) => updateServices({ ...siteContent.services, title: event.target.value })} /></label>
                                <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.services.intro} onChange={(event) => updateServices({ ...siteContent.services, intro: event.target.value })} /></label>
                                <div className={styles.stackList}>
                                  {siteContent.services.items.map((item: any, index: any) => (
                                    <StackItem key={item.id} title={item.title.trim() || `Service ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateServices({ ...siteContent.services, items: siteContent.services.items.filter((svc: any) => svc.id !== item.id) })}>
                                      <div className={styles.formField}><span>Icon</span><div className={styles.iconPicker}>{SERVICE_ICON_KEYS.map((key) => (<button type="button" key={`${item.id}-${key}`} className={`${styles.iconPickerBtn}${item.icon === key ? ` ${styles.iconPickerBtnOn}` : ''}`} aria-label={`Icon: ${key}`} aria-pressed={item.icon === key} onClick={() => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc: any) => svc.id === item.id ? { ...svc, icon: key } : svc) })}><ServiceIcon name={key} /></button>))}</div></div>
                                      <label className={styles.formField}><span>Service name</span><input value={item.title} maxLength={60} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc: any) => svc.id === item.id ? { ...svc, title: event.target.value } : svc) })} placeholder="Interior painting" /></label>
                                      <label className={styles.formField}><span>Short description</span><input value={item.description} maxLength={140} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc: any) => svc.id === item.id ? { ...svc, description: event.target.value } : svc) })} placeholder="Walls, ceilings, and trim — clean lines, on schedule." /></label>
                                    </StackItem>
                                  ))}
                                </div>
                                {siteContent.services.items.length < 15 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('svc'); updateServices({ ...siteContent.services, enabled: true, items: [...siteContent.services.items, { id, icon: 'spark', title: '', description: '' }] }); setEditingItemId(id); }}>Add service</button>}
                              </SectionCard>
                            )}

                            {isSectionVisible('quickStop', 'quick stop priority visits same day next day route gap small fixes repairs diagnostics micro visits') && (
                              <SectionCard
                                reorder={reorderProps('quickStop', 'Quick Stop priority visits')}
                                title="Quick Stop priority visits"
                                description="Explain your fast route-gap visit service for small fixes, diagnostics, and quick repairs with fixed upfront fees."
                                evidence="Surfacing same-day and next-day route-gap slots captures high-intent homeowners with urgent small tasks who can't wait weeks."
                                enabled={siteContent.quickStop.enabled}
                                onToggleEnabled={(value) => updateQuickStop({ ...siteContent.quickStop, enabled: value })}
                                {...contentHint(siteContent.quickStop.enabled, siteContent.quickStop.items.length, 'feature', 'features')}
                                open={openSection === 'quickStop'}
                                onToggleOpen={() => toggleSection('quickStop')}
                              >
                                <label className={styles.formField}>
                                  <span>Presentation style</span>
                                  <select
                                    value={siteContent.quickStop.style}
                                    onChange={(event) =>
                                      updateQuickStop({
                                        ...siteContent.quickStop,
                                        style: event.target.value as SiteQuickStopStyle,
                                      })
                                    }
                                  >
                                    {QUICK_STOP_SECTION_STYLES.map((st) => (
                                      <option key={st.key} value={st.key}>
                                        {st.label} — {st.desc}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.formField}>
                                  <span>Top badge / banner pill</span>
                                  <input
                                    value={siteContent.quickStop.badgeText}
                                    maxLength={50}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, badgeText: event.target.value })
                                    }
                                    placeholder="⚡ 15–45 min priority visits"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Eyebrow tag</span>
                                  <input
                                    value={siteContent.quickStop.eyebrow}
                                    maxLength={60}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, eyebrow: event.target.value })
                                    }
                                    placeholder="⚡ Same-Day & Next-Day Route Gaps"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Section headline</span>
                                  <input
                                    value={siteContent.quickStop.title}
                                    maxLength={120}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, title: event.target.value })
                                    }
                                    placeholder="Need a Quick Fix? We Squeeze Small Jobs into Our Route"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Explanation text</span>
                                  <textarea
                                    rows={2}
                                    value={siteContent.quickStop.intro}
                                    maxLength={400}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, intro: event.target.value })
                                    }
                                    placeholder="Have a small repair or quick diagnostic? Quick Stops let us swing by between scheduled jobs for a flat priority visit fee."
                                  />
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <label className={styles.formField}>
                                    <span>Flat fee note</span>
                                    <input
                                      value={siteContent.quickStop.feeNote}
                                      maxLength={80}
                                      onChange={(event) =>
                                        updateQuickStop({ ...siteContent.quickStop, feeNote: event.target.value })
                                      }
                                      placeholder="Flat priority visit fee · Fixed upfront"
                                    />
                                  </label>
                                  <label className={styles.formField}>
                                    <span>CTA button label</span>
                                    <input
                                      value={siteContent.quickStop.ctaLabel}
                                      maxLength={40}
                                      onChange={(event) =>
                                        updateQuickStop({ ...siteContent.quickStop, ctaLabel: event.target.value })
                                      }
                                      placeholder="Request a Quick Stop"
                                    />
                                  </label>
                                </div>
                                <label className={styles.formField}>
                                  <span>CTA button link target</span>
                                  <input
                                    value={siteContent.quickStop.ctaHref}
                                    maxLength={120}
                                    onChange={(event) =>
                                      updateQuickStop({ ...siteContent.quickStop, ctaHref: event.target.value })
                                    }
                                    placeholder="#contact"
                                  />
                                </label>

                                <div className={styles.contentSubhead}>
                                  <strong>Quick Stop Features &amp; Steps</strong>
                                  <small>{siteContent.quickStop.items.length}/6</small>
                                </div>

                                <div className={styles.stackList}>
                                  {siteContent.quickStop.items.map((item: any, index: any) => (
                                    <StackItem
                                      key={item.id}
                                      title={item.title.trim() || `Item ${index + 1}`}
                                      meta={item.badge}
                                      editing={editingItemId === item.id}
                                      onEdit={() => setEditingItemId(item.id)}
                                      onSave={saveItem}
                                      onRemove={() =>
                                        updateQuickStop({
                                          ...siteContent.quickStop,
                                          items: siteContent.quickStop.items.filter((qs: any) => qs.id !== item.id),
                                        })
                                      }
                                    >
                                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.75rem' }}>
                                        <label className={styles.formField}>
                                          <span>Icon</span>
                                          <input
                                            value={item.icon}
                                            maxLength={6}
                                            onChange={(event) =>
                                              updateQuickStop({
                                                ...siteContent.quickStop,
                                                items: siteContent.quickStop.items.map((qs: any) =>
                                                  qs.id === item.id ? { ...qs, icon: event.target.value } : qs
                                                ),
                                              })
                                            }
                                            placeholder="⚡"
                                          />
                                        </label>
                                        <label className={styles.formField}>
                                          <span>Badge tag</span>
                                          <input
                                            value={item.badge ?? ''}
                                            maxLength={30}
                                            onChange={(event) =>
                                              updateQuickStop({
                                                ...siteContent.quickStop,
                                                items: siteContent.quickStop.items.map((qs: any) =>
                                                  qs.id === item.id ? { ...qs, badge: event.target.value } : qs
                                                ),
                                              })
                                            }
                                            placeholder="Fast Arrival"
                                          />
                                        </label>
                                      </div>
                                      <label className={styles.formField}>
                                        <span>Feature title</span>
                                        <input
                                          value={item.title}
                                          maxLength={80}
                                          onChange={(event) =>
                                            updateQuickStop({
                                              ...siteContent.quickStop,
                                              items: siteContent.quickStop.items.map((qs: any) =>
                                                qs.id === item.id ? { ...qs, title: event.target.value } : qs
                                              ),
                                            })
                                          }
                                          placeholder="Route-Gap Scheduling"
                                        />
                                      </label>
                                      <label className={styles.formField}>
                                        <span>Feature description</span>
                                        <input
                                          value={item.description}
                                          maxLength={200}
                                          onChange={(event) =>
                                            updateQuickStop({
                                              ...siteContent.quickStop,
                                              items: siteContent.quickStop.items.map((qs: any) =>
                                                qs.id === item.id ? { ...qs, description: event.target.value } : qs
                                              ),
                                            })
                                          }
                                          placeholder="We fit you into existing route gaps today or tomorrow."
                                        />
                                      </label>
                                    </StackItem>
                                  ))}
                                </div>

                                {siteContent.quickStop.items.length < 6 && (
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => {
                                      const id = createContentId('qs');
                                      updateQuickStop({
                                        ...siteContent.quickStop,
                                        enabled: true,
                                        items: [
                                          ...siteContent.quickStop.items,
                                          { id, icon: '⚡', title: '', description: '', badge: '' },
                                        ],
                                      });
                                      setEditingItemId(id);
                                    }}
                                  >
                                    Add item
                                  </button>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('showcase', 'photo gallery showcase images portfolio pictures completed jobs') && (
                              <SectionCard reorder={reorderProps('showcase', 'Photo gallery')} title="Photo gallery" description="Highlight finished work, project details, and job photos." evidence="Real project photos alongside reviews produced 55% more leads in one study — genuine work outperforms stock." enabled={siteContent.showcase.enabled} onToggleEnabled={(value) => updateShowcase({ ...siteContent.showcase, enabled: value })} {...contentHint(siteContent.showcase.enabled, siteContent.showcase.items.length, 'image')} open={openSection === 'showcase'} onToggleOpen={() => toggleSection('showcase')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.showcase.title} onChange={(event) => updateShowcase({ ...siteContent.showcase, title: event.target.value })} placeholder="Featured Projects" /></label>
                                <label className={styles.formField}><span>Intro</span><textarea rows={2} value={siteContent.showcase.intro} onChange={(event) => updateShowcase({ ...siteContent.showcase, intro: event.target.value })} placeholder="Whether it's a small job or big one, we've got you covered!" /></label>
                                <label className={styles.formField}><span>Menu link label</span><input value={siteContent.showcase.navLabel} maxLength={24} onChange={(event) => updateShowcase({ ...siteContent.showcase, navLabel: event.target.value })} placeholder="Gallery" /><small className={styles.fieldHint}>What this section is called in your header menu — e.g. &ldquo;Our work&rdquo;, &ldquo;Portfolio&rdquo;, &ldquo;Gallery&rdquo;.</small></label>
                                <label className={styles.formField}><span>Gallery layout</span><select value={siteContent.showcase.layout} onChange={(event) => updateShowcase({ ...siteContent.showcase, layout: event.target.value as SiteShowcaseContent['layout'] })}><option value="featured">Featured — one big photo</option><option value="grid">Uniform grid — even tiles</option><option value="filmstrip">Filmstrip — swipeable row</option></select></label>
                                <div className={styles.contentSubhead}><strong>Gallery Images</strong><small>{siteContent.showcase.items.length}/9 · shown in this order</small></div>
                                {siteContent.showcase.items.length > 0 && (
                                  <div className={styles.showcaseSelected} aria-label="Showcase images, in order">
                                    {siteContent.showcase.items.map((item: any, index: any) => (
                                      <div key={item.id} className={styles.showcaseSelectedTile}>
                                        <div className={styles.showcaseThumbBox}>
                                          <img src={item.url} alt={item.alt} />
                                          <div className={styles.showcaseSelectedActions}>
                                            <button type="button" onClick={() => setPicker({ label: 'this showcase photo', kind: 'showcase', scItemId: item.id })}>Replace</button>
                                            <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateShowcase({ ...siteContent.showcase, items: siteContent.showcase.items.filter((other: any) => other.id !== item.id) })}>✕</button>
                                          </div>
                                        </div>
                                        <input
                                          className={styles.showcaseCaptionInput}
                                          value={item.caption ?? ''}
                                          maxLength={60}
                                          placeholder={item.source === 'stock' ? galleryAutoTitle(index) || 'Title overlay' : 'Title overlay (optional)'}
                                          aria-label="Photo title overlay"
                                          onChange={(event) => updateShowcase({ ...siteContent.showcase, items: siteContent.showcase.items.map((other: any) => (other.id === item.id ? { ...other, caption: event.target.value } : other)) })}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Sync real finished projects and milestone photos into your showcase.</small></div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={autoSyncCompletedJobs} disabled={isPending}>⚡ Auto-sync portfolio</button>
                                    <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh' : 'Pick photos'}</button>
                                  </div>
                                </div>
                                {jobPhotosLoaded && (
                                  jobPhotoOptions.length > 0 ? (
                                    <div className={styles.compactImageGrid}>
                                      {jobPhotoOptions.map((photo: any) => (
                                        <button type="button" key={photo.path} className={styles.compactImageTile} onClick={() => importJobPhoto(photo)} disabled={isPending}>
                                          <img src={photo.url} alt={photo.label} />
                                          <span>Import</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('beforeAfter', 'before after comparison sliders transformations') && (
                              <SectionCard reorder={reorderProps('beforeAfter', 'Before & after')} title="Before &amp; after" description="Drag-to-reveal comparison sliders — the most shared element on a remodeler's site. Each pair needs both a before and an after image to appear on your site." evidence="Before/after galleries paired with reviews produced 55% more leads — for trades, the transformation is the product." enabled={siteContent.beforeAfter.enabled} onToggleEnabled={(value) => updateBeforeAfter({ ...siteContent.beforeAfter, enabled: value })} {...contentHint(siteContent.beforeAfter.enabled, siteContent.beforeAfter.items.filter((pair: any) => pair.beforeUrl && pair.afterUrl).length, 'pair')} open={openSection === 'beforeAfter'} onToggleOpen={() => toggleSection('beforeAfter')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.beforeAfter.title} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, title: event.target.value })} placeholder="Before & After" /></label>
                                <label className={styles.formField}><span>Description</span><input value={siteContent.beforeAfter.intro} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, intro: event.target.value })} placeholder="See the transformation" /></label>
                                {(() => {
                                  const pair = siteContent.beforeAfter.items[0];
                                  const openPhotoPicker = (side: 'before' | 'after') => {
                                    let id = pair?.id;
                                    if (!id) {
                                      id = createContentId('ba');
                                      updateBeforeAfter({ ...siteContent.beforeAfter, enabled: true, items: [{ id, beforeUrl: '', beforeAlt: '', afterUrl: '', afterAlt: '', label: '' }] });
                                    }
                                    setPicker({ label: side === 'before' ? 'the before photo' : 'the after photo', kind: 'beforeAfter', baItemId: id, baSide: side });
                                  };
                                  return (
                                    <div className={styles.imageSlots}>
                                      <div className={styles.imageSlot}>
                                        <div className={styles.imageSlotHead}><strong>Before</strong></div>
                                        {pair?.beforeUrl
                                          ? <div className={styles.heroSlotPreview}><img src={pair.beforeUrl} alt="Before preview" /></div>
                                          : <div className={styles.imageSlotEmpty}>No before photo</div>}
                                        <div className={styles.imageSlotActions}>
                                          <button type="button" className={styles.secondaryAction} onClick={() => openPhotoPicker('before')}>{pair?.beforeUrl ? 'Replace photo' : 'Add photo'}</button>
                                        </div>
                                      </div>
                                      <div className={styles.imageSlot}>
                                        <div className={styles.imageSlotHead}><strong>After</strong></div>
                                        {pair?.afterUrl
                                          ? <div className={styles.heroSlotPreview}><img src={pair.afterUrl} alt="After preview" /></div>
                                          : <div className={styles.imageSlotEmpty}>No after photo</div>}
                                        <div className={styles.imageSlotActions}>
                                          <button type="button" className={styles.secondaryAction} onClick={() => openPhotoPicker('after')}>{pair?.afterUrl ? 'Replace photo' : 'Add photo'}</button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Import completed job photos directly into your before/after slider.</small></div>
                                  <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                                </div>
                                {jobPhotosLoaded && (
                                  jobPhotoOptions.length > 0 ? (
                                    <div className={styles.compactImageGrid}>
                                      {jobPhotoOptions.map((photo: any) => (
                                        <div key={photo.path} className={styles.compactImageTile}>
                                          <img src={photo.url} alt={photo.label} />
                                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                            <button type="button" onClick={() => importJobPhotoToBeforeAfter(photo, 'before')} disabled={isPending} style={{ flex: 1, padding: '2px 4px', fontSize: '0.75rem' }}>+ Before</button>
                                            <button type="button" onClick={() => importJobPhotoToBeforeAfter(photo, 'after')} disabled={isPending} style={{ flex: 1, padding: '2px 4px', fontSize: '0.75rem' }}>+ After</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('video', 'video sections clips youtube phone studio') && videoCards.map((card: any, cardIndex: any) => (
                              <SectionCard
                                key={card.key}
                                reorder={reorderProps(card.key, card.label)}
                                title={card.label}
                                description="A section of video on your page. Pick one of six arrangements — a full-width backdrop, a video beside your message, a project story, a row of phone clips, a customer on camera, or your process."
                                evidence="A homeowner who watches you speak has already met you. Video on a service page is the closest thing to a first visit before the first visit."
                                enabled={card.section.enabled}
                                onToggleEnabled={(value) => updateVideoSection({ ...card.section, enabled: value })}
                                {...card.hint}
                                open={openSection === card.key}
                                onToggleOpen={() => toggleSection(card.key)}
                              >
                                <div className={styles.vsSummary}>
                                  <span>{card.styleLabel}</span>
                                  <span>{card.clips.length === 0 ? 'No video yet' : `${card.shown} showing`}</span>
                                  <span>{card.section.autoplay ? 'Autoplay muted' : 'Tap to play'}</span>
                                  {card.section.loop && <span>Loops</span>}
                                  {card.section.controls && <span>Controls on</span>}
                                </div>
                                <button type="button" className={styles.vsOpenBtn} onClick={() => setVideoStudioId(card.section.id)}>
                                  🎬 {card.clips.length === 0 ? 'Add a video' : 'Open the video studio'}
                                </button>
                                <p className={styles.fieldHint}>
                                  Upload a clip (up to 50 MB — about 45 seconds of phone video) or paste a YouTube link. Switching arrangements never loses what you&apos;ve written: every layout reads the same headline, description, and button.
                                </p>
                                {siteContent.videoSections.length > 1 && (
                                  <button type="button" className={styles.dangerAction} onClick={() => removeVideoSection(card.section.id)}>
                                    Remove this section
                                  </button>
                                )}

                                {allVideoClipCount > 0 && cardIndex === videoCards.length - 1 && (
                                  <div className={styles.videosNavBlock}>
                                    <label className={styles.toggleRow}>
                                      <input
                                        type="checkbox"
                                        checked={siteContent.videosPage.navEnabled}
                                        onChange={(event) => updateSiteContent({ videosPage: { ...siteContent.videosPage, navEnabled: event.target.checked } })}
                                      />
                                      <span>
                                        <strong>Add a video gallery page to your menu</strong>
                                        <small>
                                          Your clips already have their own page — this puts a link to it in your
                                          header menu. Off by default, because a menu is short and this is your call.
                                        </small>
                                      </span>
                                    </label>
                                    {siteContent.videosPage.navEnabled && (
                                      <label className={styles.formField}>
                                        <span>Link Label</span>
                                        <input
                                          value={siteContent.videosPage.navLabel}
                                          maxLength={24}
                                          placeholder={DEFAULT_VIDEOS_NAV_LABEL}
                                          onChange={(event) => updateSiteContent({ videosPage: { ...siteContent.videosPage, navLabel: event.target.value } })}
                                        />
                                        <small className={styles.fieldHint}>
                                          What the link is called in your header menu — e.g. &ldquo;Our work on
                                          video&rdquo;, &ldquo;Watch&rdquo;, &ldquo;See the job&rdquo;.
                                        </small>
                                      </label>
                                    )}
                                  </div>
                                )}
                              </SectionCard>
                            ))}

                            {isSectionVisible('video', 'video sections clips youtube phone studio') && siteContent.videoSections.length < MAX_VIDEO_SECTIONS && (
                              <button
                                type="button"
                                className={styles.secondaryAction}
                                style={{ order: 9999 }}
                                onClick={addVideoSection}
                              >
                                + Add another Video Section
                              </button>
                            )}

                            {isSectionVisible('testimonials', 'customer reviews testimonials google ratings feedback') && (
                              <SectionCard reorder={reorderProps('testimonials', 'Customer reviews')} title="Customer reviews" description="Show quotes from real customers on your public site." evidence="97% of homeowners read reviews before hiring a local pro, and the first few weigh the most." enabled={siteContent.testimonials.enabled} onToggleEnabled={(value) => updateTestimonials({ ...siteContent.testimonials, enabled: value })} {...reviewHint} open={openSection === 'testimonials'} onToggleOpen={() => toggleSection('testimonials')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.testimonials.title} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, title: event.target.value })} /></label>
                                {generatedReviewCount > 0 && (
                                  <div className={styles.warnNotice}>
                                    <strong>{generatedReviewCount === 1 ? 'One of these reviews was' : `${generatedReviewCount} of these reviews were`} written by AI as {generatedReviewCount === 1 ? 'an example' : 'examples'}.</strong>{' '}
                                    The names and the words are invented — no customer said them. Rewrite each one with a real customer&apos;s words, or delete them. {gateSentence}
                                    <div className={styles.imageSlotActions}>
                                      <button type="button" className={styles.secondaryAction} onClick={removeGeneratedTestimonials}>Delete the {generatedReviewCount === 1 ? 'example' : `${generatedReviewCount} examples`}</button>
                                    </div>
                                  </div>
                                )}
                                {reviewCount === 0 && (
                                  <div className={styles.reviewsPrompt}>
                                    <strong>Fill this with real reviews.</strong> Connect your Google Business Profile below to pull in verified reviews automatically — the honest, one-click way. Never post reviews you didn&apos;t receive.
                                  </div>
                                )}
                                <div className={styles.formField} id="google-business-profile">
                                  <span>Your Google Business Profile</span>
                                  <GoogleReviewImport
                                    placeId={siteContent.testimonials.googlePlaceId}
                                    name={siteContent.testimonials.googleName}
                                    reviewCount={siteContent.testimonials.googleReviewCount}
                                    importedCount={siteContent.testimonials.googleReviews.length}
                                    importedAt={siteContent.testimonials.googleImportedAt}
                                    defaultQuery={googleSearchGuess}
                                    trade={siteContent.trade}
                                    city={siteContent.serviceAreas?.cities?.[0] || ''}
                                    phone={site?.phone ?? ''}
                                    websiteUrl={site?.custom_domain || (site?.subdomain ? `https://${site.subdomain}.onrender.com` : '')}
                                    importedReviews={siteContent.testimonials.googleReviews}
                                    onImport={(data) => updateTestimonials({ ...siteContent.testimonials, enabled: true, sourceMode: 'mixed', googlePlaceId: data.placeId, googleName: data.name, googleUrl: data.url, googleRating: data.rating, googleReviewCount: data.reviewCount, googleReviews: data.reviews, googleImportedAt: new Date().toISOString().slice(0, 10) })}
                                    onClear={() => updateTestimonials({ ...siteContent.testimonials, sourceMode: 'manual', googlePlaceId: '', googleName: '', googleUrl: '', googleRating: 0, googleReviewCount: 0, googleReviews: [], googleImportedAt: '' })}
                                  />
                                  {siteContent.testimonials.googleReviews.length > 0 && (
                                    <div className={styles.googleReviewPreview}>
                                      {siteContent.testimonials.googleReviews.map((review: any) => (
                                        <div key={review.id} className={styles.googleReviewPreviewItem}>
                                          <div>{'★'.repeat(Math.round(review.rating))}<strong> {review.author}</strong></div>
                                          <p>{review.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className={styles.jobPhotoImport}>
                                  <div>
                                    <strong>Verified Let&apos;s Get Quoted reviews</strong>
                                    <small>Sync homeowner ratings and feedback from completed jobs into your testimonials.</small>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={autoSyncClientReviews} disabled={isLoadingInternalReviews || isPending}>⚡ Auto-sync reviews</button>
                                    <button type="button" onClick={loadInternalReviews} disabled={isLoadingInternalReviews || isPending}>
                                      {internalReviewsLoaded ? 'Refresh' : 'Pick reviews'}
                                    </button>
                                  </div>
                                </div>
                                {internalReviewsLoaded && (
                                  internalReviewOptions.length > 0 ? (
                                    <div className={styles.stackList}>
                                      {internalReviewOptions.map((rev: any) => (
                                        <div key={rev.id} className={styles.stackItem}>
                                          <div className={styles.itemHeader}>
                                            <div className={styles.itemTitleBtn}>
                                              <strong>{rev.clientName} ({'★'.repeat(rev.rating)})</strong>
                                              <small>{rev.jobRef ? `${rev.jobRef} · ` : ''}{rev.date}</small>
                                              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'inherit' }}>&ldquo;{rev.feedback}&rdquo;</p>
                                            </div>
                                            <div className={styles.itemActions}>
                                              <button type="button" className={styles.itemSaveBtn} onClick={() => importInternalReview(rev)}>
                                                + Import to site
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>No additional verified job reviews available to import.</p>
                                )}
                                <div className={styles.contentSubhead}><strong>Display style</strong><small>How your reviews are laid out on the page.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Review display style">
                                  {([
                                    { key: 'grid', label: 'Grid', desc: 'Static cards in a tidy grid.' },
                                    { key: 'carousel', label: 'Carousel', desc: 'Cards auto-slide in a loop.' },
                                    { key: 'spotlight', label: 'Spotlight', desc: 'One review at a time, cross-fading.' },
                                  ] as const).map((s: any) => (
                                    <button type="button" key={s.key} className={`${styles.footerPickerBtn}${siteContent.testimonials.displayStyle === s.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.testimonials.displayStyle === s.key} onClick={() => updateTestimonials({ ...siteContent.testimonials, displayStyle: s.key })}>
                                      <strong>{s.label}</strong><small>{s.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <div className={styles.stackList}>
                                  {siteContent.testimonials.items.map((item: any, index: any) => (
                                    <StackItem key={item.id} title={item.author.trim() || `Testimonial ${index + 1}`} meta={item.generated ? `${item.rating}★ · AI example` : `${item.rating}★`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.filter((testimonial: any) => testimonial.id !== item.id) })}>
                                      <div className={styles.formColumns}>
                                        <label className={styles.formField}><span>Customer</span><input value={item.author} onChange={(event) => editTestimonial(item.id, { author: event.target.value })} /></label>
                                        <label className={styles.formField}><span>Rating</span><select value={item.rating} onChange={(event) => editTestimonial(item.id, { rating: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                                      </div>
                                      <label className={styles.formField}><span>Project label</span><input value={item.label} onChange={(event) => editTestimonial(item.id, { label: event.target.value })} placeholder="Kitchen remodel, deck build, emergency repair..." /></label>
                                      <div className={styles.formColumns}>
                                        <div className={styles.formField}>
                                          <span>Photo (optional)</span>
                                          <label className={styles.blogCoverUpload}>
                                            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingTestimonialId === item.id} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) handleTestimonialImageUpload(item.id, file); }} />
                                            <span>{uploadingTestimonialId === item.id ? 'Uploading…' : item.imageUrl ? 'Replace photo' : 'Upload a photo'}</span>
                                          </label>
                                        </div>
                                        <label className={styles.formField}><span>Choose image</span><select value={item.imageUrl} onChange={(event) => {
                                          const image = selectableImages.find((candidate: any) => candidate.url === event.target.value);
                                          editTestimonial(item.id, { imageUrl: event.target.value, imageAlt: image?.alt || item.imageAlt || item.author || 'Customer review image' });
                                        }}><option value="">No image</option>{selectableImages.map((image: any) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                                      </div>
                                      {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.author || 'Review image preview'} /></div>}
                                      <label className={styles.formField}><span>Review text</span><textarea rows={4} value={item.text} onChange={(event) => editTestimonial(item.id, { text: event.target.value })} /></label>
                                    </StackItem>
                                  ))}
                                </div>
                                <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('testimonial'); updateTestimonials({ ...siteContent.testimonials, enabled: true, items: [...siteContent.testimonials.items, { id, author: '', text: '', rating: 5, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add testimonial</button>
                              </SectionCard>
                            )}

                            {isSectionVisible('howItWorks', 'how it works steps process walkthrough book') && (
                              <SectionCard reorder={reorderProps('howItWorks', 'How it works')} title="How it works" description="A simple 3–4 step walkthrough of what happens after they reach out — book, we arrive, job done. Removes the 'what do I have to do?' hesitation." evidence="Showing the process upfront lowers the perceived effort of reaching out — people act when they can see exactly what happens next." enabled={siteContent.howItWorks.enabled} onToggleEnabled={(value) => updateHowItWorks({ ...siteContent.howItWorks, enabled: value })} {...contentHint(siteContent.howItWorks.enabled, siteContent.howItWorks.steps.filter((step: any) => step.title.trim()).length, 'step')} open={openSection === 'howItWorks'} onToggleOpen={() => toggleSection('howItWorks')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.howItWorks.title} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, title: event.target.value })} /></label>
                                <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.howItWorks.intro} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, intro: event.target.value })} /></label>
                                <div className={styles.stackList}>
                                  {siteContent.howItWorks.steps.map((step: any, index: any) => (
                                    <StackItem key={step.id} title={step.title.trim() || `Step ${index + 1}`} editing={editingItemId === step.id} onEdit={() => setEditingItemId(step.id)} onSave={saveItem} onRemove={() => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.filter((s: any) => s.id !== step.id) })}>
                                      <label className={styles.formField}><span>Step title</span><input value={step.title} maxLength={60} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s: any) => s.id === step.id ? { ...s, title: event.target.value } : s) })} placeholder="Book online or call" /></label>
                                      <label className={styles.formField}><span>Description</span><input value={step.description} maxLength={160} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s: any) => s.id === step.id ? { ...s, description: event.target.value } : s) })} placeholder="Tell us what you need and pick a time that works." /></label>
                                    </StackItem>
                                  ))}
                                </div>
                                {siteContent.howItWorks.steps.length < 5 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('step'); updateHowItWorks({ ...siteContent.howItWorks, enabled: true, steps: [...siteContent.howItWorks.steps, { id, title: '', description: '' }] }); setEditingItemId(id); }}>Add step</button>}
                              </SectionCard>
                            )}

                            {isSectionVisible('faqs', 'common questions faqs answers questions faq') && (
                              <SectionCard reorder={reorderProps('faqs', 'Common questions')} title="Common questions (FAQ)" description="Answer common homeowner questions before they request a quote." enabled={siteContent.faqs.enabled} onToggleEnabled={(value) => updateFaqs({ ...siteContent.faqs, enabled: value })} {...contentHint(siteContent.faqs.enabled, siteContent.faqs.items.filter((faq: any) => faq.question.trim() && faq.answer.trim()).length, 'question')} open={openSection === 'faqs'} onToggleOpen={() => toggleSection('faqs')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.faqs.title} onChange={(event) => updateFaqs({ ...siteContent.faqs, title: event.target.value })} /></label>
                                <div className={styles.stackList}>
                                  {siteContent.faqs.items.map((item: any, index: any) => (
                                    <StackItem key={item.id} title={item.question.trim() || `Question ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.filter((faq: any) => faq.id !== item.id) })}>
                                      <label className={styles.formField}><span>Question</span><input value={item.question} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq: any) => faq.id === item.id ? { ...faq, question: event.target.value } : faq) })} /></label>
                                      <label className={styles.formField}><span>Answer</span><textarea rows={3} value={item.answer} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq: any) => faq.id === item.id ? { ...faq, answer: event.target.value } : faq) })} /></label>
                                    </StackItem>
                                  ))}
                                </div>
                                <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('faq'); updateFaqs({ ...siteContent.faqs, enabled: true, items: [...siteContent.faqs.items, { id, question: '', answer: '' }] }); setEditingItemId(id); }}>Add FAQ</button>
                              </SectionCard>
                            )}

                            {isSectionVisible('stats', 'animated stats numbers counter jobs completed years in business') && (
                              <SectionCard reorder={reorderProps('stats', 'Animated stats')} title="Animated stats" description="A band of big numbers that count up as visitors scroll — jobs completed, years in business, % satisfaction. Instant credibility." evidence="Concrete numbers — jobs done, years in business, response time — are instant, scannable credibility next to your work." enabled={siteContent.stats.enabled} onToggleEnabled={(value) => updateStats({ ...siteContent.stats, enabled: value })} {...statsHint} open={openSection === 'stats'} onToggleOpen={() => toggleSection('stats')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.stats.title} onChange={(event) => updateStats({ ...siteContent.stats, title: event.target.value })} /></label>
                                {generatedStatCount > 0 && (
                                  <div className={styles.warnNotice}>
                                    <strong>{generatedStatCount === 1 ? 'One of these numbers was' : `${generatedStatCount} of these numbers were`} made up by AI as {generatedStatCount === 1 ? 'an example' : 'examples'}.</strong>{' '}
                                    Nobody counted them. Type your own figures over them, or delete them. {gateSentence}
                                    <div className={styles.imageSlotActions}>
                                      <button type="button" className={styles.secondaryAction} onClick={removeGeneratedStats}>Delete the {generatedStatCount === 1 ? 'example' : `${generatedStatCount} examples`}</button>
                                    </div>
                                  </div>
                                )}
                                <div className={styles.imageSlot}>
                                  <div className={styles.imageSlotHead}><strong>Section photo</strong><small>The photo behind the numbers.</small></div>
                                  <div className={styles.heroSlotPreview}><img src={siteContent.images.stats || site.hero_url || STOCK_SITE_IMAGES[2].url} alt="Stats section photo" /></div>
                                  <div className={styles.imageSlotActions}>
                                    <button type="button" className={styles.secondaryAction} onClick={() => openPicker('the stats photo', 'slot', 'stats')}>Replace photo</button>
                                    {siteContent.images.stats && <button type="button" className={styles.secondaryAction} onClick={() => resetSlotImage('stats')}>Reset to default</button>}
                                  </div>
                                </div>
                                <div className={styles.stackList}>
                                  {siteContent.stats.items.map((item: any, index: any) => (
                                    <StackItem key={item.id} title={item.label.trim() || `Stat ${index + 1}`} meta={item.generated ? `${item.value} · AI example` : item.value} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateStats({ ...siteContent.stats, items: siteContent.stats.items.filter((stat: any) => stat.id !== item.id) })}>
                                      <div className={styles.formColumns}>
                                        <label className={styles.formField}><span>Value</span><input value={item.value} maxLength={12} onChange={(event) => editStat(item.id, { value: event.target.value })} placeholder="100+" /><small className={styles.fieldHint}>A short figure only — &ldquo;100+&rdquo;, &ldquo;$2M&rdquo;, &ldquo;24/7&rdquo;, &ldquo;4.9★&rdquo;. Put any words (like &ldquo;years&rdquo; or &ldquo;sq ft&rdquo;) in the label below, not here. Numbers count up on scroll.</small></label>
                                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => editStat(item.id, { label: event.target.value })} placeholder="Jobs completed" /></label>
                                      </div>
                                    </StackItem>
                                  ))}
                                </div>
                                <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('stat'); updateStats({ ...siteContent.stats, enabled: true, items: [...siteContent.stats.items, { id, value: '', label: '' }] }); setEditingItemId(id); }}>Add stat</button>
                              </SectionCard>
                            )}

                            {isSectionVisible('blog', 'blog posts articles news stories marketing') && (
                              <SectionCard reorder={reorderProps('blog', 'Blog')} title="Blog" description="Helpful articles for homeowners — maintenance tips, seasonal advice, and what to know before hiring. AI can draft them; you review and publish." evidence="Fresh, useful posts give Google more local pages to rank and give past customers a reason to return — search visibility that compounds over time." enabled={siteContent.blog.enabled} onToggleEnabled={(value) => updateBlog({ ...siteContent.blog, enabled: value })} {...blogHint} open={openSection === 'blog'} onToggleOpen={() => toggleSection('blog')}>
                                <label className={styles.formField}><span>Section title</span><input value={siteContent.blog.title} onChange={(event) => updateBlog({ ...siteContent.blog, title: event.target.value })} /></label>
                                <label className={styles.formField}><span>Intro (optional)</span><input value={siteContent.blog.intro} onChange={(event) => updateBlog({ ...siteContent.blog, intro: event.target.value })} /></label>

                                <div className={styles.contentSubhead}><strong>Your posts</strong><small>{siteContent.blog.posts.length === 0 ? 'none yet' : `${siteContent.blog.posts.length} total · ${siteContent.blog.posts.filter((p: any) => p.status === 'published').length} live`}</small></div>
                                {siteContent.blog.posts.length === 0 ? (
                                  <p className={styles.emptyHelper}>No posts yet. Write one on the blog page — AI can draft it for you.</p>
                                ) : (
                                  <ul className={styles.blogPreviewList}>
                                    {siteContent.blog.posts.slice(0, 6).map((post: any, index: any) => (
                                      <li key={post.id}>
                                        <span>{((t) => t.length > 46 ? `${t.slice(0, 46).trimEnd()}…` : t)(post.title.trim() || `Untitled post ${index + 1}`)}</span>
                                        <small>{post.status === 'published' ? 'Live' : post.publishAt ? `Scheduled ${post.publishAt}` : 'Draft'}</small>
                                      </li>
                                    ))}
                                    {siteContent.blog.posts.length > 6 ? <li><span>+ {siteContent.blog.posts.length - 6} more</span></li> : null}
                                  </ul>
                                )}
                                <a className={styles.blogGenerateBtn} href="/dashboard/marketing/blog">✍️ Write &amp; edit posts →</a>

                                <div className={styles.contentSubhead}><strong>Layout</strong><small>How posts are arranged on your site.</small></div>
                                <div className={styles.footerPicker} role="group" aria-label="Blog layout">
                                  {BLOG_STYLES.map((b) => (
                                    <button type="button" key={b.key} className={`${styles.footerPickerBtn}${siteContent.blog.layout === b.key ? ` ${styles.footerPickerBtnOn}` : ''}`} aria-pressed={siteContent.blog.layout === b.key} onClick={() => updateBlog({ ...siteContent.blog, layout: b.key })}>
                                      <span className={styles.layoutWireframe} aria-hidden="true">
                                        {b.key === 'grid' && (
                                          <span className={styles.wireframeGrid}>
                                            <span className={styles.wireframeGridCard} />
                                            <span className={styles.wireframeGridCard} />
                                            <span className={styles.wireframeGridCard} />
                                          </span>
                                        )}
                                        {b.key === 'featured' && (
                                          <span className={styles.wireframeFeatured}>
                                            <span className={styles.wireframeFeaturedLead} />
                                            <span className={styles.wireframeFeaturedList}>
                                              <span className={styles.wireframeFeaturedRow} />
                                              <span className={styles.wireframeFeaturedRow} />
                                              <span className={styles.wireframeFeaturedRow} />
                                            </span>
                                          </span>
                                        )}
                                        {b.key === 'rows' && (
                                          <span className={styles.wireframeRows}>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                            <span className={styles.wireframeRowItem}><span className={styles.wireframeRowThumb} /><span className={styles.wireframeRowLine} /></span>
                                          </span>
                                        )}
                                        {b.key === 'magazine' && (
                                          <span className={styles.wireframeMagazine}>
                                            <span className={styles.wireframeMagazineLead} />
                                            <span className={styles.wireframeMagazineSub}>
                                              <span className={styles.wireframeMagazineCard} />
                                              <span className={styles.wireframeMagazineCard} />
                                            </span>
                                          </span>
                                        )}
                                      </span>
                                      <strong>{b.label}</strong><small>{b.desc}</small>
                                    </button>
                                  ))}
                                </div>
                              </SectionCard>
                            )}

                            {isSectionVisible('serviceAreas', 'cities you serve service areas towns locations coverage map') && (
                              <SectionCard reorder={reorderProps('serviceAreas', 'Cities you serve')} title="Cities you serve" description={'List the towns and neighborhoods you cover. The names become on-page keywords that help you rank for "[trade] in [city]" searches — and reassure homeowners you serve their area.'} evidence={'Visitors decide "do they even serve me?" in ~3 seconds — naming their town reassures them and matches local search.'} enabled={siteContent.serviceAreas.enabled} onToggleEnabled={(value) => updateServiceAreas({ ...siteContent.serviceAreas, enabled: value })} {...contentHint(siteContent.serviceAreas.enabled, siteContent.serviceAreas.cities.filter((city: any) => city.trim()).length, 'city', 'cities')} open={openSection === 'serviceAreas'} onToggleOpen={() => toggleSection('serviceAreas')}>
                                <ServiceAreasField
                                  content={siteContent.serviceAreas}
                                  defaultZip={siteContent.zip}
                                  defaultServiceArea={site.service_area}
                                  onChange={updateServiceAreas}
                                />
                              </SectionCard>
                            )}

                            {isSectionVisible('projectShowcase', 'project carousel showcase slider coverflow spotlight photos') && (
                              <SectionCard reorder={reorderProps('projectShowcase', 'Project carousel')} title="Project Carousel &amp; Showcase" description="An animated visual band of your best photos — coverflow, spotlight, or auto-sliding carousel. Add your own here, or import them from completed jobs." evidence="An animated visual showcase catches the eye immediately and lets homeowners see multiple finished transformations in motion." enabled={siteContent.projectShowcase.enabled} onToggleEnabled={(value) => updateProjectShowcase({ ...siteContent.projectShowcase, enabled: value })} {...projectShowcaseHint} open={openSection === 'projectShowcase'} onToggleOpen={() => toggleSection('projectShowcase')}>
                                <label className={styles.formField}><span>Title</span><input value={siteContent.projectShowcase.eyebrow} maxLength={40} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, eyebrow: event.target.value })} placeholder="Recent Jobs" /></label>
                                <label className={styles.formField}><span>Heading</span><input value={siteContent.projectShowcase.title} maxLength={80} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, title: event.target.value })} placeholder="See Our Work" /></label>
                                {!projectBandOwnPhotos
                                  && siteContent.projectShowcase.eyebrow === DEFAULT_PROJECT_SHOWCASE_EYEBROW
                                  && siteContent.projectShowcase.title === DEFAULT_PROJECT_SHOWCASE_TITLE && (
                                  <p className={styles.fieldHint}>
                                    These are the default headings, and this band is showing stock photos, so your page currently reads &ldquo;{STOCK_PROJECT_SHOWCASE_EYEBROW} / {STOCK_PROJECT_SHOWCASE_TITLE}&rdquo; instead — those photos aren&apos;t your jobs. Upload one of your own, or write your own heading above, and yours is used.
                                  </p>
                                )}
                                <label className={styles.formField}><span>Showcase style</span><select value={siteContent.projectShowcase.style} onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, style: event.target.value as SiteProjectShowcaseContent['style'] })}>{PROJECT_SHOWCASE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                                <div className={styles.contentSubhead}><strong>Project photos</strong><small>{projectPhotos.length}/{MAX_PROJECT_SHOWCASE_ITEMS} · shown in this order</small></div>
                                {siteContent.projectShowcase.items.length === 0 && (
                                  <p className={styles.fieldHint}>
                                    {site.template === 'handy'
                                      ? 'Your site is showing placeholder photos here for now. Add your own project photos (upload, stock, or imported from a completed job) and they take over.'
                                      : 'Add your own project photos to show this section. On this theme it stays hidden until you do, so placeholder photos never go live.'}
                                  </p>
                                )}
                                <div className={styles.showcaseSelected} aria-label="Project photos, in order">
                                  {projectPhotos.map((item: any) => (
                                    <div key={item.id} className={styles.showcaseSelectedTile}>
                                      <div className={styles.showcaseThumbBox}>
                                        <img src={item.url} alt={item.alt} />
                                        <div className={styles.showcaseSelectedActions}>
                                          <button type="button" onClick={() => setPicker({ label: 'this project photo', kind: 'project', pjItemId: item.id })}>Replace</button>
                                          <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateProjectShowcase({ ...siteContent.projectShowcase, items: projectPhotos.filter((other: any) => other.id !== item.id) })}>✕</button>
                                        </div>
                                      </div>
                                      <input
                                        className={styles.showcaseCaptionInput}
                                        value={item.caption ?? ''}
                                        maxLength={60}
                                        placeholder="Headline (optional)"
                                        aria-label="Photo headline"
                                        onChange={(event) => updateProjectShowcase({ ...siteContent.projectShowcase, items: projectPhotos.map((other: any) => (other.id === item.id ? { ...other, caption: event.target.value } : other)) })}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {projectPhotos.length < MAX_PROJECT_SHOWCASE_ITEMS && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'a project photo', kind: 'project', pjItemId: null })}>Add photo</button>}
                                <div className={styles.jobPhotoImport}>
                                  <div><strong>Completed job photos</strong><small>Import private job photos into your image gallery.</small></div>
                                  <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                                </div>
                                {jobPhotosLoaded && (
                                  jobPhotoOptions.length > 0 ? (
                                    <div className={styles.compactImageGrid}>
                                      {jobPhotoOptions.map((photo: any) => (
                                        <button type="button" key={photo.path} className={styles.compactImageTile} onClick={() => importJobPhotoToProject(photo)} disabled={isPending}>
                                          <img src={photo.url} alt={photo.label} />
                                          <span>Import</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                                )}
                              </SectionCard>
                            )}

                            {isSectionVisible('footer', 'footer hours license copyright bottom') && (
                              <SectionCard reorder={pinnedFooterReorder()} title="Footer" description="How the bottom of every page is laid out. Applies to every theme." open={openSection === 'footer'} onToggleOpen={() => toggleSection('footer')}>
                                <div className={styles.footerPicker} role="group" aria-label="Footer layout">
                                  {FOOTER_STYLES.map((f: any) => (
                                    <button
                                      type="button"
                                      key={f.key}
                                      className={`${styles.footerPickerBtn}${siteContent.footerStyle === f.key ? ` ${styles.footerPickerBtnOn}` : ''}`}
                                      aria-pressed={siteContent.footerStyle === f.key}
                                      onClick={() => updateSiteContent({ footerStyle: f.key })}
                                    >
                                      <strong>{f.label}</strong>
                                      <small>{f.desc}</small>
                                    </button>
                                  ))}
                                </div>
                                <label className={styles.formField}><span>Business hours (optional)</span><input id="bf-hours" value={site.hours || ''} onChange={(event) => handleChange('hours', event.target.value || null)} placeholder="Monday-Friday, 7am-5pm" /><small className={styles.fieldHint}>Shown in the footer. Leave blank to hide it.</small></label>
                                <label className={styles.formField}><span>License (optional)</span><input id="bf-license" value={site.license || ''} onChange={(event) => handleChange('license', event.target.value || null)} placeholder="LIC #123456" /><small className={styles.fieldHint}>Shown in the footer to back your work. Leave blank to hide it.</small></label>
                                
                                <hr className={styles.logoDivider} />
                                <div className={styles.contentSubhead}><strong>More footer details</strong><small>These come from other sections of your site.</small></div>
                                <div className={styles.chatNumberChips} style={{ marginTop: '0.6rem' }}>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('page', 'serviceAreas', 'bf-area-intro')}>
                                    📍 Service Areas (Cities you serve) →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('page', 'estimate', 'bf-phone')}>
                                    📞 Phone Number &amp; Call Settings →
                                  </button>
                                  <button type="button" className={styles.chatNumberChip} onClick={() => jumpTo('business', 'socials')}>
                                    🌐 Social Media Profiles →
                                  </button>
                                </div>
                              </SectionCard>
                            )}
                          </div>
                        </>
                      )}

                      {hasTrust && (
                        <>
                          <div className={styles.cardGroupLabel}>Trust boosters</div>

                          {isSectionVisible('rating', 'star rating badge average reviews google trust') && (
                            <SectionCard title="Star-rating badge" description={'Shows a "4.9 ★ from 37 reviews" trust badge near your reviews. Enter your real average rating and review count — only enable this if the numbers are accurate.'} evidence="97% of buyers check reviews first — a rating shown right beside your form is what turns that trust into a call." enabled={siteContent.ratingBadge.enabled} onToggleEnabled={(value) => updateRatingBadge({ ...siteContent.ratingBadge, enabled: value })} open={openSection === 'rating'} onToggleOpen={() => toggleSection('rating')}>
                              {siteContent.testimonials.googleRating > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => {
                                      const rating = siteContent.testimonials.googleRating;
                                      const count = siteContent.testimonials.googleReviewCount;
                                      setRatingInput(String(rating));
                                      setReviewCountInput(String(count));
                                      updateRatingBadge({
                                        ...siteContent.ratingBadge,
                                        enabled: true,
                                        rating,
                                        reviewCount: count,
                                        sourceLabel: 'Google reviews',
                                      });
                                    }}
                                  >
                                    ⚡ Auto-sync from connected Google Reviews ({siteContent.testimonials.googleRating}★ · {siteContent.testimonials.googleReviewCount} reviews)
                                  </button>
                                </div>
                              )}
                              <div className={styles.formColumns}>
                                <label className={styles.formField}><span>Average rating (1–5)</span><input type="number" min={1} max={5} step={0.1} value={ratingInput} onChange={(event) => { const raw = event.target.value; setRatingInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, rating: Number(raw) }); }} onBlur={() => setRatingInput(String(siteContent.ratingBadge.rating))} /></label>
                                <label className={styles.formField}><span>Number of reviews</span><input type="number" min={0} step={1} value={reviewCountInput} onChange={(event) => { const raw = event.target.value; setReviewCountInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, reviewCount: Number(raw) }); }} onBlur={() => setReviewCountInput(String(siteContent.ratingBadge.reviewCount))} /></label>
                              </div>
                              <label className={styles.formField}><span>Source label</span><input value={siteContent.ratingBadge.sourceLabel} onChange={(event) => updateRatingBadge({ ...siteContent.ratingBadge, sourceLabel: event.target.value })} placeholder="Google reviews" /></label>
                            </SectionCard>
                          )}

                          {isSectionVisible('trustBadges', 'trust badges licensed insured bonded chips reassurance') && (
                            <SectionCard title="Trust badges" description="A row of reassurance chips (Licensed, Insured, Bonded…) on your public site. Toggle the ones that apply and edit the labels." evidence="Licensed / insured / bonded pros are seen ~5× more likely to finish the job; these chips lower the risk of reaching out." enabled={siteContent.trustBadges.enabled} onToggleEnabled={(value) => updateTrustBadges({ ...siteContent.trustBadges, enabled: value })} open={openSection === 'trustBadges'} onToggleOpen={() => toggleSection('trustBadges')}>
                              <p className={styles.fieldHint}>Check to show, uncheck to hide. Edit the label inline.</p>
                              <div className={styles.badgeList}>
                                {siteContent.trustBadges.badges.map((badge: any) => (
                                  <div className={styles.badgeRow} key={badge.id}>
                                    <input type="checkbox" checked={badge.enabled} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item: any) => item.id === badge.id ? { ...item, enabled: event.target.checked } : item) })} aria-label={`Show ${badge.label || 'badge'}`} />
                                    <input className={`${styles.badgeInput}${badge.enabled ? '' : ` ${styles.badgeInputOff}`}`} value={badge.label} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item: any) => item.id === badge.id ? { ...item, label: event.target.value } : item) })} placeholder="Badge label" />
                                    <button type="button" className={styles.badgeRemove} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.filter((item: any) => item.id !== badge.id) })} aria-label={`Remove ${badge.label || 'badge'}`}>×</button>
                                  </div>
                                ))}
                              </div>
                              <button type="button" className={styles.secondaryAction} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, enabled: true, badges: [...siteContent.trustBadges.badges, { id: createContentId('badge'), label: '', enabled: true }] })}>Add badge</button>
                            </SectionCard>
                          )}
                        </>
                      )}

                      {hasBars && (
                        <>
                          <div className={styles.cardGroupLabel}>Bars &amp; banners</div>

                          {isSectionVisible('announcement', 'announcement bar banner top message urgent booking promo') && (
                            <SectionCard title="Announcement bar" description={'A strip across the top of your site for one timely line — e.g. "Now booking for August". You type the message, so it never invents urgency; it only appears once filled in.'} evidence={'Urgency converts — emergency-ready trades close highest (12–16%); a "same-day" or "now booking" line cuts hesitation.'} enabled={siteContent.announcement.enabled} onToggleEnabled={(value) => updateAnnouncement({ ...siteContent.announcement, enabled: value })} open={openSection === 'announcement'} onToggleOpen={() => toggleSection('announcement')}>
                              <label className={styles.formField}><span>Message</span><input value={siteContent.announcement.message} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, message: event.target.value })} placeholder="Now booking August installs" /></label>
                              <label className={styles.formField}><span>Second line (optional)</span><input value={siteContent.announcement.subtext} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, subtext: event.target.value })} placeholder="Same-day estimates · Licensed &amp; insured" /></label>
                              <label className={styles.formField}><span>Last day to show (optional)</span><input type="date" value={siteContent.announcement.endDate} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, endDate: event.target.value })} /><small>The bar hides itself automatically after this date — great for limited-time promos.</small></label>
                              {siteContent.announcement.enabled && !siteContent.announcement.message.trim() && <p className={styles.emptyHelper}>Add a message above for the bar to appear on your site.</p>}
                            </SectionCard>
                          )}

                          {isSectionVisible('stickyBar', 'sticky button mobile call tap to call quote bar bottom') && (
                            <SectionCard title="Sticky Button (mobile)" description="Pins a tap-to-call button to the bottom of every phone screen, so homeowners can reach you in one tap. Needs a phone number (set in your intake section)." evidence="For home services the phone closes 25–55× better than a form; a one-tap bar that follows the visitor keeps it in reach (sticky CTAs lift conversions 15–40%)." enabled={siteContent.stickyCallBar.enabled} onToggleEnabled={(value) => updateStickyCallBar({ ...siteContent.stickyCallBar, enabled: value })} open={openSection === 'stickyBar'} onToggleOpen={() => toggleSection('stickyBar')}>
                              <label className={styles.formField}><span>Button label</span><input value={siteContent.stickyCallBar.callLabel} maxLength={30} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, callLabel: event.target.value })} placeholder="Call now" /><small className={styles.fieldHint}>The main tap-to-call button. It always dials your number.</small></label>
                              <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.stickyCallBar.showQuote} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, showQuote: event.target.checked })} /><span><strong>Add a second button</strong><small>A second button beside Call that jumps straight to your quote form.</small></span></label>
                              {siteContent.stickyCallBar.showQuote && <label className={styles.formField}><span>Second button label</span><input value={siteContent.stickyCallBar.quoteLabel} maxLength={30} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, quoteLabel: event.target.value })} placeholder="Free quote" /></label>}
                              {siteContent.stickyCallBar.enabled && !site.phone && <p className={styles.emptyHelper}>Add a phone number in your intake section to make this button appear.</p>}
                              {siteContent.stickyCallBar.enabled && site.phone && !siteContent.phonePublic && <p className={styles.emptyHelper}>Your phone number is set to hidden — this button won&apos;t appear until you turn &quot;Show my phone number&quot; back on.</p>}
                            </SectionCard>
                          )}

                          {isSectionVisible('chatButton', 'message button chat sms whatsapp texting number floating') && (
                            <SectionCard
                              title="Message button"
                              description="A floating button that opens a text or WhatsApp message to you, already addressed."
                              evidence="Plenty of homeowners will text about a job they wouldn't phone about — especially outside working hours."
                              enabled={siteContent.chatButton.enabled}
                              onToggleEnabled={(value) => updateChatButton({ ...siteContent.chatButton, enabled: value })}
                              open={openSection === 'chatButton'}
                              onToggleOpen={() => toggleSection('chatButton')}
                            >
                              <ChatButtonField
                                chatButton={siteContent.chatButton}
                                sitePhone={site.phone}
                                companyName={site.company_name}
                                messagingSetup={messagingSetup}
                                onChange={updateChatButton}
                              />
                            </SectionCard>
                          )}
                        </>
                      )}

                      {hasCare && (
                        <>
                          <div className={styles.cardGroupLabel}>Care template sections</div>

                          <SectionCard title="Why choose us" description="The checklist card beside your team photo — your promise points, in your words." enabled={siteContent.whyUs.enabled} onToggleEnabled={(value) => updateWhyUs({ ...siteContent.whyUs, enabled: value })} open={openSection === 'whyUs'} onToggleOpen={() => toggleSection('whyUs')}>
                            <label className={styles.formField}><span>Heading</span><input value={siteContent.whyUs.title} maxLength={80} onChange={(event) => updateWhyUs({ ...siteContent.whyUs, title: event.target.value })} /></label>
                            <div className={styles.badgeList}>
                              {siteContent.whyUs.points.map((point: any, index: any) => (
                                <div className={styles.badgeRow} key={index}>
                                  <input className={styles.badgeInput} value={point} maxLength={80} aria-label={`Point ${index + 1}`} onChange={(event) => updateWhyUs({ ...siteContent.whyUs, points: siteContent.whyUs.points.map((item: any, itemIndex: any) => itemIndex === index ? event.target.value : item) })} placeholder="e.g. Upfront, honest pricing" />
                                  <button type="button" className={styles.badgeRemove} onClick={() => updateWhyUs({ ...siteContent.whyUs, points: siteContent.whyUs.points.filter((_: any, itemIndex: any) => itemIndex !== index) })} aria-label={`Remove ${point || 'point'}`}>×</button>
                                </div>
                              ))}
                            </div>
                            {siteContent.whyUs.points.length < 6 && <button type="button" className={styles.secondaryAction} onClick={() => updateWhyUs({ ...siteContent.whyUs, points: [...siteContent.whyUs.points, ''] })}>Add point</button>}
                          </SectionCard>
                        </>
                      )}
                    </>
                  );
                })()}

              </div>
            )
  );
}
