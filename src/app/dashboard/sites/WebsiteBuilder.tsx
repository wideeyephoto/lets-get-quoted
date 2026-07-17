'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { Site, TemplateType } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { checkSubdomainAvailableAction, publishSiteAction, updateSiteAction, verifyCustomDomainAction } from './actions';
import ImageLibrary from './ImageLibrary';
import LivePreview from './LivePreview';
import ThemeIcon from './ThemeIcon';
import styles from './SiteEditor.module.css';

type BuilderTab = 'business' | 'images' | 'design' | 'publish';

type WebsiteBuilderProps = {
  site: Site;
  uploadedImages: SiteImage[];
};

const TABS: { id: BuilderTab; label: string }[] = [
  { id: 'business', label: 'Business info' },
  { id: 'images', label: 'Images' },
  { id: 'design', label: 'Colors & style' },
  { id: 'publish', label: 'Publish' },
];

function siteUpdates(site: Site) {
  return {
    template: site.template,
    header_font: site.header_font,
    button_style: site.button_style,
    accent_override: site.accent_override,
    company_name: site.company_name,
    headline: site.headline,
    tagline: site.tagline,
    phone: site.phone,
    license: site.license,
    hours: site.hours,
    service_area: site.service_area,
    logo_url: site.logo_url,
    hero_url: site.hero_url,
    subdomain: site.subdomain,
    custom_domain: site.custom_domain,
    portal_mode: site.portal_mode,
    content: site.content,
    seo_title: site.seo_title,
    seo_description: site.seo_description,
  };
}

export default function WebsiteBuilder({ site: initialSite, uploadedImages }: WebsiteBuilderProps) {
  const [site, setSite] = useState(initialSite);
  const [activeTab, setActiveTab] = useState<BuilderTab>('business');
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [domainStatus, setDomainStatus] = useState<'idle' | 'checking' | 'verified' | 'unverified'>(site.custom_domain_verified_at ? 'verified' : 'idle');
  const [isPending, startTransition] = useTransition();
  const galleryImages = getSiteGallery(site.content);

  const handleChange = useCallback((field: keyof Site, value: Site[keyof Site]) => {
    setSite((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
    setMessage(null);
    if (field === 'subdomain') setSubdomainStatus('idle');
    if (field === 'custom_domain') setDomainStatus('idle');
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    function confirmLinkNavigation(event: MouseEvent) {
      if (!isDirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const link = target?.closest('a');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.href === window.location.href || nextUrl.hash && nextUrl.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved website changes. Leave without saving?')) event.preventDefault();
    }
    document.addEventListener('click', confirmLinkNavigation, true);
    return () => document.removeEventListener('click', confirmLinkNavigation, true);
  }, [isDirty]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      try {
        const updated = await updateSiteAction(siteUpdates(site));
        setSite(updated);
        setIsDirty(false);
        setMessage({ type: 'success', text: 'Website changes saved.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save changes.' });
      }
    });
  }, [site]);

  const selectHeroImage = useCallback((image: SiteImage) => {
    handleChange('hero_url', image.url);
  }, [handleChange]);

  const toggleGalleryImage = useCallback((image: SiteImage) => {
    const gallery = getSiteGallery(site.content);
    const selected = gallery.some((item) => item.id === image.id);

    if (!selected && gallery.length >= 5) {
      setMessage({ type: 'error', text: 'Choose up to five gallery images.' });
      return;
    }

    const nextGallery = selected
      ? gallery.filter((item) => item.id !== image.id)
      : [...gallery, image];
    handleChange('content', { ...site.content, gallery: nextGallery });
  }, [handleChange, site.content]);

  const checkSubdomain = useCallback(() => {
    const subdomain = site.subdomain?.trim().toLowerCase();
    if (!subdomain || !/^[a-z0-9-]{3,32}$/.test(subdomain)) {
      setMessage({ type: 'error', text: 'Use 3-32 lowercase letters, numbers, or hyphens.' });
      return;
    }

    startTransition(async () => {
      try {
        const available = await checkSubdomainAvailableAction(subdomain);
        setSubdomainStatus(available ? 'available' : 'taken');
        setMessage(available
          ? { type: 'success', text: `${subdomain}.letsgetquoted.com is available.` }
          : { type: 'error', text: 'That subdomain is already in use.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to check this subdomain.' });
      }
    });
  }, [site.subdomain]);

  const handlePublish = useCallback(() => {
    const nextPublished = !site.published;
    if (nextPublished && !site.subdomain && (!site.custom_domain || domainStatus !== 'verified')) {
      setMessage({ type: 'error', text: 'Add an LGQ subdomain or verify your custom domain before publishing.' });
      return;
    }

    startTransition(async () => {
      try {
        const saved = await updateSiteAction(siteUpdates(site));
        await publishSiteAction(nextPublished);
        setSite({ ...saved, published: nextPublished });
        setIsDirty(false);
        setMessage({ type: 'success', text: nextPublished ? 'Your website is live.' : 'Your website is now private.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update publishing.' });
      }
    });
  }, [domainStatus, site]);

  const verifyCustomDomain = useCallback(() => {
    if (!site.custom_domain) {
      setMessage({ type: 'error', text: 'Enter a custom domain first.' });
      return;
    }
    setDomainStatus('checking');
    startTransition(async () => {
      try {
        const saved = await updateSiteAction(siteUpdates(site));
        const result = await verifyCustomDomainAction(site.custom_domain!);
        setSite(saved);
        if (result.verified) {
          setDomainStatus('verified');
          setIsDirty(false);
          setMessage({ type: 'success', text: 'Custom domain verified and connected.' });
        } else {
          setDomainStatus('unverified');
          setMessage({ type: 'error', text: result.records.length ? `DNS currently points to ${result.records.join(', ')}.` : 'No matching DNS record found yet. DNS changes can take up to 48 hours.' });
        }
      } catch (error) {
        setDomainStatus('unverified');
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to verify this domain.' });
      }
    });
  }, [site]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const liveDomain =
    site.custom_domain && domainStatus === 'verified'
      ? site.custom_domain
      : site.subdomain
        ? `${site.subdomain}.${rootDomain}`
        : null;
  const liveUrl =
    site.custom_domain && domainStatus === 'verified'
      ? `https://${site.custom_domain}`
      : site.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null;

  return (
    <main className={styles.builderShell}>
      <header className={styles.builderHeader}>
        <div>
          <p className={styles.builderEyebrow}>Website builder</p>
          <h1>{site.company_name || 'Your contractor website'}</h1>
          <span className={styles.saveStatus}>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
          {site.published && liveUrl && liveDomain ? (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={styles.liveStatusLink}>
              <span className={styles.liveStatusDot} aria-hidden="true" />
              Website LIVE @ {liveDomain}
            </a>
          ) : null}
        </div>
        <div className={styles.builderActions}>
          <a href="/dashboard/sites/preview" target="_blank" rel="noopener noreferrer" className="btn secondary">Open full preview</a>
          <button type="button" className="btn primary" onClick={handleSave} disabled={isPending || !isDirty}>{isPending ? 'Saving...' : 'Save changes'}</button>
        </div>
      </header>

      {message && <div className={`${styles.notice} ${message.type === 'error' ? styles.errorNotice : styles.successNotice}`} role="status">{message.text}</div>}

      <div className={styles.builderGrid}>
        <section className={styles.editorPanel}>
          <div className={styles.builderTabs} role="tablist" aria-label="Website settings">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? styles.activeBuilderTab : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent} role="tabpanel">
            {activeTab === 'business' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Business information</h2><p>This content appears throughout your website.</p></div>
                <label className={styles.formField}><span>Company name</span><input value={site.company_name} onChange={(event) => handleChange('company_name', event.target.value)} /></label>
                <label className={styles.formField}><span>Headline</span><textarea rows={2} value={site.headline || ''} onChange={(event) => handleChange('headline', event.target.value || null)} placeholder="Built with purpose. Finished with care." /></label>
                <label className={styles.formField}><span>Tagline</span><textarea rows={3} value={site.tagline || ''} onChange={(event) => handleChange('tagline', event.target.value || null)} placeholder="Tell homeowners what makes your business different." /></label>
                <div className={styles.formColumns}>
                  <label className={styles.formField}><span>Phone</span><input type="tel" value={site.phone || ''} onChange={(event) => handleChange('phone', event.target.value || null)} placeholder="(555) 123-4567" /></label>
                  <label className={styles.formField}><span>License</span><input value={site.license || ''} onChange={(event) => handleChange('license', event.target.value || null)} placeholder="LIC #123456" /></label>
                </div>
                <label className={styles.formField}><span>Service area</span><input value={site.service_area || ''} onChange={(event) => handleChange('service_area', event.target.value || null)} placeholder="City and surrounding communities" /></label>
                <label className={styles.formField}><span>Business hours</span><input value={site.hours || ''} onChange={(event) => handleChange('hours', event.target.value || null)} placeholder="Monday-Friday, 7am-5pm" /></label>
              </div>
            )}

            {activeTab === 'images' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Images</h2><p>Choose a hero image and up to five gallery images.</p></div>
                <label className={styles.formField}><span>Logo URL</span><input type="url" value={site.logo_url || ''} onChange={(event) => handleChange('logo_url', event.target.value || null)} placeholder="https://..." /></label>
                {site.logo_url && <div className={styles.logoPreview}><img src={site.logo_url} alt="Current logo" /></div>}
                <label className={styles.formField}><span>Hero image URL</span><input type="url" value={site.hero_url || ''} onChange={(event) => handleChange('hero_url', event.target.value || null)} placeholder="Choose below or paste a URL" /></label>
                <ImageLibrary stockImages={STOCK_SITE_IMAGES} initialUploads={uploadedImages} galleryImages={galleryImages} heroUrl={site.hero_url} onSelectHero={selectHeroImage} onToggleGallery={toggleGalleryImage} />
              </div>
            )}

            {activeTab === 'design' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Colors & style</h2><p>Set the visual direction of your website.</p></div>
                <div className={styles.themeGrid}>
                  {AVAILABLE_TEMPLATES.map((template) => (
                    <button type="button" key={template.id} className={`${styles.themeOption}${site.template === template.id ? ` ${styles.selectedTheme}` : ''}`} onClick={() => handleChange('template', template.id as TemplateType)} aria-pressed={site.template === template.id}>
                      <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} />
                      <span className={styles.themeOptionInfo}><strong>{template.name}</strong><small>{template.description}</small></span>
                    </button>
                  ))}
                </div>
                <div className={styles.formColumns}>
                  <label className={styles.formField}><span>Accent color</span><div className={styles.colorControl}><input type="color" value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /><input value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /></div></label>
                  <label className={styles.formField}><span>Color mode</span><select value={site.portal_mode} onChange={(event) => handleChange('portal_mode', event.target.value as Site['portal_mode'])}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                </div>
                <label className={styles.formField}><span>Heading font</span><select value={site.header_font || ''} onChange={(event) => handleChange('header_font', event.target.value || null)}><option value="">Theme default</option><option value="Georgia, Times New Roman, serif">Classic serif</option><option value="Arial Black, Helvetica, sans-serif">Bold sans</option><option value="Trebuchet MS, sans-serif">Humanist sans</option></select></label>
                <label className={styles.formField}><span>Button style</span><select value={site.button_style || 'solid'} onChange={(event) => handleChange('button_style', event.target.value)}><option value="solid">Solid</option><option value="outline">Outline</option><option value="ghost">Minimal</option></select></label>
              </div>
            )}

            {activeTab === 'publish' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Publish</h2><p>Choose where homeowners can find your website.</p></div>
                <label className={styles.formField}><span>LGQ subdomain</span><div className={styles.domainControl}><input value={site.subdomain || ''} onChange={(event) => handleChange('subdomain', event.target.value.toLowerCase() || null)} placeholder="northline-builders" /><button type="button" onClick={checkSubdomain} disabled={isPending}>Check</button></div><small>{site.subdomain || 'your-business'}.letsgetquoted.com{subdomainStatus === 'available' ? ' - available' : subdomainStatus === 'taken' ? ' - unavailable' : ''}</small></label>
                <label className={styles.formField}><span>Custom domain</span><div className={styles.domainControl}><input value={site.custom_domain || ''} onChange={(event) => handleChange('custom_domain', event.target.value || null)} placeholder="www.yourbusiness.com" /><button type="button" onClick={verifyCustomDomain} disabled={isPending}>{domainStatus === 'checking' ? 'Checking...' : 'Verify DNS'}</button></div><small>{domainStatus === 'verified' ? 'Verified and connected.' : 'Add a CNAME record pointing to domains.letsgetquoted.com.'}</small></label>
                <div className={styles.dnsCard}><strong>DNS setup</strong><p>For a subdomain such as www, create a CNAME record:</p><code>www &nbsp; CNAME &nbsp; domains.letsgetquoted.com</code><p>For a root domain, use your DNS provider&apos;s CNAME flattening or redirect the root to www.</p></div>
                <div className={styles.sectionIntro}><h2>Search & sharing</h2><p>Control how your website appears in search results and social links.</p></div>
                <label className={styles.formField}><span>SEO title</span><input maxLength={60} value={site.seo_title || ''} onChange={(event) => handleChange('seo_title', event.target.value || null)} placeholder={site.company_name} /><small>{(site.seo_title || '').length}/60 characters</small></label>
                <label className={styles.formField}><span>SEO description</span><textarea rows={3} maxLength={160} value={site.seo_description || ''} onChange={(event) => handleChange('seo_description', event.target.value || null)} placeholder={site.tagline || 'Describe your services and location.'} /><small>{(site.seo_description || '').length}/160 characters. Your hero image is used for social sharing.</small></label>
                <div className={styles.publishCard}>
                  <div><span className={`${styles.statusDot} ${site.published ? styles.liveDot : ''}`} /><div><strong>{site.published ? 'Website is live' : 'Website is private'}</strong><p>{site.published ? 'Homeowners can visit your website.' : 'Only you can see the saved preview.'}</p></div></div>
                  <button type="button" onClick={handlePublish} disabled={isPending}>{site.published ? 'Unpublish' : 'Save & publish'}</button>
                </div>
                {site.published && liveUrl && <a className={styles.publicLink} href={liveUrl} target="_blank" rel="noopener noreferrer">Open live website ↗</a>}
              </div>
            )}
          </div>
        </section>

        <LivePreview site={site} />
      </div>
    </main>
  );
}