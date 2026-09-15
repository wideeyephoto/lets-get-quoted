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

export function BuilderDesignTab() {
  const { openSection, toggleSection, site, handleChange, siteContent, updateSiteContent, ACCENT_PRESETS, hex, name, iconSearch, TRADE_GLYPH_NOUNS, setIconSearch, setShowLogoStudio, pendingAiLogo, AiCreditIndicator, availableAiCredits, openPicker, HEADING_FONT_OPTIONS, value, label, updateQuoteForm } = useContext(WebsiteBuilderContext);

  return (
    (
              <div className={styles.formSection}>
                <SectionCard title="Theme &amp; colors" open={openSection === 'theme'} onToggleOpen={() => toggleSection('theme')}>
                  <div className={styles.cardGroupLabel}>Theme</div>
                  <div className={styles.themeGrid}>
                    {AVAILABLE_TEMPLATES.map((template) => (
                      <button type="button" key={template.id} className={`${styles.themeOption}${site.template === template.id ? ` ${styles.selectedTheme}` : ''}`} onClick={() => handleChange('template', template.id as TemplateType)} aria-pressed={site.template === template.id}>
                        <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} abbr={template.abbr} />
                        <span className={styles.themeOptionInfo}><strong>{template.name}</strong></span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.cardGroupLabel}>Color</div>
                  <div className={styles.formField}>
                    <span>Color scheme</span>
                    {(() => {
                      const currentTemplateConfig = AVAILABLE_TEMPLATES.find((t) => t.id === site.template) || AVAILABLE_TEMPLATES[0];
                      const activeSchemes = getActiveColorSchemes();
                      const currentKey = siteContent.colorScheme;
                      const isLegacy = COLOR_SCHEMES.some((s: any) => s.key === currentKey && s.status === 'legacy');
                      const shownSchemes = isLegacy
                        ? [...activeSchemes, COLOR_SCHEMES.find((s: any) => s.key === currentKey)!]
                        : activeSchemes;

                      return (
                        <>
                          <div className={styles.schemeSwatches} role="group" aria-label="Full color schemes">
                            <button
                              type="button"
                              className={`${styles.schemeSwatch}${!siteContent.colorScheme ? ` ${styles.schemeSwatchActive}` : ''}`}
                              onClick={() => updateSiteContent({ colorScheme: '' })}
                              aria-pressed={!siteContent.colorScheme}
                              aria-label="Theme default — template built-in palette"
                            >
                              <div className={styles.schemeMockup} style={{ background: '#0f1319' }}>
                                <div className={styles.mockHeader} style={{ background: '#080a0d' }}>
                                  <span style={{ width: 12, height: 2, background: '#eef2f7', borderRadius: 1, display: 'inline-block' }} />
                                </div>
                                <div className={styles.mockBody}>
                                  <div className={styles.mockCard} style={{ background: '#171c24', border: '1px solid #252c37' }}>
                                    <div>
                                      <div className={styles.mockLineTitle} style={{ background: '#eef2f7' }} />
                                      <div className={styles.mockLineBody} style={{ background: '#94a1b2' }} />
                                    </div>
                                    <span className={styles.mockCta} style={{ background: currentTemplateConfig.accent || '#f0b429' }} />
                                  </div>
                                </div>
                              </div>
                              <div className={styles.schemeMeta}>
                                <span className={styles.schemeTitle}>Theme default</span>
                                <span className={styles.schemeMood}>Template built-in</span>
                              </div>
                            </button>

                            {shownSchemes.map((scheme: any) => {
                              const selected = siteContent.colorScheme === scheme.key;
                              const isLegacyScheme = scheme.status === 'legacy';
                              return (
                                <button
                                  key={scheme.key}
                                  type="button"
                                  className={`${styles.schemeSwatch}${selected ? ` ${styles.schemeSwatchActive}` : ''}`}
                                  onClick={() => updateSiteContent({ colorScheme: scheme.key })}
                                  title={scheme.label}
                                  aria-label={`${scheme.label}${isLegacyScheme ? ' (Legacy palette)' : ''}${selected ? ' (selected)' : ''}`}
                                  aria-pressed={selected}
                                >
                                  {isLegacyScheme && <span className={styles.legacyBadge}>Legacy</span>}
                                  <div className={styles.schemeMockup} style={{ background: scheme.bg }}>
                                    <div className={styles.mockHeader} style={{ background: scheme.deep }}>
                                      <span style={{ width: 12, height: 2, background: scheme.onDeep, borderRadius: 1, display: 'inline-block' }} />
                                    </div>
                                    <div className={styles.mockBody}>
                                      <div className={styles.mockCard} style={{ background: scheme.surface, border: `1px solid ${scheme.line}` }}>
                                        <div>
                                          <div className={styles.mockLineTitle} style={{ background: scheme.surfaceInk || scheme.ink }} />
                                          <div className={styles.mockLineBody} style={{ background: scheme.surfaceMuted || scheme.muted }} />
                                        </div>
                                        <span className={styles.mockCta} style={{ background: scheme.accent }} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className={styles.schemeMeta}>
                                    <span className={styles.schemeTitle}>{scheme.label.split(' — ')[0]}</span>
                                    <span className={styles.schemeMood}>{scheme.mood || (scheme.tone === 'dark' ? 'Dark' : 'Light')}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {isLegacy && (
                            <div className={styles.legacyCallout}>
                              <div>
                                <strong>Legacy palette in use:</strong> Site is using <em>{getColorScheme(currentKey)?.label.split(' — ')[0]}</em>. We recommend upgrading to <strong>{currentKey === 'slate' ? 'Harbor' : 'Evergreen'}</strong> for enhanced contrast.
                              </div>
                              <button
                                type="button"
                                className={styles.legacySwitchBtn}
                                onClick={() => updateSiteContent({ colorScheme: currentKey === 'slate' ? 'harbor' : 'evergreen' })}
                              >
                                Switch to {currentKey === 'slate' ? 'Harbor' : 'Evergreen'}
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {(() => {
                    const currentTemplateConfig = AVAILABLE_TEMPLATES.find((t) => t.id === site.template) || AVAILABLE_TEMPLATES[0];
                    const activeScheme = getColorScheme(siteContent.colorScheme);
                    const schemeDefaultAccent = activeScheme?.accent || currentTemplateConfig?.accent || '#f0b429';
                    const hasCustomAccent = Boolean(site.accent_override && site.accent_override.trim() && site.accent_override.toLowerCase() !== schemeDefaultAccent.toLowerCase());
                    const effectiveAccent = site.accent_override || schemeDefaultAccent;
                    const baseName = activeScheme ? activeScheme.label.split(' — ')[0] : `${currentTemplateConfig.name} default`;

                    return (
                      <div className={styles.formField}>
                        <div className={styles.accentHeaderRow}>
                          <div className={styles.accentStatusRow}>
                            <span>Accent color</span>
                            <span className={styles.accentStatusBadge} data-custom={hasCustomAccent}>
                              <span className={styles.accentDot} style={{ background: effectiveAccent }} />
                              {hasCustomAccent ? `${baseName} base · Custom accent` : 'Matching scheme'}
                            </span>
                          </div>
                          {hasCustomAccent && (
                            <button
                              type="button"
                              className={styles.accentResetBtn}
                              onClick={() => handleChange('accent_override', null)}
                              title="Reset accent color to match the selected color scheme"
                            >
                              Use scheme default
                            </button>
                          )}
                        </div>
                        <div className={styles.colorControl}>
                          <input
                            type="color"
                            value={effectiveAccent}
                            onChange={(event) => handleChange('accent_override', event.target.value)}
                            aria-label="Custom accent color picker"
                          />
                          <input
                            value={site.accent_override || ''}
                            placeholder={`Scheme default: ${schemeDefaultAccent}`}
                            onChange={(event) => handleChange('accent_override', event.target.value || null)}
                            aria-label="Custom accent hex value"
                          />
                        </div>
                        <div className={styles.accentSwatches} role="group" aria-label="Preset accent colors">
                          {ACCENT_PRESETS.map((preset: any) => {
                            const selected = (site.accent_override || '').toLowerCase() === preset.hex.toLowerCase();
                            return (
                              <button
                                key={preset.hex}
                                type="button"
                                className={`${styles.accentSwatch}${selected ? ` ${styles.accentSwatchActive}` : ''}`}
                                style={{ background: preset.hex }}
                                onClick={() => handleChange('accent_override', preset.hex)}
                                title={preset.name}
                                aria-label={`${preset.name}${selected ? ' (selected)' : ''}`}
                                aria-pressed={selected}
                              />
                            );
                          })}
                        </div>
                        <small className={styles.fieldHint}>
                          {hasCustomAccent
                            ? `Custom accent is active and colors buttons, badges, and highlights independently of the ${baseName} color scheme.`
                            : `Using ${activeScheme ? `${activeScheme.label.split(' — ')[0]} scheme` : `${currentTemplateConfig.name} theme`} default accent (${schemeDefaultAccent}). Tap any swatch or color picker to set an independent custom override.`}
                        </small>
                      </div>
                    );
                  })()}

                </SectionCard>

                <SectionCard title="Logo &amp; brand icon" description="Your business logo or trade icon — shown in the header, footer, and browser tab." open={openSection === 'logo'} onToggleOpen={() => toggleSection('logo')}>
                  <div className={styles.imageSlot}>
                    {site.logo_url
                      ? <div className={styles.logoPreviews}><div className={styles.logoPreview}><img src={site.logo_url} alt="Logo on a light header" data-logo-style={siteContent.logoStyle} /><em>Light</em></div><div className={styles.logoPreviewDark}><img src={site.logo_url} alt="Logo on a dark header" data-logo-style={siteContent.logoStyle} /><em>Dark</em></div></div>
                      : (() => {
                          const glyphOptions = getTradeGlyphOptions(siteContent.trade);
                          const glyph = glyphForContent(siteContent);
                          const accent = site.accent_override || '#ff7a21';
                          const query = iconSearch.trim().toLowerCase();
                          const shownGlyphs = query
                            ? SERVICE_ICON_KEYS.filter((key) => key.toLowerCase().includes(query) || (TRADE_GLYPH_NOUNS[key] ?? '').toLowerCase().includes(query))
                            : glyphOptions;
                          return (
                            <div className={styles.autoLogoWrap}>
                              <div className={styles.autoLogo}>
                                <span className={styles.autoLogoChip} data-logo-style={siteContent.logoStyle} style={{ color: accent }}>
                                  <ServiceIcon name={glyph} className={styles.autoLogoGlyph} />
                                </span>
                                <div className={styles.autoLogoMeta}>
                                  <strong>Auto icon for your trade</strong>
                                  <small>Pick the mark that fits best — it’s your header, footer, and browser-tab icon until you add your own logo.</small>
                                </div>
                              </div>
                              <input
                                type="search"
                                className={styles.glyphSearch}
                                value={iconSearch}
                                onChange={(event) => setIconSearch(event.target.value)}
                                placeholder="Search all icons — e.g. wrench, leaf, truck, drill"
                                aria-label="Search brand icons"
                              />
                              {shownGlyphs.length > 0 ? (
                                <div className={styles.glyphPicker} role="group" aria-label="Choose your brand icon">
                                  {shownGlyphs.map((key) => (
                                    <button
                                      type="button"
                                      key={key}
                                      className={`${styles.glyphPickerBtn}${glyph === key ? ` ${styles.glyphPickerBtnOn}` : ''}`}
                                      style={{ color: accent }}
                                      aria-pressed={glyph === key}
                                      aria-label={`Use the ${TRADE_GLYPH_NOUNS[key] ?? key} icon`}
                                      onClick={() => updateSiteContent({ brandGlyph: key })}
                                    >
                                      <ServiceIcon name={key} className={styles.glyphPickerGlyph} />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className={styles.glyphSearchEmpty}>No icons match “{iconSearch.trim()}”. Try another word.</p>
                              )}
                              <label className={styles.autoLogoTransparent}>
                                <input
                                  type="checkbox"
                                  checked={siteContent.logoStyle === 'transparent'}
                                  onChange={(event) => updateSiteContent({ logoStyle: event.target.checked ? 'transparent' : 'rounded' })}
                                />
                                <span><strong>Transparent background</strong><small>Show just the icon on your site — drop the tile behind it.</small></span>
                              </label>
                            </div>
                          );
                        })()}
                    <hr className={styles.logoDivider} />
                    <div className={styles.imageSlotActions} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className={`${styles.secondaryAction} btn primary`} onClick={() => setShowLogoStudio(true)} style={{ background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700 }}>
                        ✨ AI Logo Studio
                      </button>
                      {pendingAiLogo?.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setShowLogoStudio(true)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.45rem 0.8rem',
                            borderRadius: '8px',
                            background: '#f3e8ff',
                            border: '1.5px solid #a855f7',
                            color: '#6d28d9',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'inline-block', animation: 'aiBuilderSpin 3s linear infinite' }}>✦</span>
                          <span>AI Art Director is building your logo…</span>
                        </button>
                      )}
                      <AiCreditIndicator credits={availableAiCredits} />
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('your logo', 'logo')}>{site.logo_url ? 'Replace photo' : 'Upload custom file'}</button>
                      {site.logo_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('logo_url', null)}>Remove</button>}
                    </div>
                    <div className={styles.formColumns}>
                      <label className={styles.formField}><span>Logo style</span><select value={siteContent.logoStyle} onChange={(event) => updateSiteContent({ logoStyle: event.target.value })}><option value="plain">Plain (no frame)</option><option value="transparent">Transparent (no background)</option><option value="rounded">Rounded corners</option><option value="squircle">Squircle</option><option value="circle">Circle</option><option value="framed">Framed chip (padding + border)</option></select></label>
                      <label className={styles.formField}><span>Logo size</span><select value={siteContent.logoSize} onChange={(event) => updateSiteContent({ logoSize: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
                    </div>
                    <label className={styles.toggleRow} style={{ marginTop: '.65rem', marginBottom: '.35rem' }}>
                      <input
                        type="checkbox"
                        checked={!siteContent.hideHeaderCompanyName}
                        onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                      />
                      <span>
                        <strong>Show text company name in header</strong>
                        <small>Turn off if your logo already includes your company name, so it doesn&apos;t appear twice.</small>
                      </span>
                    </label>
                    <label className={styles.formField} style={{ marginTop: '.65rem' }}>
                      <span>Header tagline / slogan</span>
                      <input
                        id="bf-header-tagline"
                        type="text"
                        value={siteContent.headerTagline}
                        maxLength={100}
                        placeholder="e.g. 24/7 Emergency Service • Licensed & Insured"
                        onChange={(event) => updateSiteContent({ headerTagline: event.target.value })}
                      />
                      <small className={styles.fieldHint}>Displayed in the website header next to your logo. Perfect for a catchy trade slogan or trust badge.</small>
                    </label>
                    <small className={styles.fieldHint}>Best as a <strong>PNG or SVG with a transparent background</strong> — wide and simple. Aim for ~400×120px; it&apos;s shown up to 70px tall.</small>
                  </div>
                </SectionCard>

                <SectionCard title="Typography &amp; buttons" description="Select typography and button styles that define your brand across the entire site." open={openSection === 'typography'} onToggleOpen={() => toggleSection('typography')}>
                  <label className={styles.formField}><span>Heading font</span><select value={site.header_font || ''} onChange={(event) => handleChange('header_font', event.target.value || null)}>
                    <option value="">Theme default</option>
                    {HEADING_FONT_OPTIONS.map((font: any) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
                  </select></label>

                  <label className={styles.formField} id="bf-brand-font"><span>Company name font</span>
                    <select value={siteContent.brandFont} onChange={(event) => updateSiteContent({ brandFont: event.target.value })} style={{ fontFamily: siteContent.brandFont && siteContent.brandFont !== 'var(--theme-display)' ? siteContent.brandFont : undefined }}>
                      <option value="">Theme default</option>
                      <option value="var(--theme-display)">Match heading font</option>
                      {HEADING_FONT_OPTIONS.map((font: any) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
                    </select>
                  </label>

                  <label className={styles.toggleRow} style={{ marginTop: '.65rem', marginBottom: '.75rem' }}>
                    <input
                      type="checkbox"
                      checked={!siteContent.hideHeaderCompanyName}
                      onChange={(event) => updateSiteContent({ hideHeaderCompanyName: !event.target.checked })}
                    />
                    <span>
                      <strong>Show company name in header</strong>
                      <small>Display your text business name next to your logo in the header. Turn off if your logo already includes your name.</small>
                    </span>
                  </label>

                  <div className={styles.formField} id="bf-name-style">
                    <span>Company name style</span>
                    {(() => {
                      const nm = site.company_name.trim() || 'Your Company';
                      const parts = nm.split(/\s+/);
                      const renderName = () => parts.length <= 1
                        ? <span className={`${styles.wmPreviewFirst} ${styles.wmPreviewLast}`}>{nm}</span>
                        : parts.map((word: any, i: any) => <span key={i}>{i > 0 ? ' ' : ''}<span className={i === 0 ? styles.wmPreviewFirst : i === parts.length - 1 ? styles.wmPreviewLast : styles.wmPreviewMid}>{word}</span></span>);
                      const previewFont = siteContent.brandFont && siteContent.brandFont !== 'var(--theme-display)' ? siteContent.brandFont : undefined;
                      const options = [{ key: '', label: 'Standard' }, ...WORDMARK_STYLES];
                      return (
                        <div className={styles.namePicker} role="radiogroup" aria-label="Company name style" style={{ '--wm-accent': site.accent_override || '#ff7a21', fontFamily: previewFont, opacity: siteContent.hideHeaderCompanyName ? 0.65 : 1 } as CSSProperties}>
                          {options.map((style) => {
                            const selected = (siteContent.wordmarkStyle || '') === style.key;
                            return (
                              <button type="button" key={style.key || 'standard'} role="radio" aria-checked={selected} className={`${styles.namePickerTile}${selected ? ` ${styles.namePickerTileOn}` : ''}`} onClick={() => updateSiteContent({ wordmarkStyle: style.key })}>
                                <span className={styles.namePickerMark} data-wm={style.key || 'plain'}>{renderName()}</span>
                                <small>{style.label}</small>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  <small className={styles.fieldHint}>
                    {siteContent.hideHeaderCompanyName
                      ? 'Text company name is currently hidden in the header. Turn it back on above if you want your name displayed next to your logo.'
                      : 'Your business name in the header — shown exactly as you type. Tap a style to layer a treatment on top; the accent color follows your theme.'}
                  </small>

                  <hr className={styles.logoDivider} />
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Page buttons</span><select value={site.button_style === 'ghost' ? 'solid' : (site.button_style || 'solid')} onChange={(event) => handleChange('button_style', event.target.value)}>{BUTTON_STYLES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select><small className={styles.fieldHint}>Hero, contact &amp; footer call-to-action buttons.</small></label>
                    <label className={styles.formField}><span>Header button</span><select value={siteContent.headerButtonStyle} onChange={(event) => updateSiteContent({ headerButtonStyle: event.target.value })}><option value="">Match page buttons</option>{HEADER_BUTTON_STYLES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select><small className={styles.fieldHint}>The &ldquo;Instant Estimate&rdquo; button in your header.</small></label>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Instant quote form appearance"
                  description="Choose the visual framing and style for your instant estimate card."
                  open={openSection === 'quoteFormStyle'}
                  onToggleOpen={() => toggleSection('quoteFormStyle')}
                >
                  <div className={styles.contentSubhead}><strong>Framing style</strong><small>Card border, glow, and backdrop treatment.</small></div>
                  <div className={styles.formStylePicker} role="radiogroup" aria-label="Instant quote form appearance">
                    {QUOTE_FORM_STYLES.map((st) => {
                      const selected = (siteContent.quoteFormStyle || 'clean') === st.key;
                      return (
                        <button
                          type="button"
                          key={st.key}
                          role="radio"
                          aria-checked={selected}
                          className={`${styles.formStyleTile}${selected ? ` ${styles.formStyleTileOn}` : ''}`}
                          onClick={() => updateSiteContent({ quoteFormStyle: st.key })}
                        >
                          <div className={styles.formStyleMiniCard} data-preview-style={st.key}>
                            <div className={styles.formStyleMiniBar} />
                            <div className={styles.formStyleMiniLine} />
                            <div className={styles.formStyleMiniInput} />
                            <div className={styles.formStyleMiniBtn} />
                          </div>
                          <div className={styles.formStyleInfo}>
                            <strong>
                              {st.label}
                              {st.badge && <span className={styles.formStyleBadge}>{st.badge}</span>}
                            </strong>
                            <small>{st.desc}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Field background</strong><small>Light, dark, or theme default input fields.</small></div>
                  <div className={styles.segmented} role="radiogroup" aria-label="Field background" style={{ width: '100%', display: 'flex' }}>
                    {QUOTE_FORM_FIELD_BGS.map((bg) => {
                      const selected = (siteContent.quoteFormFieldBg || 'auto') === bg.key;
                      return (
                        <button
                          type="button"
                          key={bg.key}
                          role="radio"
                          aria-checked={selected}
                          style={{ flex: 1, textAlign: 'center', fontSize: '.8rem', fontWeight: 600 }}
                          className={selected ? styles.activeSegment : ''}
                          onClick={() => updateSiteContent({ quoteFormFieldBg: bg.key })}
                        >
                          {bg.key === 'light' ? '⚪ Light / White' : bg.key === 'dark' ? '⚫ Dark / Subtle' : '🪄 Theme default'}
                        </button>
                      );
                    })}
                  </div>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Fine-tune layout &amp; styling</strong><small>Corner curves, card width, and progress indicators.</small></div>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}>
                      <span>Card corners</span>
                      <select
                        value={siteContent.quoteFormRadius || 'default'}
                        onChange={(event) => updateSiteContent({ quoteFormRadius: event.target.value as QuoteFormRadius })}
                      >
                        {QUOTE_FORM_RADII.map((r) => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>Card width</span>
                      <select
                        value={siteContent.quoteFormWidth || 'standard'}
                        onChange={(event) => updateSiteContent({ quoteFormWidth: event.target.value as QuoteFormWidth })}
                      >
                        {QUOTE_FORM_WIDTHS.map((w) => (
                          <option key={w.key} value={w.key}>{w.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.formColumns} style={{ marginTop: '.4rem' }}>
                    <label className={styles.formField}>
                      <span>Progress indicator</span>
                      <select
                        value={siteContent.quoteFormStepper || 'badges'}
                        onChange={(event) => updateSiteContent({ quoteFormStepper: event.target.value as QuoteFormStepper })}
                      >
                        {QUOTE_FORM_STEPPERS.map((st) => (
                          <option key={st.key} value={st.key}>{st.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>Eyebrow badge</span>
                      <select
                        value={siteContent.quoteFormBadge || 'sparkle'}
                        onChange={(event) => updateSiteContent({ quoteFormBadge: event.target.value as QuoteFormBadge })}
                      >
                        {QUOTE_FORM_BADGES.map((b) => (
                          <option key={b.key} value={b.key}>
                            {b.icon ? `${b.icon} ` : ''}{b.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {siteContent.quoteFormBadge === 'custom' && (
                    <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                      <span>Custom badge text</span>
                      <input
                        type="text"
                        maxLength={50}
                        value={siteContent.quoteFormBadgeText || ''}
                        onChange={(event) => updateSiteContent({ quoteFormBadgeText: event.target.value })}
                        placeholder="e.g. ⚡ Fast Estimate in 60s"
                      />
                    </label>
                  )}

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Wording &amp; Call-to-Action</strong><small>Customize the form headings and button text.</small></div>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}>
                      <span>Form heading</span>
                      <input
                        type="text"
                        maxLength={40}
                        value={siteContent.quoteForm.formHeading || ''}
                        onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, formHeading: event.target.value })}
                        placeholder="Get a ballpark estimate"
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Submit button label</span>
                      <input
                        type="text"
                        maxLength={40}
                        value={siteContent.quoteFormButtonText || ''}
                        onChange={(event) => updateSiteContent({ quoteFormButtonText: event.target.value })}
                        placeholder="Start my estimate"
                      />
                    </label>
                  </div>
                  <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                    <span>Subtitle / Explainer note</span>
                    <input
                      type="text"
                      maxLength={200}
                      value={siteContent.quoteFormSubtitle || ''}
                      onChange={(event) => updateSiteContent({ quoteFormSubtitle: event.target.value })}
                      placeholder="Tell us what you need. We’ll ask up to 3 quick questions..."
                    />
                  </label>
                  <label className={styles.formField} style={{ marginTop: '.4rem' }}>
                    <span>Project description placeholder</span>
                    <input
                      type="text"
                      maxLength={200}
                      value={siteContent.quoteFormPlaceholder || ''}
                      onChange={(event) => updateSiteContent({ quoteFormPlaceholder: event.target.value })}
                      placeholder={
                        siteContent.services.items.map((item: any) => item.title.trim()).filter(Boolean).length >= 2
                          ? `e.g. ${siteContent.services.items.map((item: any) => item.title.trim().toLowerCase()).filter(Boolean).slice(0, 3).join(', ')}...`
                          : siteContent.trade.trim()
                            ? `Describe your ${siteContent.trade.trim().toLowerCase()} job — what's going on?`
                            : 'e.g. drain cleaning, leak detection, pipe replacement...'
                      }
                    />
                    <small className={styles.fieldHint}>Replaces the default placeholder inside the project description textarea. Leave blank to automatically use your services list.</small>
                  </label>

                  <hr className={styles.logoDivider} />
                  <div className={styles.contentSubhead}><strong>Features &amp; Trust</strong><small>Reassurance cues and photo attachments.</small></div>
                  <div className={styles.toggleGroup}>
                    <label className={styles.toggleRow}>
                      <input
                        type="checkbox"
                        checked={siteContent.quoteFormTrust !== false}
                        onChange={(event) => updateSiteContent({ quoteFormTrust: event.target.checked })}
                      />
                      <span>
                        <strong>Show trust reassurance strip</strong>
                        <small>Displays confidence cues directly under the submit button.</small>
                      </span>
                    </label>

                    {siteContent.quoteFormTrust !== false && (
                      <div className={styles.trustCuesList}>
                        {QUOTE_FORM_TRUST_CUES.map((cue) => {
                          const currentItems = siteContent.quoteFormTrustItems ?? [...DEFAULT_QUOTE_FORM_TRUST_ITEMS];
                          const isChecked = currentItems.includes(cue.key);
                          return (
                            <label key={cue.key} className={styles.trustCueItem}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...currentItems, cue.key]
                                    : currentItems.filter((k: any) => k !== cue.key);
                                  updateSiteContent({ quoteFormTrustItems: next });
                                }}
                              />
                              <span>{cue.icon} {cue.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <label className={styles.toggleRow} style={{ marginTop: '.5rem' }}>
                      <input
                        type="checkbox"
                        checked={siteContent.quoteFormStep1Photos === true}
                        onChange={(event) => updateSiteContent({ quoteFormStep1Photos: event.target.checked })}
                      />
                      <span>
                        <strong>Let customers attach photos upfront</strong>
                        <small>Adds a photo upload button to the first screen so customers can show their problem immediately.</small>
                      </span>
                    </label>
                  </div>

                  <small className={styles.fieldHint} style={{ marginTop: '.75rem' }}>Full real-time preview of your instant estimate card and all adjustments is shown live on the right.</small>
                </SectionCard>

              </div>
            )
  );
}
