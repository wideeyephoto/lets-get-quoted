'use client';

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import type { Site, TemplateType } from '@/lib/sites';
import type { SiteImage } from '@/lib/site-images';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getSiteContent, mergeSiteContent, HERO_BADGE_PRESETS, HERO_BADGE_STYLES, IMAGE_SLOT_LABELS, MAX_EXTRA_HERO_IMAGES, REORDERABLE_SECTIONS, slugifyBlogTitle, type NormalizedSiteContent, type SiteBlogContent, type SiteAnnouncementContent, type SiteBeforeAfterContent, type SiteServicesContent, type SiteHowItWorksContent, type SiteCertificationsContent, type SiteEstimateRangesContent, type SiteFaqContent, type SiteFinancingContent, type SiteQuoteFormContent, type SiteRatingBadgeContent, type SiteServiceAreasContent, type SiteShowcaseContent, type SiteStatsContent, type SiteStickyCallBarContent, type SiteTestimonialsContent, type SiteTrustBadgesContent } from '@/lib/site-content';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import ServiceIcon, { SERVICE_ICON_KEYS } from '@/lib/templates/ServiceIcon';
import { checkSubdomainAvailableAction, generateSiteTextAction, generateBlogPostAction, importJobPhotoToSiteImageAction, listCompletedJobPhotoOptionsAction, publishSiteAction, updateSiteAction, uploadSiteImageAction, verifyCustomDomainAction, type JobPhotoImportOption } from './actions';
import { compressImage } from '@/lib/client-images';
import ImagePickerModal from './ImagePickerModal';
import GoogleReviewImport from './GoogleReviewImport';
import LivePreview from './LivePreview';
import SectionCard from './SectionCard';
import ThemeIcon from './ThemeIcon';
import styles from './SiteEditor.module.css';

type BuilderTab = 'business' | 'design' | 'publish';

type WebsiteBuilderProps = {
  site: Site;
  uploadedImages: SiteImage[];
};

const TABS: { id: BuilderTab; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'design', label: 'Design' },
  { id: 'publish', label: 'Publish' },
];

function createContentId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

// Header hint for a section card: item count when there's content, a warning
// when the section is On but empty (it renders nothing publicly until filled —
// which otherwise reads as "checked but not showing").
// Collapsible list item: collapsed it's a one-line summary row (title + Edit/
// Remove); expanded it shows the fields with a Save button that collapses it
// and persists the site. Kills the wall-of-open-forms feeling in item lists.
function StackItem({ title, meta, editing, onEdit, onSave, onRemove, children }: {
  title: string;
  meta?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={styles.stackItem}>
      <div className={styles.itemHeader}>
        <button type="button" className={styles.itemTitleBtn} onClick={editing ? onSave : onEdit} aria-expanded={editing}>
          <strong>{title}</strong>
          {meta && <small>{meta}</small>}
        </button>
        <div className={styles.itemActions}>
          {editing
            ? <button type="button" className={styles.itemSaveBtn} onClick={onSave}>Save</button>
            : <button type="button" className={styles.itemEditBtn} onClick={onEdit}>Edit</button>}
          <button type="button" onClick={onRemove}>Remove</button>
        </div>
      </div>
      {editing && children}
    </div>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function contentHint(enabled: boolean, count: number, noun: string, plural?: string): { hint?: string; hintTone?: 'ok' | 'warn' } {
  if (enabled && count === 0) return { hint: "empty — won't show yet", hintTone: 'warn' };
  if (count > 0) return { hint: `${count} ${count === 1 ? noun : plural || `${noun}s`}`, hintTone: 'ok' };
  return {};
}

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
  const [siteImages, setSiteImages] = useState(uploadedImages);
  const [jobPhotoOptions, setJobPhotoOptions] = useState<JobPhotoImportOption[]>([]);
  const [jobPhotosLoaded, setJobPhotosLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>('business');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [domainStatus, setDomainStatus] = useState<'idle' | 'checking' | 'verified' | 'unverified'>(site.custom_domain_verified_at ? 'verified' : 'idle');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingBlog, setIsGeneratingBlog] = useState(false);
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const [blogTopic, setBlogTopic] = useState('');
  // Local string state for the free-numeric rating fields so decimal typing
  // (e.g. "4.9") isn't clobbered by re-normalization on every keystroke.
  const [ratingInput, setRatingInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.rating));
  const [reviewCountInput, setReviewCountInput] = useState(() => String(getSiteContent(initialSite.content).ratingBadge.reviewCount));
  const [monthlyFromInput, setMonthlyFromInput] = useState(() => String(getSiteContent(initialSite.content).financing.monthlyFrom));
  // Same decimal/clear-clobber guard for the per-stat Value fields: keep the
  // raw string while a stat is being edited so clearing doesn't snap to 0.
  const [statValueInputs, setStatValueInputs] = useState<Record<string, string>>({});
  const [uploadingTestimonialId, setUploadingTestimonialId] = useState<string | null>(null);
  // One list item is editable at a time; new items open for editing right away.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Briefly highlights a Design-tab field jumped to from the preview (e.g. the
  // hero badge control).
  const [flashField, setFlashField] = useState<string | null>(null);
  // The "Replace photo" popup: which image is being replaced. Opened by clicking
  // any photo in the preview or an inline Replace-photo button; the chosen image
  // is routed by `kind` (site hero/logo, content.images slot, a before/after
  // side, or a showcase tile — scItemId null appends a new showcase image).
  const [picker, setPicker] = useState<
    | { label: string; kind: 'hero' | 'logo' | 'slot' | 'beforeAfter' | 'showcase' | 'heroExtra'; slot?: string; baItemId?: string; baSide?: 'before' | 'after'; scItemId?: string | null; heroExtraIndex?: number }
    | null
  >(null);
  // The section key currently being dragged in the "Page order" reorder list.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const galleryImages = getSiteGallery(site.content);
  const siteContent = getSiteContent(site.content);
  const selectableImages = [...siteImages, ...STOCK_SITE_IMAGES];

  // Blog card hint: live-post count, or a warning when it's enabled with only
  // drafts (the section renders nothing publicly until a post is published).
  const publishedPostCount = siteContent.blog.posts.filter((post) => post.status === 'published' && post.title.trim() && post.body.trim()).length;
  const blogHint: { hint?: string; hintTone?: 'ok' | 'warn' } = publishedPostCount > 0
    ? { hint: `${publishedPostCount} live ${publishedPostCount === 1 ? 'post' : 'posts'}`, hintTone: 'ok' }
    : siteContent.blog.posts.length > 0
      ? siteContent.blog.enabled
        ? { hint: 'drafts only — publish one to go live', hintTone: 'warn' }
        : { hint: `${siteContent.blog.posts.length} ${siteContent.blog.posts.length === 1 ? 'draft' : 'drafts'}`, hintTone: 'ok' }
      : contentHint(siteContent.blog.enabled, 0, 'post');

  // Launch checklist — mirrors the publish gates so first-time owners can see
  // what's missing before they hit Publish (instead of error-by-error).
  const hasLiveSection =
    (siteContent.services.enabled && siteContent.services.items.some((svc) => svc.title.trim())) ||
    (siteContent.howItWorks.enabled && siteContent.howItWorks.steps.some((step) => step.title.trim())) ||
    (siteContent.showcase.enabled && siteContent.showcase.items.length > 0) ||
    (siteContent.faqs.enabled && siteContent.faqs.items.some((faq) => faq.question.trim() && faq.answer.trim())) ||
    (siteContent.testimonials.enabled && siteContent.testimonials.items.some((item) => item.text.trim())) ||
    (siteContent.serviceAreas.enabled && siteContent.serviceAreas.cities.some((city) => city.trim())) ||
    (siteContent.certifications.enabled && siteContent.certifications.items.some((item) => item.label.trim())) ||
    (siteContent.stats.enabled && siteContent.stats.items.some((item) => item.label.trim())) ||
    (siteContent.beforeAfter.enabled && siteContent.beforeAfter.items.some((pair) => pair.beforeUrl && pair.afterUrl)) ||
    (siteContent.blog.enabled && publishedPostCount > 0);

  const launchChecklist = [
    { label: 'Company name', done: Boolean(site.company_name.trim()), hint: 'Business tab' },
    { label: 'Phone number', done: Boolean(site.phone), hint: 'Business tab — powers the call buttons' },
    { label: 'Hero image', done: Boolean(site.hero_url), hint: 'Images tab' },
    { label: 'Web address', done: Boolean(site.subdomain) || Boolean(site.custom_domain && domainStatus === 'verified'), hint: 'Add a subdomain below, or verify a custom domain' },
    { label: 'At least one content section', done: hasLiveSection, hint: 'Design tab — e.g. Services or FAQs' },
  ];

  const handleChange = useCallback((field: keyof Site, value: Site[keyof Site]) => {
    setSite((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
    setMessage(null);
    if (field === 'subdomain') setSubdomainStatus('idle');
    if (field === 'custom_domain') setDomainStatus('idle');
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
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

  // Per-item Save: collapse the editor and persist the whole draft.
  const saveItem = useCallback(() => {
    setEditingItemId(null);
    handleSave();
  }, [handleSave]);

  // Ctrl/Cmd+S saves instead of triggering the browser's save-page dialog.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (isDirty && !isPending) handleSave();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isDirty, isPending, handleSave]);

  // Click-to-edit: the preview iframe posts which region was clicked; jump to
  // the matching tab, open the matching section card, and focus the field.
  useEffect(() => {
    const SECTION_TARGETS: Record<string, string> = {
      'our-services': 'services',
      'how-it-works': 'howItWorks',
      showcase: 'showcase',
      reviews: 'testimonials',
      faqs: 'faqs',
      blog: 'blog',
      areas: 'serviceAreas',
      certifications: 'certifications',
      stats: 'stats',
      'before-after': 'beforeAfter',
      announcement: 'announcement',
      quoteForm: 'quoteForm',
      estimate: 'estimate',
      contact: 'quoteForm',
    };

    function onEditRequest(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'lgq:edit-request') return;
      const target = String(event.data.target || '');

      const focusField = (id: string) => {
        // Double rAF: the tab's panel must render before the field exists.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = document.getElementById(id) as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus({ preventScroll: true });
        }));
      };

      const flashCard = (fieldKey: string, scrollId: string) => {
        setFlashField(fieldKey);
        setTimeout(() => setFlashField((current) => (current === fieldKey ? null : current)), 1600);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
      };

      if (target === 'hero') { setActiveTab('business'); focusField('bf-headline'); return; }
      if (target === 'identity') { setActiveTab('business'); focusField('bf-company'); return; }
      if (target === 'heroBadge') { setActiveTab('design'); setOpenSection('colors'); flashCard('heroBadge', 'design-hero-badge'); return; }
      // Every photo opens the "Replace photo" popup, routed by what was clicked.
      if (target === 'heroImage') { setPicker({ label: 'the hero image', kind: 'hero' }); return; }
      if (target === 'logo') { setPicker({ label: 'your logo', kind: 'logo' }); return; }
      if (target.startsWith('image-')) {
        const slot = target.slice('image-'.length);
        setPicker({ label: IMAGE_SLOT_LABELS[slot] || 'this photo', kind: 'slot', slot });
        return;
      }
      if (target.startsWith('baimg-')) {
        const rest = target.slice('baimg-'.length);
        const side = rest.endsWith('-before') ? 'before' : 'after';
        const baItemId = rest.slice(0, rest.length - side.length - 1);
        setPicker({ label: side === 'before' ? 'the before photo' : 'the after photo', kind: 'beforeAfter', baItemId, baSide: side });
        return;
      }
      if (target.startsWith('showcase-')) {
        setPicker({ label: 'this showcase photo', kind: 'showcase', scItemId: target.slice('showcase-'.length) });
        return;
      }
      const section = SECTION_TARGETS[target];
      if (section) {
        setActiveTab('design');
        setOpenSection(section);
        requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`.${styles.sectionCardOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
      }
    }

    window.addEventListener('message', onEditRequest);
    return () => window.removeEventListener('message', onEditRequest);
  }, []);


  const handleTestimonialImageUpload = useCallback((testimonialId: string, file: File) => {
    setUploadingTestimonialId(testimonialId);
    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressImage(file, 1400, 0.82);
        const formData = new FormData();
        formData.set('image', compressed);
        const image = await uploadSiteImageAction(formData);
        setSiteImages((current) => [image, ...current]);
        setSite((current) => {
          const content = getSiteContent(current.content);
          return { ...current, content: mergeSiteContent(current.content, { testimonials: { ...content.testimonials, items: content.testimonials.items.map((t) => t.id === testimonialId ? { ...t, imageUrl: image.url, imageAlt: t.imageAlt || t.author || 'Customer review image' } : t) } }) };
        });
        setIsDirty(true);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not upload that image. Please try another.' });
      } finally {
        setUploadingTestimonialId(null);
      }
    });
  }, []);

  const handleBlogCoverUpload = useCallback((postId: string, file: File) => {
    setUploadingCoverId(postId);
    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressImage(file, 1600, 0.82);
        const formData = new FormData();
        formData.set('image', compressed);
        const image = await uploadSiteImageAction(formData);
        setSiteImages((current) => [image, ...current]);
        setSite((current) => {
          const content = getSiteContent(current.content);
          return { ...current, content: mergeSiteContent(current.content, { blog: { ...content.blog, posts: content.blog.posts.map((p) => p.id === postId ? { ...p, coverImage: image.url } : p) } }) };
        });
        setIsDirty(true);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not upload that image. Please try another.' });
      } finally {
        setUploadingCoverId(null);
      }
    });
  }, []);

  const handleGenerateBlogDraft = useCallback(() => {
    setIsGeneratingBlog(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const draft = await generateBlogPostAction(blogTopic.trim() || undefined);
        setSite((current) => {
          const content = getSiteContent(current.content);
          // Unique slug among existing posts so /blog/[slug] never collides.
          const slugBase = slugifyBlogTitle(draft.title) || 'post';
          const existing = new Set(content.blog.posts.map((p) => p.slug));
          let slug = slugBase;
          let n = 2;
          while (existing.has(slug)) slug = `${slugBase}-${n++}`;
          const post = {
            id: createContentId('post'),
            slug,
            title: draft.title,
            excerpt: draft.excerpt,
            body: draft.body,
            coverImage: '',
            status: 'draft' as const,
            date: new Date().toISOString().slice(0, 10),
          };
          return { ...current, content: mergeSiteContent(current.content, { blog: { ...content.blog, enabled: true, posts: [post, ...content.blog.posts] } }) };
        });
        setIsDirty(true);
        setBlogTopic('');
        setMessage({ type: 'success', text: 'Draft created — review and edit it, then flip it to Published when you’re happy. Nothing goes live until you publish.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to generate a draft.' });
      } finally {
        setIsGeneratingBlog(false);
      }
    });
  }, [blogTopic]);

  const handleGenerateText = useCallback(() => {
    const hasExistingText = Boolean(site.headline || site.tagline || site.seo_title || site.seo_description);
    if (hasExistingText && !window.confirm('This replaces your headline, tagline, SEO, hours, and service area, and fills the Services, FAQs, and Service-area sections with fresh AI examples. Testimonials and stats are generated too but left OFF until you replace them with real ones. Continue?')) {
      return;
    }
    setIsGeneratingText(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const generated = await generateSiteTextAction();
        setSite((current) => {
          const content = getSiteContent(current.content);
          const contentUpdates: Partial<NormalizedSiteContent> = {};
          if (generated.services.length) {
            contentUpdates.services = { enabled: true, title: content.services.title || 'Our services', intro: '', items: generated.services.map((s, i) => ({ id: `svc-${i + 1}`, icon: s.icon, title: s.title, description: s.description })) };
          }
          if (generated.faqs.length) {
            contentUpdates.faqs = { enabled: true, title: content.faqs.title || 'Frequently asked questions', items: generated.faqs.map((f, i) => ({ id: `faq-${i + 1}`, question: f.question, answer: f.answer })) };
          }
          if (generated.cities.length) {
            contentUpdates.serviceAreas = { enabled: true, title: content.serviceAreas.title || 'Areas we serve', intro: content.serviceAreas.intro, cities: generated.cities };
          }
          // Testimonials + stats seeded but left OFF — no fabricated review/number
          // publishes until the contractor swaps in real ones and enables them.
          if (generated.testimonials.length) {
            contentUpdates.testimonials = { ...content.testimonials, enabled: false, title: content.testimonials.title || 'What homeowners say', sourceMode: 'manual', items: generated.testimonials.map((t, i) => ({ id: `tst-${i + 1}`, author: t.author, text: t.text, rating: t.rating, label: t.label, imageUrl: '', imageAlt: '' })) };
          }
          if (generated.stats.length) {
            contentUpdates.stats = { enabled: false, title: content.stats.title || 'By the numbers', items: generated.stats.map((s, i) => ({ id: `stat-${i + 1}`, value: s.value, prefix: '', suffix: s.suffix, label: s.label })) };
          }
          return {
            ...current,
            headline: generated.headline || current.headline,
            tagline: generated.tagline || current.tagline,
            seo_title: generated.seo_title || current.seo_title,
            seo_description: generated.seo_description || current.seo_description,
            hours: generated.hours || current.hours,
            service_area: generated.service_area || current.service_area,
            content: mergeSiteContent(current.content, contentUpdates),
          };
        });
        setIsDirty(true);
        setMessage({ type: 'success', text: 'Full example site generated — review and personalize it. Testimonials & stats are off until you add real ones. Then publish!' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to generate example content.' });
      } finally {
        setIsGeneratingText(false);
      }
    });
  }, [site.headline, site.tagline, site.seo_title, site.seo_description]);

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

  const updateSiteContent = useCallback((updates: Partial<NormalizedSiteContent>) => {
    handleChange('content', mergeSiteContent(site.content, updates));
  }, [handleChange, site.content]);

  const assignSlotImage = useCallback((slot: string, image: SiteImage) => {
    updateSiteContent({ images: { ...siteContent.images, [slot]: image.url } });
  }, [siteContent.images, updateSiteContent]);

  const resetSlotImage = useCallback((slot: string) => {
    const nextImages = { ...siteContent.images };
    delete nextImages[slot];
    updateSiteContent({ images: nextImages });
  }, [siteContent.images, updateSiteContent]);

  const openPicker = useCallback((label: string, kind: 'hero' | 'logo' | 'slot', slot?: string) => {
    setPicker({ label, kind, slot });
  }, []);

  const addHeroExtraImage = useCallback((image: SiteImage) => {
    updateSiteContent({ heroImages: [...siteContent.heroImages, image.url].slice(0, MAX_EXTRA_HERO_IMAGES) });
  }, [siteContent.heroImages, updateSiteContent]);

  const replaceHeroExtraImage = useCallback((index: number, image: SiteImage) => {
    updateSiteContent({ heroImages: siteContent.heroImages.map((url, itemIndex) => (itemIndex === index ? image.url : url)) });
  }, [siteContent.heroImages, updateSiteContent]);

  const removeHeroExtraImage = useCallback((index: number) => {
    updateSiteContent({ heroImages: siteContent.heroImages.filter((_, itemIndex) => itemIndex !== index) });
  }, [siteContent.heroImages, updateSiteContent]);

  // Move `fromKey` so it lands just before `toKey` in the page order.
  const reorderSections = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const order = siteContent.sectionOrder.filter((key) => key !== fromKey);
    const target = order.indexOf(toKey);
    order.splice(target === -1 ? order.length : target, 0, fromKey);
    updateSiteContent({ sectionOrder: order });
  }, [siteContent.sectionOrder, updateSiteContent]);

  const moveSectionBy = useCallback((key: string, delta: number) => {
    const order = siteContent.sectionOrder.slice();
    const from = order.indexOf(key);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    updateSiteContent({ sectionOrder: order });
  }, [siteContent.sectionOrder, updateSiteContent]);

  const updateShowcase = useCallback((showcase: SiteShowcaseContent) => {
    updateSiteContent({ showcase });
  }, [updateSiteContent]);

  const updateQuoteForm = useCallback((quoteForm: SiteQuoteFormContent) => {
    updateSiteContent({ quoteForm });
  }, [updateSiteContent]);

  const updateEstimateRanges = useCallback((estimateRanges: SiteEstimateRangesContent) => {
    updateSiteContent({ estimateRanges });
  }, [updateSiteContent]);

  const loadJobPhotoOptions = useCallback(() => {
    startTransition(async () => {
      try {
        const photos = await listCompletedJobPhotoOptionsAction();
        setJobPhotoOptions(photos);
        setJobPhotosLoaded(true);
        if (photos.length === 0) setMessage({ type: 'success', text: 'No completed jobs with photos yet.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load completed job photos.' });
      }
    });
  }, []);

  const importJobPhoto = useCallback((photo: JobPhotoImportOption) => {
    startTransition(async () => {
      try {
        const image = await importJobPhotoToSiteImageAction(photo.path, photo.label);
        setSiteImages((current) => [image, ...current]);
        updateShowcase({ ...siteContent.showcase, enabled: true, items: [...siteContent.showcase.items, { ...image, caption: image.alt }] });
        setMessage({ type: 'success', text: 'Job photo imported into your showcase.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import this job photo.' });
      }
    });
  }, [siteContent.showcase, updateShowcase]);

  const updateFaqs = useCallback((faqs: SiteFaqContent) => {
    updateSiteContent({ faqs });
  }, [updateSiteContent]);

  const updateTestimonials = useCallback((testimonials: SiteTestimonialsContent) => {
    updateSiteContent({ testimonials });
  }, [updateSiteContent]);

  const updateStickyCallBar = useCallback((stickyCallBar: SiteStickyCallBarContent) => {
    updateSiteContent({ stickyCallBar });
  }, [updateSiteContent]);

  const updateRatingBadge = useCallback((ratingBadge: SiteRatingBadgeContent) => {
    updateSiteContent({ ratingBadge });
  }, [updateSiteContent]);

  const updateTrustBadges = useCallback((trustBadges: SiteTrustBadgesContent) => {
    updateSiteContent({ trustBadges });
  }, [updateSiteContent]);

  const updateFinancing = useCallback((financing: SiteFinancingContent) => {
    updateSiteContent({ financing });
  }, [updateSiteContent]);

  const updateServiceAreas = useCallback((serviceAreas: SiteServiceAreasContent) => {
    updateSiteContent({ serviceAreas });
  }, [updateSiteContent]);

  const updateCertifications = useCallback((certifications: SiteCertificationsContent) => {
    updateSiteContent({ certifications });
  }, [updateSiteContent]);

  const updateStats = useCallback((stats: SiteStatsContent) => {
    updateSiteContent({ stats });
  }, [updateSiteContent]);

  const updateBeforeAfter = useCallback((beforeAfter: SiteBeforeAfterContent) => {
    updateSiteContent({ beforeAfter });
  }, [updateSiteContent]);

  const setBeforeAfterImage = useCallback((itemId: string, side: 'before' | 'after', image: SiteImage) => {
    updateBeforeAfter({
      ...siteContent.beforeAfter,
      items: siteContent.beforeAfter.items.map((pair) => pair.id !== itemId
        ? pair
        : side === 'before'
          ? { ...pair, beforeUrl: image.url, beforeAlt: image.alt || pair.beforeAlt || 'Before' }
          : { ...pair, afterUrl: image.url, afterAlt: image.alt || pair.afterAlt || 'After' }),
    });
  }, [siteContent.beforeAfter, updateBeforeAfter]);

  const updateAnnouncement = useCallback((announcement: SiteAnnouncementContent) => {
    updateSiteContent({ announcement });
  }, [updateSiteContent]);

  const updateServices = useCallback((services: SiteServicesContent) => {
    updateSiteContent({ services });
  }, [updateSiteContent]);

  const updateHowItWorks = useCallback((howItWorks: SiteHowItWorksContent) => {
    updateSiteContent({ howItWorks });
  }, [updateSiteContent]);

  const updateBlog = useCallback((blog: SiteBlogContent) => {
    updateSiteContent({ blog });
  }, [updateSiteContent]);

  const replaceShowcaseImage = useCallback((itemId: string | null, image: SiteImage) => {
    const current = siteContent.showcase.items;
    // itemId null → append (the "Add photo" flow); otherwise swap that tile in
    // place, keeping its position and dropping any other copy of the picked image.
    if (!itemId) {
      if (current.length >= 9) {
        setMessage({ type: 'error', text: 'Choose up to nine showcase images.' });
        return;
      }
      updateShowcase({ ...siteContent.showcase, enabled: true, items: [...current, { ...image, caption: image.alt }] });
      return;
    }
    const index = current.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const next = current.slice();
    next[index] = { ...image, caption: image.alt };
    const items = next.filter((item, itemIndex) => itemIndex === index || item.id !== image.id);
    updateShowcase({ ...siteContent.showcase, items });
  }, [siteContent.showcase, updateShowcase]);

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
          ? { type: 'success', text: `${subdomain}.${ROOT_DOMAIN} is available.` }
          : { type: 'error', text: 'That subdomain is already in use.' });
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to check this subdomain.' });
      }
    });
  }, [site.subdomain]);

  const handlePublish = useCallback(() => {
    const nextPublished = !site.published;
    if (nextPublished && !site.company_name.trim()) {
      setActiveTab('business');
      setMessage({ type: 'error', text: 'Add a company name on the Business tab before publishing.' });
      return;
    }
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

  const rootDomain = ROOT_DOMAIN;
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
          <div
            className={styles.builderTabs}
            role="tablist"
            aria-label="Website settings"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = TABS.findIndex((tab) => tab.id === activeTab);
              const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
              setActiveTab(next.id);
              document.getElementById(`builder-tab-${next.id}`)?.focus();
            }}
          >
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                id={`builder-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="builder-tabpanel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? styles.activeBuilderTab : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent} id="builder-tabpanel" role="tabpanel" aria-labelledby={`builder-tab-${activeTab}`}>
            {activeTab === 'business' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}>
                  <h2>Business information</h2>
                  <p>This content appears throughout your website.</p>
                  <button type="button" className="btn secondary" onClick={handleGenerateText} disabled={isGeneratingText}>
                    {isGeneratingText ? 'Building your site...' : '✨ Generate a full example site with AI'}
                  </button>
                  <small>Fills your headline, tagline, SEO, hours, service area, Services, and FAQs with trade-specific examples to personalize. Testimonials and stats are generated too, but left off until you swap in your real ones.</small>
                </div>

                <label className={styles.formField}><span>Company name</span><input id="bf-company" value={site.company_name} onChange={(event) => handleChange('company_name', event.target.value)} /></label>
                <label className={styles.formField}><span>Headline</span><textarea id="bf-headline" rows={2} value={site.headline || ''} onChange={(event) => handleChange('headline', event.target.value || null)} placeholder="Built with purpose. Finished with care." /></label>
                <label className={styles.formField}><span>Tagline</span><textarea id="bf-tagline" rows={3} value={site.tagline || ''} onChange={(event) => handleChange('tagline', event.target.value || null)} placeholder="Tell homeowners what makes your business different." /></label>
                <div className={styles.formColumns}>
                  <label className={styles.formField}><span>Phone</span><input type="tel" value={site.phone || ''} onChange={(event) => handleChange('phone', event.target.value || null)} placeholder="(555) 123-4567" /></label>
                  <label className={styles.formField}><span>License</span><input value={site.license || ''} onChange={(event) => handleChange('license', event.target.value || null)} placeholder="LIC #123456" /></label>
                </div>
                <label className={styles.formField}><span>Service area</span><input value={site.service_area || ''} onChange={(event) => handleChange('service_area', event.target.value || null)} placeholder="City and surrounding communities" /></label>
                <label className={styles.formField}><span>Business hours</span><input value={site.hours || ''} onChange={(event) => handleChange('hours', event.target.value || null)} placeholder="Monday-Friday, 7am-5pm" /></label>
              </div>
            )}

            {activeTab === 'design' && (
              <div className={styles.formSection}>
                <SectionCard title="Logo & hero images" description="Your logo, the big hero photo, and optional extra hero photos." open={openSection === 'brand'} onToggleOpen={() => toggleSection('brand')}>
                  <div className={styles.imageSlots}>
                    <div className={styles.imageSlot}>
                      <div className={styles.imageSlotHead}><strong>Logo</strong><small>Shown small in your header and footer.</small></div>
                      {site.logo_url
                        ? <div className={styles.logoPreviews}><div className={styles.logoPreview}><img src={site.logo_url} alt="Logo on a light header" data-logo-style={siteContent.logoStyle} /><em>Light</em></div><div className={styles.logoPreviewDark}><img src={site.logo_url} alt="Logo on a dark header" data-logo-style={siteContent.logoStyle} /><em>Dark</em></div></div>
                        : <div className={styles.imageSlotEmpty}>No logo yet</div>}
                      <div className={styles.imageSlotActions}>
                        <button type="button" className={styles.secondaryAction} onClick={() => openPicker('your logo', 'logo')}>{site.logo_url ? 'Replace photo' : 'Add a logo'}</button>
                        {site.logo_url && <button type="button" className={styles.secondaryAction} onClick={() => handleChange('logo_url', null)}>Remove</button>}
                      </div>
                      <label className={styles.formField}><span>Logo shape</span><select value={siteContent.logoStyle} onChange={(event) => updateSiteContent({ logoStyle: event.target.value })}><option value="plain">Plain (no frame)</option><option value="rounded">Rounded corners</option><option value="framed">Framed chip (padding + border)</option><option value="circle">Circle</option></select><small className={styles.fieldHint}>Add a rounded frame or chip so a boxy logo blends into the header.</small></label>
                      <small className={styles.fieldHint}>Best as a <strong>PNG or SVG with a transparent background</strong> — wide and simple. Aim for ~400×120px; it&apos;s shown up to 70px tall.</small>
                    </div>
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
                  </div>
                  <div className={styles.formField}>
                    <span>Extra hero photos <em className={styles.fieldOptional}>optional</em></span>
                    {siteContent.heroImages.length > 0 && (
                      <div className={styles.imageSlots}>
                        {siteContent.heroImages.map((url, index) => (
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
                </SectionCard>

                <SectionCard title="Colors & style" description="Set the visual direction of your website — theme, accent, fonts, and buttons." open={openSection === 'colors'} onToggleOpen={() => toggleSection('colors')}>
                  <div className={styles.themeGrid}>
                    {AVAILABLE_TEMPLATES.map((template) => (
                      <button type="button" key={template.id} className={`${styles.themeOption}${site.template === template.id ? ` ${styles.selectedTheme}` : ''}`} onClick={() => handleChange('template', template.id as TemplateType)} aria-pressed={site.template === template.id}>
                        <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} />
                        <span className={styles.themeOptionInfo}><strong>{template.name}</strong></span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Accent color</span><div className={styles.colorControl}><input type="color" value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /><input value={site.accent_override || '#ff7a21'} onChange={(event) => handleChange('accent_override', event.target.value)} /></div></label>
                    <label className={styles.formField}><span>Color mode</span><select value={site.portal_mode} onChange={(event) => handleChange('portal_mode', event.target.value as Site['portal_mode'])}><option value="light">Light</option><option value="dark">Dark</option></select></label>
                  </div>
                  <label className={styles.formField}><span>Heading font</span><select value={site.header_font || ''} onChange={(event) => handleChange('header_font', event.target.value || null)}><option value="">Theme default</option><option value="Georgia, Times New Roman, serif">Classic serif</option><option value="Arial Black, Helvetica, sans-serif">Bold sans</option><option value="Trebuchet MS, sans-serif">Humanist sans</option></select></label>
                  <label className={styles.formField}><span>Button style</span><select value={site.button_style || 'solid'} onChange={(event) => handleChange('button_style', event.target.value)}><option value="solid">Solid</option><option value="outline">Outline</option><option value="ghost">Minimal</option></select></label>
                  <div className={`${styles.formField}${flashField === 'heroBadge' ? ` ${styles.fieldFlash}` : ''}`} id="design-hero-badge">
                    <span>Hero badge</span>
                    <select value={siteContent.heroBadge.preset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, preset: event.target.value } })}>{HERO_BADGE_PRESETS.map((badge) => <option key={badge.key} value={badge.key}>{badge.title}</option>)}<option value="custom">Custom badge…</option><option value="none">No badge</option></select>
                    <small className={styles.fieldHint}>The floating trust chip on your hero photo (Fixit, Shine, Coat &amp; more).</small>
                    {siteContent.heroBadge.preset === 'custom' && (
                      <input value={siteContent.heroBadge.customLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, customLabel: event.target.value } })} placeholder="e.g. Clear Quotes. Quality Work." />
                    )}
                  </div>
                  <label className={styles.formField}><span>Badge style</span><select value={siteContent.heroBadge.style} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, style: event.target.value } })}>{HERO_BADGE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>
                  <div className={styles.formField}>
                    <span>Extra floating badge</span>
                    <select value={siteContent.heroBadge.secondPreset} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondPreset: event.target.value } })}>
                      <option value="default">Template default (e.g. &ldquo;500+ customers&rdquo;)</option>
                      {HERO_BADGE_PRESETS.map((badge) => <option key={`second-${badge.key}`} value={badge.key}>{badge.title}</option>)}
                      <option value="custom">Custom badge…</option>
                      <option value="none">No extra badge</option>
                    </select>
                    <small className={styles.fieldHint}>The second chip beside your hero photo (Shine, Fixit &amp; Guild).</small>
                    {siteContent.heroBadge.secondPreset === 'custom' && (
                      <input value={siteContent.heroBadge.secondCustomLabel} maxLength={40} onChange={(event) => updateSiteContent({ heroBadge: { ...siteContent.heroBadge, secondCustomLabel: event.target.value } })} placeholder="e.g. Family Owned" />
                    )}
                  </div>
                </SectionCard>

                <div className={styles.sectionIntro}><h2>Pages & sections</h2><p>Add rich sections that make the public website feel complete.</p></div>

                <SectionCard title="Page order" description="Drag to reorder the sections on your public page. Off sections keep their spot but stay hidden until you turn them on." open={openSection === 'sectionOrder'} onToggleOpen={() => toggleSection('sectionOrder')}>
                  <ul className={styles.sectionOrderList}>
                    {siteContent.sectionOrder.map((key, index) => {
                      const meta = REORDERABLE_SECTIONS.find((section) => section.key === key);
                      if (!meta) return null;
                      const enabledMap: Record<string, boolean> = {
                        services: siteContent.services.enabled,
                        howItWorks: siteContent.howItWorks.enabled,
                        showcase: siteContent.showcase.enabled,
                        testimonials: siteContent.testimonials.enabled,
                        faqs: siteContent.faqs.enabled,
                        serviceAreas: siteContent.serviceAreas.enabled,
                        stats: siteContent.stats.enabled,
                        beforeAfter: siteContent.beforeAfter.enabled,
                        blog: siteContent.blog.enabled,
                        certifications: siteContent.certifications.enabled,
                      };
                      return (
                        <li
                          key={key}
                          draggable
                          onDragStart={(event) => { setDragKey(key); event.dataTransfer.effectAllowed = 'move'; }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => { event.preventDefault(); if (dragKey) reorderSections(dragKey, key); setDragKey(null); }}
                          onDragEnd={() => setDragKey(null)}
                          className={`${styles.sectionOrderItem}${dragKey === key ? ` ${styles.sectionOrderDragging}` : ''}`}
                        >
                          <span className={styles.sectionOrderGrip} aria-hidden="true">⠿</span>
                          <span className={styles.sectionOrderName}>{meta.label}{!enabledMap[key] && <em className={styles.sectionOrderOff}>off</em>}</span>
                          <span className={styles.sectionOrderMove}>
                            <button type="button" aria-label={`Move ${meta.label} up`} disabled={index === 0} onClick={() => moveSectionBy(key, -1)}>↑</button>
                            <button type="button" aria-label={`Move ${meta.label} down`} disabled={index === siteContent.sectionOrder.length - 1} onClick={() => moveSectionBy(key, 1)}>↓</button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </SectionCard>

                <div className={styles.cardGroupLabel}>Capture leads</div>

                <SectionCard title="Quote form" description="How homeowners request a quote from your site." open={openSection === 'quoteForm'} onToggleOpen={() => toggleSection('quoteForm')}>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.quoteForm.emailRequired} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, emailRequired: event.target.checked })} /><span><strong>Require email on quote form</strong><small>Ask homeowners for an email address on every request so future email campaigns have clean contact data.</small></span></label>
                  <label className={styles.formField}><span>Quote form wording</span><select value={siteContent.quoteForm.estimateLabel} onChange={(event) => updateQuoteForm({ ...siteContent.quoteForm, estimateLabel: event.target.value as SiteQuoteFormContent['estimateLabel'] })}><option value="quick">&quot;Quick Estimate&quot;</option><option value="instant">&quot;Instant Estimate&quot;</option></select></label>
                </SectionCard>

                <SectionCard title="Instant estimate" description="After the quick-capture form, our AI asks the homeowner a couple of quick questions to size up the job, then shows a rough $ range right away." enabled={siteContent.estimateRanges.enabled} onToggleEnabled={(value) => updateEstimateRanges({ ...siteContent.estimateRanges, enabled: value })} open={openSection === 'estimate'} onToggleOpen={() => toggleSection('estimate')} />

                <div className={styles.cardGroupLabel}>Content sections</div>

                <SectionCard title="Services" description="Icon cards for the work you do — the first thing most home-services visitors scan for. Add a few with an icon, name, and one-line description." evidence="A clear service grid lets a visitor confirm 'they do what I need' in seconds — the fastest way to hold a home-services visitor's attention." enabled={siteContent.services.enabled} onToggleEnabled={(value) => updateServices({ ...siteContent.services, enabled: value })} {...contentHint(siteContent.services.enabled, siteContent.services.items.filter((svc) => svc.title.trim()).length, 'service')} open={openSection === 'services'} onToggleOpen={() => toggleSection('services')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.services.title} onChange={(event) => updateServices({ ...siteContent.services, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy (optional)</span><input value={siteContent.services.intro} onChange={(event) => updateServices({ ...siteContent.services, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.services.items.map((item, index) => (
                      <StackItem key={item.id} title={item.title.trim() || `Service ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateServices({ ...siteContent.services, items: siteContent.services.items.filter((svc) => svc.id !== item.id) })}>
                        <div className={styles.formField}><span>Icon</span><div className={styles.iconPicker}>{SERVICE_ICON_KEYS.map((key) => (<button type="button" key={`${item.id}-${key}`} className={`${styles.iconPickerBtn}${item.icon === key ? ` ${styles.iconPickerBtnOn}` : ''}`} aria-label={`Icon: ${key}`} aria-pressed={item.icon === key} onClick={() => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, icon: key } : svc) })}><ServiceIcon name={key} /></button>))}</div></div>
                        <label className={styles.formField}><span>Service name</span><input value={item.title} maxLength={60} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, title: event.target.value } : svc) })} placeholder="Interior painting" /></label>
                        <label className={styles.formField}><span>Short description</span><input value={item.description} maxLength={140} onChange={(event) => updateServices({ ...siteContent.services, items: siteContent.services.items.map((svc) => svc.id === item.id ? { ...svc, description: event.target.value } : svc) })} placeholder="Walls, ceilings, and trim — clean lines, on schedule." /></label>
                      </StackItem>
                    ))}
                  </div>
                  {siteContent.services.items.length < 8 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('svc'); updateServices({ ...siteContent.services, enabled: true, items: [...siteContent.services.items, { id, icon: 'spark', title: '', description: '' }] }); setEditingItemId(id); }}>Add service</button>}
                </SectionCard>

                <SectionCard title="How it works" description="A simple 3–4 step walkthrough of what happens after they reach out — book, we arrive, job done. Removes the 'what do I have to do?' hesitation." evidence="Showing the process upfront lowers the perceived effort of reaching out — people act when they can see exactly what happens next." enabled={siteContent.howItWorks.enabled} onToggleEnabled={(value) => updateHowItWorks({ ...siteContent.howItWorks, enabled: value })} {...contentHint(siteContent.howItWorks.enabled, siteContent.howItWorks.steps.filter((step) => step.title.trim()).length, 'step')} open={openSection === 'howItWorks'} onToggleOpen={() => toggleSection('howItWorks')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.howItWorks.title} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy (optional)</span><input value={siteContent.howItWorks.intro} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.howItWorks.steps.map((step, index) => (
                      <StackItem key={step.id} title={step.title.trim() || `Step ${index + 1}`} editing={editingItemId === step.id} onEdit={() => setEditingItemId(step.id)} onSave={saveItem} onRemove={() => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.filter((s) => s.id !== step.id) })}>
                        <label className={styles.formField}><span>Step title</span><input value={step.title} maxLength={60} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s) => s.id === step.id ? { ...s, title: event.target.value } : s) })} placeholder="Book online or call" /></label>
                        <label className={styles.formField}><span>Description</span><input value={step.description} maxLength={160} onChange={(event) => updateHowItWorks({ ...siteContent.howItWorks, steps: siteContent.howItWorks.steps.map((s) => s.id === step.id ? { ...s, description: event.target.value } : s) })} placeholder="Tell us what you need and pick a time that works." /></label>
                      </StackItem>
                    ))}
                  </div>
                  {siteContent.howItWorks.steps.length < 5 && <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('step'); updateHowItWorks({ ...siteContent.howItWorks, enabled: true, steps: [...siteContent.howItWorks.steps, { id, title: '', description: '' }] }); setEditingItemId(id); }}>Add step</button>}
                </SectionCard>

                <SectionCard title="Blog" description="Helpful articles for homeowners — maintenance tips, seasonal advice, and what to know before hiring. AI can draft them; you review and publish." evidence="Fresh, useful posts give Google more local pages to rank and give past customers a reason to return — search visibility that compounds over time." enabled={siteContent.blog.enabled} onToggleEnabled={(value) => updateBlog({ ...siteContent.blog, enabled: value })} {...blogHint} open={openSection === 'blog'} onToggleOpen={() => toggleSection('blog')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.blog.title} onChange={(event) => updateBlog({ ...siteContent.blog, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy (optional)</span><input value={siteContent.blog.intro} onChange={(event) => updateBlog({ ...siteContent.blog, intro: event.target.value })} /></label>
                  <label className={styles.formField}><span>What should the next post be about? (optional)</span><input value={blogTopic} maxLength={200} onChange={(event) => setBlogTopic(event.target.value)} placeholder="e.g. Fall gutter maintenance checklist — leave blank and AI picks a seasonal topic" /></label>
                  <button type="button" className="btn secondary" onClick={handleGenerateBlogDraft} disabled={isGeneratingBlog}>{isGeneratingBlog ? 'Writing a draft…' : '✨ Generate a draft with AI'}</button>
                  <p className={styles.fieldHint}>Drafts are saved unpublished — nothing goes live until you flip a post to Published.</p>
                  <div className={styles.stackList}>
                    {siteContent.blog.posts.map((post, index) => (
                      <StackItem key={post.id} title={post.title.trim() || `Post ${index + 1}`} meta={post.status === 'published' ? 'Live' : 'Draft'} editing={editingItemId === post.id} onEdit={() => setEditingItemId(post.id)} onSave={saveItem} onRemove={() => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.filter((p) => p.id !== post.id) })}>
                        <label className={styles.toggleRow}><input type="checkbox" checked={post.status === 'published'} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, status: event.target.checked ? 'published' : 'draft' } : p) })} /><span><strong>Published</strong><small>{post.status === 'published' ? 'Live on your site.' : 'Draft — only you can see it until you publish.'}</small></span></label>
                        <label className={styles.formField}><span>Title</span><input value={post.title} maxLength={120} onChange={(event) => { const title = event.target.value; updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, title, slug: (!p.slug || /^post-\d+$/.test(p.slug)) ? slugifyBlogTitle(title) : p.slug } : p) }); }} placeholder="5 signs it’s time to reseal your deck" /></label>
                        <label className={styles.formField}><span>Excerpt</span><input value={post.excerpt} maxLength={200} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, excerpt: event.target.value } : p) })} placeholder="One sentence that makes someone want to read." /></label>
                        <div className={styles.formField}>
                          <span>Cover photo (optional)</span>
                          {post.coverImage && (
                            <div className={styles.blogCoverPreview}>
                              <img src={post.coverImage} alt="Cover preview" />
                              <button type="button" onClick={() => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, coverImage: '' } : p) })}>Remove</button>
                            </div>
                          )}
                          <label className={styles.blogCoverUpload}>
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingCoverId === post.id} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) handleBlogCoverUpload(post.id, file); }} />
                            <span>{uploadingCoverId === post.id ? 'Uploading…' : post.coverImage ? 'Replace photo' : 'Upload a cover photo'}</span>
                          </label>
                        </div>
                        <label className={styles.formField}><span>Body</span><textarea rows={10} value={post.body} onChange={(event) => updateBlog({ ...siteContent.blog, posts: siteContent.blog.posts.map((p) => p.id === post.id ? { ...p, body: event.target.value } : p) })} placeholder="Write in short paragraphs separated by a blank line." /><small>{wordCount(post.body)} words · ~{Math.max(1, Math.round(wordCount(post.body) / 220))} min read{wordCount(post.body) > 0 && wordCount(post.body) < 300 ? ' — aim for 400+ words so the post feels substantial' : ''}</small></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('post'); updateBlog({ ...siteContent.blog, enabled: true, posts: [{ id, slug: '', title: '', excerpt: '', body: '', coverImage: '', status: 'draft', date: new Date().toISOString().slice(0, 10) }, ...siteContent.blog.posts] }); setEditingItemId(id); }}>Add post manually</button>
                </SectionCard>

                <SectionCard title="Showcase gallery" description="Highlight finished work, project details, and job photos." evidence="Real project photos alongside reviews produced 55% more leads in one study — genuine work outperforms stock." enabled={siteContent.showcase.enabled} onToggleEnabled={(value) => updateShowcase({ ...siteContent.showcase, enabled: value })} {...contentHint(siteContent.showcase.enabled, siteContent.showcase.items.length, 'image')} open={openSection === 'showcase'} onToggleOpen={() => toggleSection('showcase')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.showcase.title} onChange={(event) => updateShowcase({ ...siteContent.showcase, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy</span><textarea rows={2} value={siteContent.showcase.intro} onChange={(event) => updateShowcase({ ...siteContent.showcase, intro: event.target.value })} /></label>
                  <label className={styles.formField}><span>Layout</span><select value={siteContent.showcase.layout} onChange={(event) => updateShowcase({ ...siteContent.showcase, layout: event.target.value as SiteShowcaseContent['layout'] })}><option value="grid">Clean grid</option><option value="featured">Feature first image</option><option value="masonry">Masonry-style mix</option></select></label>
                  <div className={styles.contentSubhead}><strong>Showcase images</strong><small>{siteContent.showcase.items.length}/9 · shown in this order</small></div>
                  {siteContent.showcase.items.length > 0 && (
                    <div className={styles.showcaseSelected} aria-label="Showcase images, in order">
                      {siteContent.showcase.items.map((item) => (
                        <div key={item.id} className={styles.showcaseSelectedTile}>
                          <img src={item.url} alt={item.alt} />
                          <div className={styles.showcaseSelectedActions}>
                            <button type="button" onClick={() => setPicker({ label: 'this showcase photo', kind: 'showcase', scItemId: item.id })}>Replace</button>
                            <button type="button" aria-label={`Remove ${item.alt}`} onClick={() => updateShowcase({ ...siteContent.showcase, items: siteContent.showcase.items.filter((other) => other.id !== item.id) })}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {siteContent.showcase.items.length < 9 && <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'a showcase photo', kind: 'showcase', scItemId: null })}>Add photo</button>}
                  <div className={styles.jobPhotoImport}>
                    <div><strong>Completed job photos</strong><small>Import private job photos into public site images for the showcase.</small></div>
                    <button type="button" onClick={loadJobPhotoOptions} disabled={isPending}>{jobPhotosLoaded ? 'Refresh job photos' : 'Load job photos'}</button>
                  </div>
                  {jobPhotosLoaded && (
                    jobPhotoOptions.length > 0 ? (
                      <div className={styles.compactImageGrid}>
                        {jobPhotoOptions.map((photo) => (
                          <button type="button" key={photo.path} className={styles.compactImageTile} onClick={() => importJobPhoto(photo)} disabled={isPending}>
                            <img src={photo.url} alt={photo.label} />
                            <span>Import</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className={styles.emptyHelper}>Completed jobs with photos will appear here.</p>
                  )}
                </SectionCard>

                <SectionCard title="FAQs" description="Answer common homeowner questions before they request a quote." enabled={siteContent.faqs.enabled} onToggleEnabled={(value) => updateFaqs({ ...siteContent.faqs, enabled: value })} {...contentHint(siteContent.faqs.enabled, siteContent.faqs.items.filter((faq) => faq.question.trim() && faq.answer.trim()).length, 'question')} open={openSection === 'faqs'} onToggleOpen={() => toggleSection('faqs')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.faqs.title} onChange={(event) => updateFaqs({ ...siteContent.faqs, title: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.faqs.items.map((item, index) => (
                      <StackItem key={item.id} title={item.question.trim() || `Question ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.filter((faq) => faq.id !== item.id) })}>
                        <label className={styles.formField}><span>Question</span><input value={item.question} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq) => faq.id === item.id ? { ...faq, question: event.target.value } : faq) })} /></label>
                        <label className={styles.formField}><span>Answer</span><textarea rows={3} value={item.answer} onChange={(event) => updateFaqs({ ...siteContent.faqs, items: siteContent.faqs.items.map((faq) => faq.id === item.id ? { ...faq, answer: event.target.value } : faq) })} /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('faq'); updateFaqs({ ...siteContent.faqs, enabled: true, items: [...siteContent.faqs.items, { id, question: '', answer: '' }] }); setEditingItemId(id); }}>Add FAQ</button>
                </SectionCard>

                <SectionCard title="Testimonials" description="Show quotes from real customers on your public site." evidence="97% of homeowners read reviews before hiring a local pro, and the first few weigh the most." enabled={siteContent.testimonials.enabled} onToggleEnabled={(value) => updateTestimonials({ ...siteContent.testimonials, enabled: value })} {...contentHint(siteContent.testimonials.enabled, siteContent.testimonials.items.filter((item) => item.text.trim()).length, 'review')} open={openSection === 'testimonials'} onToggleOpen={() => toggleSection('testimonials')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.testimonials.title} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Source mode</span><select value={siteContent.testimonials.sourceMode} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, sourceMode: event.target.value as SiteTestimonialsContent['sourceMode'] })}><option value="manual">Manual testimonials</option><option value="mixed">Manual + Google</option><option value="google">Google reviews only</option></select></label>
                  {siteContent.testimonials.sourceMode !== 'manual' && (
                    <div className={styles.formField}>
                      <span>Google reviews</span>
                      <GoogleReviewImport
                        placeId={siteContent.testimonials.googlePlaceId}
                        name={siteContent.testimonials.googleName}
                        reviewCount={siteContent.testimonials.googleReviewCount}
                        importedCount={siteContent.testimonials.googleReviews.length}
                        importedAt={siteContent.testimonials.googleImportedAt}
                        onImport={(data) => updateTestimonials({ ...siteContent.testimonials, enabled: true, googlePlaceId: data.placeId, googleName: data.name, googleUrl: data.url, googleRating: data.rating, googleReviewCount: data.reviewCount, googleReviews: data.reviews, googleImportedAt: new Date().toISOString().slice(0, 10) })}
                        onClear={() => updateTestimonials({ ...siteContent.testimonials, googlePlaceId: '', googleName: '', googleUrl: '', googleRating: 0, googleReviewCount: 0, googleReviews: [], googleImportedAt: '' })}
                      />
                      {siteContent.testimonials.googleReviews.length > 0 && (
                        <div className={styles.googleReviewPreview}>
                          {siteContent.testimonials.googleReviews.map((review) => (
                            <div key={review.id} className={styles.googleReviewPreviewItem}>
                              <div>{'★'.repeat(Math.round(review.rating))}<strong> {review.author}</strong>{review.relativeTime && <em> · {review.relativeTime}</em>}</div>
                              <p>{review.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={styles.stackList}>
                    {siteContent.testimonials.items.map((item, index) => (
                      <StackItem key={item.id} title={item.author.trim() || `Testimonial ${index + 1}`} meta={`${item.rating}★`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.filter((testimonial) => testimonial.id !== item.id) })}>
                        <div className={styles.formColumns}>
                          <label className={styles.formField}><span>Customer</span><input value={item.author} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, author: event.target.value } : testimonial) })} /></label>
                          <label className={styles.formField}><span>Rating</span><select value={item.rating} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, rating: Number(event.target.value) } : testimonial) })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                        </div>
                        <label className={styles.formField}><span>Project label</span><input value={item.label} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, label: event.target.value } : testimonial) })} placeholder="Kitchen remodel, deck build, emergency repair..." /></label>
                        <div className={styles.formColumns}>
                          <div className={styles.formField}>
                            <span>Photo (optional)</span>
                            <label className={styles.blogCoverUpload}>
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingTestimonialId === item.id} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) handleTestimonialImageUpload(item.id, file); }} />
                              <span>{uploadingTestimonialId === item.id ? 'Uploading…' : item.imageUrl ? 'Replace photo' : 'Upload a photo'}</span>
                            </label>
                          </div>
                          <label className={styles.formField}><span>Choose image</span><select value={item.imageUrl} onChange={(event) => {
                            const image = selectableImages.find((candidate) => candidate.url === event.target.value);
                            updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, imageUrl: event.target.value, imageAlt: image?.alt || testimonial.imageAlt || testimonial.author || 'Customer review image' } : testimonial) });
                          }}><option value="">No image</option>{selectableImages.map((image) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                        </div>
                        {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.author || 'Review image preview'} /></div>}
                        <label className={styles.formField}><span>Review text</span><textarea rows={4} value={item.text} onChange={(event) => updateTestimonials({ ...siteContent.testimonials, items: siteContent.testimonials.items.map((testimonial) => testimonial.id === item.id ? { ...testimonial, text: event.target.value } : testimonial) })} /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('testimonial'); updateTestimonials({ ...siteContent.testimonials, enabled: true, items: [...siteContent.testimonials.items, { id, author: '', text: '', rating: 5, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add testimonial</button>
                </SectionCard>

                <div className={styles.cardGroupLabel}>Trust &amp; conversion extras</div>

                <SectionCard title="Availability bar" description="A slim band above your header for one timely, high-urgency line — booking status, same-day service, a seasonal note. You type the message, so it never invents urgency; it only appears once filled in." evidence={'Urgency converts — emergency-ready trades close highest (12–16%); a "same-day" or "now booking" line cuts hesitation.'} enabled={siteContent.announcement.enabled} onToggleEnabled={(value) => updateAnnouncement({ ...siteContent.announcement, enabled: value })} open={openSection === 'announcement'} onToggleOpen={() => toggleSection('announcement')}>
                  <label className={styles.formField}><span>Message</span><input value={siteContent.announcement.message} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, message: event.target.value })} placeholder="Now booking August installs" /></label>
                  <label className={styles.formField}><span>Second line (optional)</span><input value={siteContent.announcement.subtext} maxLength={140} onChange={(event) => updateAnnouncement({ ...siteContent.announcement, subtext: event.target.value })} placeholder="Same-day estimates · Licensed &amp; insured" /></label>
                  {siteContent.announcement.enabled && !siteContent.announcement.message.trim() && <p className={styles.emptyHelper}>Add a message above for the bar to appear on your site.</p>}
                </SectionCard>

                <SectionCard title="Sticky call bar (mobile)" description="Pins a tap-to-call button to the bottom of every phone screen, so homeowners can reach you in one tap. Needs a phone number on the Business tab." evidence="For home services the phone closes 25–55× better than a form; a one-tap bar that follows the visitor keeps it in reach (sticky CTAs lift conversions 15–40%)." enabled={siteContent.stickyCallBar.enabled} onToggleEnabled={(value) => updateStickyCallBar({ ...siteContent.stickyCallBar, enabled: value })} open={openSection === 'stickyBar'} onToggleOpen={() => toggleSection('stickyBar')}>
                  <label className={styles.toggleRow}><input type="checkbox" checked={siteContent.stickyCallBar.showQuote} onChange={(event) => updateStickyCallBar({ ...siteContent.stickyCallBar, showQuote: event.target.checked })} /><span><strong>Add a &quot;Free quote&quot; button</strong><small>Adds a second button beside Call that jumps straight to your quote form.</small></span></label>
                  {siteContent.stickyCallBar.enabled && !site.phone && <p className={styles.emptyHelper}>Add a phone number on the Business tab to make this bar appear.</p>}
                </SectionCard>

                <SectionCard title="Star-rating badge" description={'Shows a "4.9 ★ from 37 reviews" trust badge near your reviews. Enter your real average rating and review count — only enable this if the numbers are accurate.'} evidence="97% of buyers check reviews first — a rating shown right beside your form is what turns that trust into a call." enabled={siteContent.ratingBadge.enabled} onToggleEnabled={(value) => updateRatingBadge({ ...siteContent.ratingBadge, enabled: value })} open={openSection === 'rating'} onToggleOpen={() => toggleSection('rating')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>Average rating (1–5)</span><input type="number" min={1} max={5} step={0.1} value={ratingInput} onChange={(event) => { const raw = event.target.value; setRatingInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, rating: Number(raw) }); }} onBlur={() => setRatingInput(String(siteContent.ratingBadge.rating))} /></label>
                    <label className={styles.formField}><span>Number of reviews</span><input type="number" min={0} step={1} value={reviewCountInput} onChange={(event) => { const raw = event.target.value; setReviewCountInput(raw); if (raw !== '') updateRatingBadge({ ...siteContent.ratingBadge, reviewCount: Number(raw) }); }} onBlur={() => setReviewCountInput(String(siteContent.ratingBadge.reviewCount))} /></label>
                  </div>
                  <label className={styles.formField}><span>Source label</span><input value={siteContent.ratingBadge.sourceLabel} onChange={(event) => updateRatingBadge({ ...siteContent.ratingBadge, sourceLabel: event.target.value })} placeholder="Google reviews" /></label>
                </SectionCard>

                <SectionCard title="Trust badges" description="A row of reassurance chips (Licensed, Insured, Bonded…) on your public site. Toggle the ones that apply and edit the labels." evidence="Licensed / insured / bonded pros are seen ~5× more likely to finish the job; these chips lower the risk of reaching out." enabled={siteContent.trustBadges.enabled} onToggleEnabled={(value) => updateTrustBadges({ ...siteContent.trustBadges, enabled: value })} open={openSection === 'trustBadges'} onToggleOpen={() => toggleSection('trustBadges')}>
                  <p className={styles.fieldHint}>Check to show, uncheck to hide. Edit the label inline.</p>
                  <div className={styles.badgeList}>
                    {siteContent.trustBadges.badges.map((badge) => (
                      <div className={styles.badgeRow} key={badge.id}>
                        <input type="checkbox" checked={badge.enabled} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item) => item.id === badge.id ? { ...item, enabled: event.target.checked } : item) })} aria-label={`Show ${badge.label || 'badge'}`} />
                        <input className={`${styles.badgeInput}${badge.enabled ? '' : ` ${styles.badgeInputOff}`}`} value={badge.label} onChange={(event) => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.map((item) => item.id === badge.id ? { ...item, label: event.target.value } : item) })} placeholder="Badge label" />
                        <button type="button" className={styles.badgeRemove} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, badges: siteContent.trustBadges.badges.filter((item) => item.id !== badge.id) })} aria-label={`Remove ${badge.label || 'badge'}`}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => updateTrustBadges({ ...siteContent.trustBadges, enabled: true, badges: [...siteContent.trustBadges.badges, { id: createContentId('badge'), label: '', enabled: true }] })}>Add badge</button>
                </SectionCard>

                <SectionCard title="Financing callout" description={'Reframe the price — show "Projects from $X/mo" so sticker shock doesn\'t kill the lead. Only appears once the monthly amount is set.'} evidence={'Sticker shock is a top silent reason a lead never calls — reframing price as "$X/mo" keeps them in the conversation.'} enabled={siteContent.financing.enabled} onToggleEnabled={(value) => updateFinancing({ ...siteContent.financing, enabled: value })} open={openSection === 'financing'} onToggleOpen={() => toggleSection('financing')}>
                  <div className={styles.formColumns}>
                    <label className={styles.formField}><span>From ($/month)</span><input type="number" min={0} step={1} value={monthlyFromInput} onChange={(event) => { const raw = event.target.value; setMonthlyFromInput(raw); if (raw !== '') updateFinancing({ ...siteContent.financing, monthlyFrom: Number(raw) }); }} onBlur={() => setMonthlyFromInput(String(siteContent.financing.monthlyFrom))} /></label>
                    <label className={styles.formField}><span>Apply link (optional)</span><input type="url" value={siteContent.financing.applyUrl} onChange={(event) => updateFinancing({ ...siteContent.financing, applyUrl: event.target.value })} placeholder="https://..." /></label>
                  </div>
                  <label className={styles.formField}><span>Supporting line</span><input value={siteContent.financing.blurb} onChange={(event) => updateFinancing({ ...siteContent.financing, blurb: event.target.value })} placeholder="Flexible financing available on approved credit." /></label>
                </SectionCard>

                <SectionCard title="Service-area cities" description={'List the towns and neighborhoods you cover. The names become on-page keywords that help you rank for "[trade] in [city]" searches — and reassure homeowners you serve their area.'} evidence={'Visitors decide "do they even serve me?" in ~3 seconds — naming their town reassures them and matches local search.'} enabled={siteContent.serviceAreas.enabled} onToggleEnabled={(value) => updateServiceAreas({ ...siteContent.serviceAreas, enabled: value })} {...contentHint(siteContent.serviceAreas.enabled, siteContent.serviceAreas.cities.filter((city) => city.trim()).length, 'city', 'cities')} open={openSection === 'serviceAreas'} onToggleOpen={() => toggleSection('serviceAreas')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.serviceAreas.title} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy</span><input value={siteContent.serviceAreas.intro} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, intro: event.target.value })} /></label>
                  <div className={styles.badgeList}>
                    {siteContent.serviceAreas.cities.map((city, index) => (
                      <div className={styles.badgeRow} key={index}>
                        <input className={styles.badgeInput} value={city} aria-label={`City ${index + 1}`} onChange={(event) => updateServiceAreas({ ...siteContent.serviceAreas, cities: siteContent.serviceAreas.cities.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} placeholder="e.g. Riverton" />
                        <button type="button" className={styles.badgeRemove} onClick={() => updateServiceAreas({ ...siteContent.serviceAreas, cities: siteContent.serviceAreas.cities.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${city || 'city'}`}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => updateServiceAreas({ ...siteContent.serviceAreas, enabled: true, cities: [...siteContent.serviceAreas.cities, ''] })}>Add city</button>
                </SectionCard>

                <SectionCard title="Certifications & awards" description={'A strip of recognizable credentials — BBB A+, EPA Lead-Safe, manufacturer certifications, "Best of" awards. Add a label and optionally a logo from your images.'} evidence="Recognizable third-party credentials (BBB A+, EPA, manufacturer certs) shortcut trust faster than anything you can say about yourself." enabled={siteContent.certifications.enabled} onToggleEnabled={(value) => updateCertifications({ ...siteContent.certifications, enabled: value })} {...contentHint(siteContent.certifications.enabled, siteContent.certifications.items.filter((item) => item.label.trim()).length, 'item')} open={openSection === 'certifications'} onToggleOpen={() => toggleSection('certifications')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.certifications.title} onChange={(event) => updateCertifications({ ...siteContent.certifications, title: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.certifications.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Item ${index + 1}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.filter((cert) => cert.id !== item.id) })}>
                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.map((cert) => cert.id === item.id ? { ...cert, label: event.target.value } : cert) })} placeholder="EPA Lead-Safe Certified" /></label>
                        <label className={styles.formField}><span>Logo image (optional)</span><select value={item.imageUrl} onChange={(event) => {
                          const image = selectableImages.find((candidate) => candidate.url === event.target.value);
                          updateCertifications({ ...siteContent.certifications, items: siteContent.certifications.items.map((cert) => cert.id === item.id ? { ...cert, imageUrl: event.target.value, imageAlt: image?.alt || cert.imageAlt || cert.label || 'Certification' } : cert) });
                        }}><option value="">No image</option>{selectableImages.map((image) => <option key={`${item.id}-${image.id}`} value={image.url}>{image.alt}</option>)}</select></label>
                        {item.imageUrl && <div className={styles.reviewImagePreview}><img src={item.imageUrl} alt={item.imageAlt || item.label || 'Certification preview'} /></div>}
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('cert'); updateCertifications({ ...siteContent.certifications, enabled: true, items: [...siteContent.certifications.items, { id, label: '', imageUrl: '', imageAlt: '' }] }); setEditingItemId(id); }}>Add certification</button>
                </SectionCard>

                <SectionCard title="Animated stats" description="A band of big numbers that count up as visitors scroll — jobs completed, years in business, % satisfaction. Instant credibility." evidence="Concrete numbers — jobs done, years in business, response time — are instant, scannable credibility next to your work." enabled={siteContent.stats.enabled} onToggleEnabled={(value) => updateStats({ ...siteContent.stats, enabled: value })} {...contentHint(siteContent.stats.enabled, siteContent.stats.items.filter((item) => item.label.trim()).length, 'stat')} open={openSection === 'stats'} onToggleOpen={() => toggleSection('stats')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.stats.title} onChange={(event) => updateStats({ ...siteContent.stats, title: event.target.value })} /></label>
                  <div className={styles.imageSlot}>
                    <div className={styles.imageSlotHead}><strong>Section photo</strong><small>The photo behind the numbers.</small></div>
                    <div className={styles.heroSlotPreview}><img src={siteContent.images.stats || site.hero_url || STOCK_SITE_IMAGES[2].url} alt="Stats section photo" /></div>
                    <div className={styles.imageSlotActions}>
                      <button type="button" className={styles.secondaryAction} onClick={() => openPicker('the stats photo', 'slot', 'stats')}>Replace photo</button>
                      {siteContent.images.stats && <button type="button" className={styles.secondaryAction} onClick={() => resetSlotImage('stats')}>Reset to default</button>}
                    </div>
                  </div>
                  <div className={styles.stackList}>
                    {siteContent.stats.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Stat ${index + 1}`} meta={`${item.prefix}${item.value.toLocaleString('en-US')}${item.suffix}`} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateStats({ ...siteContent.stats, items: siteContent.stats.items.filter((stat) => stat.id !== item.id) })}>
                        <div className={styles.formColumns}>
                          <label className={styles.formField}><span>Prefix</span><input value={item.prefix} maxLength={4} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, prefix: event.target.value } : stat) })} placeholder="$" /></label>
                          <label className={styles.formField}><span>Value</span><input type="number" min={0} value={statValueInputs[item.id] ?? String(item.value)} onChange={(event) => { const raw = event.target.value; setStatValueInputs((current) => ({ ...current, [item.id]: raw })); if (raw !== '') updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, value: Number(raw) } : stat) }); }} onBlur={() => setStatValueInputs((current) => { const next = { ...current }; delete next[item.id]; return next; })} /></label>
                          <label className={styles.formField}><span>Suffix</span><input value={item.suffix} maxLength={4} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, suffix: event.target.value } : stat) })} placeholder="+ / %" /></label>
                        </div>
                        <label className={styles.formField}><span>Label</span><input value={item.label} onChange={(event) => updateStats({ ...siteContent.stats, items: siteContent.stats.items.map((stat) => stat.id === item.id ? { ...stat, label: event.target.value } : stat) })} placeholder="Jobs completed" /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('stat'); updateStats({ ...siteContent.stats, enabled: true, items: [...siteContent.stats.items, { id, value: 0, prefix: '', suffix: '', label: '' }] }); setEditingItemId(id); }}>Add stat</button>
                </SectionCard>

                <SectionCard title="Before &amp; after" description="Drag-to-reveal comparison sliders — the most shared element on a remodeler's site. Each pair needs both a before and an after image to appear on your site." evidence="Before/after galleries paired with reviews produced 55% more leads — for trades, the transformation is the product." enabled={siteContent.beforeAfter.enabled} onToggleEnabled={(value) => updateBeforeAfter({ ...siteContent.beforeAfter, enabled: value })} {...contentHint(siteContent.beforeAfter.enabled, siteContent.beforeAfter.items.filter((pair) => pair.beforeUrl && pair.afterUrl).length, 'pair')} open={openSection === 'beforeAfter'} onToggleOpen={() => toggleSection('beforeAfter')}>
                  <label className={styles.formField}><span>Section title</span><input value={siteContent.beforeAfter.title} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, title: event.target.value })} /></label>
                  <label className={styles.formField}><span>Intro copy</span><input value={siteContent.beforeAfter.intro} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, intro: event.target.value })} /></label>
                  <div className={styles.stackList}>
                    {siteContent.beforeAfter.items.map((item, index) => (
                      <StackItem key={item.id} title={item.label.trim() || `Pair ${index + 1}`} meta={item.beforeUrl && item.afterUrl ? 'complete' : 'needs images'} editing={editingItemId === item.id} onEdit={() => setEditingItemId(item.id)} onSave={saveItem} onRemove={() => updateBeforeAfter({ ...siteContent.beforeAfter, items: siteContent.beforeAfter.items.filter((pair) => pair.id !== item.id) })}>
                        <div className={styles.imageSlots}>
                          <div className={styles.imageSlot}>
                            <div className={styles.imageSlotHead}><strong>Before</strong></div>
                            {item.beforeUrl
                              ? <div className={styles.heroSlotPreview}><img src={item.beforeUrl} alt="Before preview" /></div>
                              : <div className={styles.imageSlotEmpty}>No before photo</div>}
                            <div className={styles.imageSlotActions}>
                              <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'the before photo', kind: 'beforeAfter', baItemId: item.id, baSide: 'before' })}>{item.beforeUrl ? 'Replace photo' : 'Add photo'}</button>
                            </div>
                          </div>
                          <div className={styles.imageSlot}>
                            <div className={styles.imageSlotHead}><strong>After</strong></div>
                            {item.afterUrl
                              ? <div className={styles.heroSlotPreview}><img src={item.afterUrl} alt="After preview" /></div>
                              : <div className={styles.imageSlotEmpty}>No after photo</div>}
                            <div className={styles.imageSlotActions}>
                              <button type="button" className={styles.secondaryAction} onClick={() => setPicker({ label: 'the after photo', kind: 'beforeAfter', baItemId: item.id, baSide: 'after' })}>{item.afterUrl ? 'Replace photo' : 'Add photo'}</button>
                            </div>
                          </div>
                        </div>
                        <label className={styles.formField}><span>Caption (optional)</span><input value={item.label} onChange={(event) => updateBeforeAfter({ ...siteContent.beforeAfter, items: siteContent.beforeAfter.items.map((pair) => pair.id === item.id ? { ...pair, label: event.target.value } : pair) })} placeholder="Kitchen remodel, roof replacement..." /></label>
                      </StackItem>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryAction} onClick={() => { const id = createContentId('ba'); updateBeforeAfter({ ...siteContent.beforeAfter, enabled: true, items: [...siteContent.beforeAfter.items, { id, beforeUrl: '', beforeAlt: '', afterUrl: '', afterAlt: '', label: '' }] }); setEditingItemId(id); }}>Add pair</button>
                </SectionCard>

                <div className={styles.integrationCard}>
                  <div><strong>Google reviews import</strong><p>Importing live Google reviews requires a Places or Google Business Profile integration so we can fetch reviews with proper attribution.</p></div>
                  <button type="button" disabled>Coming next</button>
                </div>
              </div>
            )}

            {activeTab === 'publish' && (
              <div className={styles.formSection}>
                <div className={styles.sectionIntro}><h2>Publish</h2><p>Choose where homeowners can find your website.</p></div>
                <div className={styles.checklistCard}>
                  <strong>Launch checklist</strong>
                  <ul>
                    {launchChecklist.map((item) => (
                      <li key={item.label} data-done={item.done ? 'true' : 'false'}>
                        <span className={styles.checklistMark} aria-hidden="true">{item.done ? '✓' : '○'}</span>
                        <span>{item.label}</span>
                        {!item.done && <small>{item.hint}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
                <label className={styles.formField}><span>LGQ subdomain</span><div className={styles.domainControl}><input value={site.subdomain || ''} onChange={(event) => handleChange('subdomain', event.target.value.toLowerCase() || null)} placeholder="northline-builders" /><button type="button" onClick={checkSubdomain} disabled={isPending}>Check</button></div><small>{site.subdomain || 'your-business'}.{ROOT_DOMAIN}{subdomainStatus === 'available' ? ' - available' : subdomainStatus === 'taken' ? ' - unavailable' : ''}</small></label>
                <label className={styles.formField}><span>Custom domain</span><div className={styles.domainControl}><input value={site.custom_domain || ''} onChange={(event) => handleChange('custom_domain', event.target.value || null)} placeholder="www.yourbusiness.com" /><button type="button" onClick={verifyCustomDomain} disabled={isPending}>{domainStatus === 'checking' ? 'Checking...' : 'Verify DNS'}</button></div><small>{domainStatus === 'verified' ? 'Verified and connected.' : 'Add a CNAME record pointing to domains.letsgetquoted.com.'}</small></label>
                <div className={styles.dnsCard}><strong>DNS setup</strong><p>For a subdomain such as www, create a CNAME record:</p><code>www &nbsp; CNAME &nbsp; domains.letsgetquoted.com</code><p>For a root domain, use your DNS provider&apos;s CNAME flattening or redirect the root to www.</p></div>
                <div className={styles.sectionIntro}><h2>Search & sharing</h2><p>Control how your website appears in search results and social links.</p></div>
                <label className={styles.formField}><span>SEO title</span><input maxLength={60} value={site.seo_title || ''} onChange={(event) => handleChange('seo_title', event.target.value || null)} placeholder={site.company_name} /><small>{(site.seo_title || '').length}/60 characters</small></label>
                <label className={styles.formField}><span>SEO description</span><textarea rows={3} maxLength={160} value={site.seo_description || ''} onChange={(event) => handleChange('seo_description', event.target.value || null)} placeholder={site.tagline || 'Describe your services and location.'} /><small>{(site.seo_description || '').length}/160 characters. Your hero image is used for social sharing.</small></label>
                {!site.published && !site.company_name.trim() && <p className={styles.publishRequirement}>A company name is required to publish. Add one on the Business tab.</p>}
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

      {isDirty && (
        <div className={styles.savePill}>
          <span>Unsaved changes</span>
          <button type="button" onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : 'Save now'}</button>
        </div>
      )}

      {picker && (
        <ImagePickerModal
          label={picker.label}
          stockImages={STOCK_SITE_IMAGES}
          uploads={siteImages}
          galleryImages={galleryImages}
          heroUrl={site.hero_url}
          onSelectHero={selectHeroImage}
          onToggleGallery={toggleGalleryImage}
          onUpload={(image) => setSiteImages((current) => [image, ...current])}
          onClose={() => setPicker(null)}
          onReset={picker.kind === 'slot' && picker.slot && siteContent.images[picker.slot]
            ? () => { resetSlotImage(picker.slot as string); setPicker(null); }
            : undefined}
          onPick={(image) => {
            if (picker.kind === 'hero') selectHeroImage(image);
            else if (picker.kind === 'logo') handleChange('logo_url', image.url);
            else if (picker.kind === 'beforeAfter' && picker.baItemId && picker.baSide) setBeforeAfterImage(picker.baItemId, picker.baSide, image);
            else if (picker.kind === 'showcase') replaceShowcaseImage(picker.scItemId ?? null, image);
            else if (picker.kind === 'heroExtra') { if (typeof picker.heroExtraIndex === 'number') replaceHeroExtraImage(picker.heroExtraIndex, image); else addHeroExtraImage(image); }
            else if (picker.slot) assignSlotImage(picker.slot, image);
            setPicker(null);
          }}
        />
      )}
    </main>
  );
}