'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SiteEditor.module.css';
import {
  computeGbpGrowthScore,
  extractPlaceId,
  generateDirectGoogleReviewLink,
  generateGbpPost,
  generateReviewReply,
  getGoogleBusinessProfileUrls,
  type GbpPostCategory,
  type ReviewReplyTone,
} from '@/lib/google-business-growth';
import { renderQRCodeSvg } from '@/lib/qrcode';

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

function hasImportLibrary() {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    if (hasImportLibrary()) return resolve();
    const waitReady = () => {
      const startedAt = Date.now();
      const check = () => {
        if (hasImportLibrary()) return resolve();
        if (Date.now() - startedAt > 6000) return reject(new Error('Google Maps did not initialize'));
        window.setTimeout(check, 60);
      };
      check();
    };
    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      waitReady();
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&auth_referrer_policy=origin`;
    script.async = true;
    script.onload = waitReady;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

function loadPlaces(apiKey: string): Promise<google.maps.PlacesLibrary> {
  if (placesLibraryPromise) return placesLibraryPromise;
  placesLibraryPromise = loadGoogleMapsScript(apiKey).then(async () => {
    const places = (await window.google?.maps.importLibrary('places')) as google.maps.PlacesLibrary | undefined;
    if (!places?.AutocompleteSuggestion) throw new Error('Google Places is unavailable');
    return places;
  });
  return placesLibraryPromise;
}

export type GoogleImportData = {
  placeId: string;
  name: string;
  url: string;
  rating: number;
  reviewCount: number;
  reviews: {
    id: string;
    author: string;
    authorPhoto: string;
    rating: number;
    text: string;
    relativeTime: string;
    url: string;
  }[];
};

type Suggestion = { id: string; mainText: string; secondaryText: string; prediction: google.maps.places.PlacePrediction };

export type GoogleReviewImportProps = {
  placeId: string;
  name: string;
  reviewCount: number;
  importedCount: number;
  importedAt: string;
  defaultQuery?: string;
  trade?: string;
  city?: string;
  phone?: string;
  websiteUrl?: string;
  importedReviews?: {
    id: string;
    author: string;
    authorPhoto?: string;
    rating: number;
    text: string;
    relativeTime?: string;
    url?: string;
  }[];
  onImport: (data: GoogleImportData) => void;
  onClear: () => void;
};

const REVIEW_FIELDS = ['id', 'displayName', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'];

async function extractReviews(place: google.maps.places.Place): Promise<GoogleImportData> {
  const reviews = (place.reviews ?? []).slice(0, 5).map((review, index) => ({
    id: `google-review-${index + 1}`,
    author: review.authorAttribution?.displayName ?? 'Google reviewer',
    authorPhoto: review.authorAttribution?.photoURI ?? '',
    rating: typeof review.rating === 'number' ? review.rating : 5,
    text: review.text ?? '',
    relativeTime: review.relativePublishTimeDescription ?? '',
    url: review.authorAttribution?.uri ?? place.googleMapsURI ?? '',
  }));
  return {
    placeId: place.id,
    name: place.displayName ?? '',
    url: place.googleMapsURI ?? '',
    rating: typeof place.rating === 'number' ? place.rating : 0,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
    reviews,
  };
}

type HubTab = 'connect' | 'direct_link' | 'post_generator' | 'reply_assistant' | 'seo_scorecard';

export default function GoogleReviewImport({
  placeId,
  name,
  reviewCount,
  importedCount,
  importedAt,
  defaultQuery = '',
  trade = '',
  city = '',
  phone = '',
  websiteUrl = '',
  importedReviews = [],
  onImport,
  onClear,
}: GoogleReviewImportProps) {
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<HubTab>('connect');
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [guesses, setGuesses] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual Place ID entry fallback
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState('');
  const [manualBusinessName, setManualBusinessName] = useState(name || '');

  // Direct Review Link & QR Code state
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPost, setCopiedPost] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);

  // Google Post Generator state
  const [postCategory, setPostCategory] = useState<GbpPostCategory>('project_showcase');
  const [postProjectDetail, setPostProjectDetail] = useState('');
  const [postOfferDetail, setPostOfferDetail] = useState('');
  const [postTipTopic, setPostTipTopic] = useState('');
  const [postReviewerName, setPostReviewerName] = useState('');
  const [postReviewQuote, setPostReviewQuote] = useState('');

  // Review Reply Assistant state
  const [replyRating, setReplyRating] = useState<number>(5);
  const [replyReviewerName, setReplyReviewerName] = useState('');
  const [replyService, setReplyService] = useState(trade || 'service');
  const [replyCity, setReplyCity] = useState(city || '');
  const [replyTone, setReplyTone] = useState<ReviewReplyTone>('seo_boost');

  // Review Filter state
  const [reviewFilter, setReviewFilter] = useState<'all' | '5' | '4' | 'critical'>('all');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setError('Google Maps key is not configured for autocomplete (manual linking is available).');
      return;
    }
    let cancelled = false;
    loadPlaces(apiKey)
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places;
        setReady(true);
      })
      .catch(() => setError('Could not load Google Places library (manual linking is available).'));
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || placeId || query || !defaultQuery.trim()) return;
    let cancelled = false;
    fetchSuggestions(defaultQuery).then((found) => {
      if (!cancelled) setGuesses(found);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placeId, defaultQuery]);

  async function fetchSuggestions(value: string): Promise<Suggestion[]> {
    const places = placesRef.current;
    const search = value.trim();
    if (!places || search.length < 3) return [];
    try {
      const sessionToken = sessionTokenRef.current ?? new places.AutocompleteSessionToken();
      sessionTokenRef.current = sessionToken;
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: search,
        sessionToken,
        region: 'us',
      });
      return response.suggestions
        .map((suggestion, index) => {
          const prediction = suggestion.placePrediction;
          if (!prediction) return null;
          const label = prediction.text.toString();
          return {
            id: `${prediction.placeId}-${index}`,
            mainText: prediction.mainText?.toString() ?? label,
            secondaryText: prediction.secondaryText?.toString() ?? '',
            prediction,
          };
        })
        .filter((item): item is Suggestion => Boolean(item))
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  function queueSuggestions(value: string) {
    setQuery(value);
    setError(null);
    const search = value.trim();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!ready || search.length < 3) {
      setSuggestions([]);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    timerRef.current = window.setTimeout(async () => {
      const found = await fetchSuggestions(search);
      if (requestRef.current === requestId) setSuggestions(found);
    }, 220);
  }

  async function importFromPlace(run: () => Promise<google.maps.places.Place>) {
    setBusy(true);
    setError(null);
    setSuggestions([]);
    try {
      const place = run();
      const resolved = await place;
      await resolved.fetchFields({ fields: REVIEW_FIELDS });
      const data = await extractReviews(resolved);
      onImport(data);
      setQuery('');
    } catch {
      setError('Could not fetch reviews. Make sure the Places API is enabled for your key.');
    } finally {
      sessionTokenRef.current = null;
      setBusy(false);
    }
  }

  function selectSuggestion(suggestion: Suggestion) {
    void importFromPlace(async () => suggestion.prediction.toPlace());
  }

  function refresh() {
    const places = placesRef.current;
    if (!places || !placeId) return;
    void importFromPlace(async () => new places.Place({ id: placeId }));
  }

  function handleManualConnect() {
    const extracted = extractPlaceId(manualInputValue);
    if (!extracted) {
      setError('Enter a valid Google Place ID (e.g. ChIJ...) or full Google Maps review link.');
      return;
    }
    setError(null);
    const resolvedName = manualBusinessName.trim() || name || 'Linked Business Profile';
    onImport({
      placeId: extracted,
      name: resolvedName,
      url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(extracted)}`,
      rating: 5,
      reviewCount: reviewCount || 1,
      reviews: importedReviews.length > 0 ? importedReviews as GoogleImportData['reviews'] : [],
    });
    setShowManualInput(false);
    setManualInputValue('');
  }

  // Calculated URLs and Scorecard
  const gbpUrls = useMemo(() => getGoogleBusinessProfileUrls(name || defaultQuery, placeId, city), [name, defaultQuery, placeId, city]);
  const directReviewUrl = useMemo(() => generateDirectGoogleReviewLink(placeId, gbpUrls.directReviewUrl), [placeId, gbpUrls.directReviewUrl]);
  const qrSvg = useMemo(() => (directReviewUrl ? renderQRCodeSvg(directReviewUrl, 160) : ''), [directReviewUrl]);

  const growthScorecard = useMemo(
    () =>
      computeGbpGrowthScore({
        placeId,
        googleRating: 5,
        googleReviewCount: reviewCount,
        importedReviewCount: importedCount,
        autoReviewRequestsEnabled: true,
      }),
    [placeId, reviewCount, importedCount]
  );

  // Generated Google Post
  const generatedPost = useMemo(
    () =>
      generateGbpPost({
        category: postCategory,
        businessName: name || 'Our Business',
        trade: trade || 'contracting',
        city: city || 'local area',
        phone: phone || '',
        websiteUrl: websiteUrl || '',
        projectDetail: postProjectDetail,
        offerDetail: postOfferDetail,
        tipTopic: postTipTopic,
        reviewerName: postReviewerName,
        reviewQuote: postReviewQuote,
      }),
    [postCategory, name, trade, city, phone, websiteUrl, postProjectDetail, postOfferDetail, postTipTopic, postReviewerName, postReviewQuote]
  );

  // Generated Review Response
  const generatedReply = useMemo(
    () =>
      generateReviewReply({
        rating: replyRating,
        reviewerName: replyReviewerName,
        businessName: name || 'Our Business',
        serviceCompleted: replyService || trade || 'project',
        city: replyCity || city || '',
        ownerContactPhone: phone || '',
        tone: replyTone,
      }),
    [replyRating, replyReviewerName, name, replyService, trade, replyCity, city, phone, replyTone]
  );

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    if (!importedReviews || importedReviews.length === 0) return [];
    if (reviewFilter === '5') return importedReviews.filter((r) => Math.round(r.rating) === 5);
    if (reviewFilter === '4') return importedReviews.filter((r) => Math.round(r.rating) === 4);
    if (reviewFilter === 'critical') return importedReviews.filter((r) => Math.round(r.rating) <= 3);
    return importedReviews;
  }, [importedReviews, reviewFilter]);

  function copyToClipboard(text: string, setter: (val: boolean) => void) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  }

  function downloadQrSvg() {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-review-qr-${(name || 'business').toLowerCase().replace(/[^a-z0-9]/g, '-')}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadReviewIntoReplyAssistant(rev: { author: string; rating: number; text: string }) {
    setReplyReviewerName(rev.author);
    setReplyRating(Math.round(rev.rating));
    setActiveTab('reply_assistant');
  }

  return (
    <div className={styles.googleImport}>
      {/* Growth Hub Container Card */}
      <div className={styles.gbpHub}>
        <div className={styles.gbpHubHeader}>
          <div className={styles.gbpHubTitleGroup}>
            <h3 className={styles.gbpHubTitle}>
              <span aria-hidden="true">📍</span> Google Business Profile Growth Hub
            </h3>
            <span className={`${styles.gbpScorePill} ${growthScorecard.score < 60 ? styles.gbpScorePillWarn : ''}`}>
              Growth Score: {growthScorecard.score}/100 · {growthScorecard.levelLabel}
            </span>
          </div>

          <div className={styles.googleImportActions}>
            {placeId ? (
              <>
                <button type="button" onClick={refresh} disabled={busy || !ready} title="Refresh Google Places reviews">
                  {busy ? 'Refreshing…' : '↻ Refresh'}
                </button>
                <a href={gbpUrls.managerUrl} target="_blank" rel="noopener noreferrer" title="Open Google Business Profile dashboard">
                  GBP Dashboard ↗
                </a>
                <button type="button" className={styles.googleImportUnlink} onClick={onClear} disabled={busy}>
                  Unlink
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setShowManualInput(!showManualInput)}>
                {showManualInput ? 'Search Profile' : 'Paste Place ID'}
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.gbpNav} role="tablist" aria-label="Google Business Profile Tools">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connect'}
            className={`${styles.gbpTabBtn} ${activeTab === 'connect' ? styles.gbpTabBtnActive : ''}`}
            onClick={() => setActiveTab('connect')}
          >
            🔍 Connect &amp; Reviews ({importedReviews.length || importedCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'direct_link'}
            className={`${styles.gbpTabBtn} ${activeTab === 'direct_link' ? styles.gbpTabBtnActive : ''}`}
            onClick={() => setActiveTab('direct_link')}
          >
            🔗 Review Link &amp; QR Code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'post_generator'}
            className={`${styles.gbpTabBtn} ${activeTab === 'post_generator' ? styles.gbpTabBtnActive : ''}`}
            onClick={() => setActiveTab('post_generator')}
          >
            ✍️ Google Post Creator
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reply_assistant'}
            className={`${styles.gbpTabBtn} ${activeTab === 'reply_assistant' ? styles.gbpTabBtnActive : ''}`}
            onClick={() => setActiveTab('reply_assistant')}
          >
            💬 AI Reply Playbook
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'seo_scorecard'}
            className={`${styles.gbpTabBtn} ${activeTab === 'seo_scorecard' ? styles.gbpTabBtnActive : ''}`}
            onClick={() => setActiveTab('seo_scorecard')}
          >
            📈 3-Pack Growth Audit
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.gbpTabBody}>
          {/* TAB 1: CONNECT & SYNC */}
          {activeTab === 'connect' && (
            <>
              {placeId ? (
                <div className={styles.googleImportLinked}>
                  <div>
                    <strong>✓ {name || 'Linked Google Business Profile'}</strong>
                    <small>
                      {importedCount} reviews imported · Place ID: <code style={{ fontSize: '0.74rem' }}>{placeId.slice(0, 16)}…</code>
                      {importedAt ? ` · synced ${importedAt}` : ''}
                    </small>
                  </div>
                  <div className={styles.googleImportActions}>
                    {gbpUrls.directReviewUrl && (
                      <a href={gbpUrls.directReviewUrl} target="_blank" rel="noopener noreferrer">
                        Test Review Form ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : showManualInput ? (
                <div className={styles.gbpCardBox}>
                  <div className={styles.gbpCardHeader}>
                    <strong>Manual Place ID &amp; Google Link Connection</strong>
                    <small>Direct connection without Places autocomplete</small>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className={styles.gbpCopyInput}
                      placeholder="Business Name (e.g. Apex Roofing)"
                      value={manualBusinessName}
                      onChange={(e) => setManualBusinessName(e.target.value)}
                    />
                    <input
                      type="text"
                      className={styles.gbpCopyInput}
                      placeholder="Google Place ID (e.g. ChIJ...) or full Google Maps URL"
                      value={manualInputValue}
                      onChange={(e) => setManualInputValue(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button type="button" className={styles.gbpBtn} onClick={() => setShowManualInput(false)}>
                      Cancel
                    </button>
                    <button type="button" className={`${styles.gbpBtn} ${styles.gbpBtnPrimary}`} onClick={handleManualConnect}>
                      Verify &amp; Link Profile
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.googleImportSearch}>
                    <input
                      type="text"
                      value={query}
                      placeholder={ready ? 'Search your business name + city…' : 'Loading Google Places…'}
                      disabled={!ready || busy}
                      onChange={(event) => queueSuggestions(event.target.value)}
                      aria-label="Find your Google Business"
                    />
                    {suggestions.length > 0 && (
                      <div className={styles.googleImportSuggestions} role="listbox">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectSuggestion(suggestion)}
                          >
                            <span>{suggestion.mainText}</span>
                            {suggestion.secondaryText && <small>{suggestion.secondaryText}</small>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!query && guesses.length > 0 && (
                    <div className={styles.googleImportGuess}>
                      <small>Is this you?</small>
                      {guesses.map((guess) => (
                        <button key={guess.id} type="button" disabled={busy} onClick={() => selectSuggestion(guess)}>
                          <span>{guess.mainText}</span>
                          {guess.secondaryText && <small>{guess.secondaryText}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Imported Reviews Preview & Filter */}
              {importedReviews.length > 0 && (
                <div className={styles.gbpCardBox}>
                  <div className={styles.gbpCardHeader}>
                    <strong>Imported Google Reviews ({filteredReviews.length})</strong>
                    <div className={styles.gbpPillGroup}>
                      <button
                        type="button"
                        className={`${styles.gbpPillBtn} ${reviewFilter === 'all' ? styles.gbpPillBtnActive : ''}`}
                        onClick={() => setReviewFilter('all')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`${styles.gbpPillBtn} ${reviewFilter === '5' ? styles.gbpPillBtnActive : ''}`}
                        onClick={() => setReviewFilter('5')}
                      >
                        5★ Only
                      </button>
                      <button
                        type="button"
                        className={`${styles.gbpPillBtn} ${reviewFilter === '4' ? styles.gbpPillBtnActive : ''}`}
                        onClick={() => setReviewFilter('4')}
                      >
                        4★
                      </button>
                      <button
                        type="button"
                        className={`${styles.gbpPillBtn} ${reviewFilter === 'critical' ? styles.gbpPillBtnActive : ''}`}
                        onClick={() => setReviewFilter('critical')}
                      >
                        ≤ 3★
                      </button>
                    </div>
                  </div>

                  <div className={styles.googleReviewPreview}>
                    {filteredReviews.map((review) => (
                      <div key={review.id} className={styles.googleReviewPreviewItem}>
                        <div>
                          <span>
                            {'★'.repeat(Math.round(review.rating))}
                            <strong> {review.author}</strong>
                            {review.relativeTime && <em> · {review.relativeTime}</em>}
                          </span>
                          <button
                            type="button"
                            className={styles.gbpPillBtn}
                            onClick={() => loadReviewIntoReplyAssistant(review)}
                            title="Open in AI Reply Playbook"
                          >
                            Draft Reply ✍️
                          </button>
                        </div>
                        <p>{review.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: DIRECT REVIEW LINK & QR CODE */}
          {activeTab === 'direct_link' && (
            <div className={styles.gbpCardBox}>
              <div className={styles.gbpCardHeader}>
                <strong>Direct 5-Star Google Review Submission Link</strong>
                <small>Bypasses Google Search and opens the review box directly</small>
              </div>

              {directReviewUrl ? (
                <>
                  <div className={styles.gbpCopyRow}>
                    <input type="text" readOnly value={directReviewUrl} className={styles.gbpCopyInput} aria-label="Direct Review Link" />
                    <button
                      type="button"
                      className={`${styles.gbpBtn} ${copiedLink ? styles.gbpBtnSuccess : styles.gbpBtnPrimary}`}
                      onClick={() => copyToClipboard(directReviewUrl, setCopiedLink)}
                    >
                      {copiedLink ? '✓ Copied' : 'Copy Link'}
                    </button>
                    <a href={directReviewUrl} target="_blank" rel="noopener noreferrer" className={styles.gbpBtn}>
                      Test Link ↗
                    </a>
                  </div>

                  <div className={styles.gbpQrFlex}>
                    <div className={styles.gbpQrGraphic} dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="Google Review QR Code" />
                    <div className={styles.gbpQrInfo}>
                      <strong>Print-Ready Jobsite &amp; Invoice QR Code</strong>
                      <p>
                        Homeowners scan this code with their smartphone camera to submit an instant Google review without typing or searching.
                      </p>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <button type="button" className={`${styles.gbpBtn} ${styles.gbpBtnPrimary}`} onClick={downloadQrSvg}>
                          ⬇ Download Vector QR Code (.SVG)
                        </button>
                      </div>
                      <small style={{ color: 'var(--muted-2)', marginTop: '0.2rem' }}>
                        Ideal for truck wraps, job trailers, yard signs, leave-behind cards, and paper invoices.
                      </small>
                    </div>
                  </div>
                </>
              ) : (
                <p className={styles.fieldHint}>Connect your Google Business Profile in Tab 1 to generate your direct review link and QR code.</p>
              )}
            </div>
          )}

          {/* TAB 3: GOOGLE POST CREATOR */}
          {activeTab === 'post_generator' && (
            <div className={styles.gbpCardBox}>
              <div className={styles.gbpCardHeader}>
                <strong>Google Business Profile Post Generator</strong>
                <small>Weekly Google Posts signal active business authority to Google Maps algorithms</small>
              </div>

              {/* Category Pills */}
              <div className={styles.gbpPillGroup}>
                <button
                  type="button"
                  className={`${styles.gbpPillBtn} ${postCategory === 'project_showcase' ? styles.gbpPillBtnActive : ''}`}
                  onClick={() => setPostCategory('project_showcase')}
                >
                  🔨 Project Showcase
                </button>
                <button
                  type="button"
                  className={`${styles.gbpPillBtn} ${postCategory === 'seasonal_offer' ? styles.gbpPillBtnActive : ''}`}
                  onClick={() => setPostCategory('seasonal_offer')}
                >
                  ⭐ Seasonal Offer
                </button>
                <button
                  type="button"
                  className={`${styles.gbpPillBtn} ${postCategory === 'maintenance_tip' ? styles.gbpPillBtnActive : ''}`}
                  onClick={() => setPostCategory('maintenance_tip')}
                >
                  💡 Pro Maintenance Tip
                </button>
                <button
                  type="button"
                  className={`${styles.gbpPillBtn} ${postCategory === 'review_celebration' ? styles.gbpPillBtnActive : ''}`}
                  onClick={() => setPostCategory('review_celebration')}
                >
                  🌟 Review Spotlight
                </button>
              </div>

              {/* Dynamic Inputs */}
              {postCategory === 'project_showcase' && (
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="Project details (e.g., 2,400 sqft architectural shingle roof with seamless gutters)"
                  value={postProjectDetail}
                  onChange={(e) => setPostProjectDetail(e.target.value)}
                />
              )}
              {postCategory === 'seasonal_offer' && (
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="Offer details (e.g., $250 off any job over $2,500 booked this month)"
                  value={postOfferDetail}
                  onChange={(e) => setPostOfferDetail(e.target.value)}
                />
              )}
              {postCategory === 'maintenance_tip' && (
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="Tip summary (e.g., Inspect caulking around windows before winter storms)"
                  value={postTipTopic}
                  onChange={(e) => setPostTipTopic(e.target.value)}
                />
              )}
              {postCategory === 'review_celebration' && (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  <input
                    type="text"
                    className={styles.gbpCopyInput}
                    placeholder="Reviewer Name (e.g., Jane Miller)"
                    value={postReviewerName}
                    onChange={(e) => setPostReviewerName(e.target.value)}
                  />
                  <input
                    type="text"
                    className={styles.gbpCopyInput}
                    placeholder='Review Quote (e.g., "Fast, clean, and honest pricing.")'
                    value={postReviewQuote}
                    onChange={(e) => setPostReviewQuote(e.target.value)}
                  />
                </div>
              )}

              {/* Post Output Area */}
              <textarea
                className={styles.gbpPostArea}
                readOnly
                value={generatedPost.fullPostText}
                aria-label="Generated Google Post Text"
              />

              <div className={styles.gbpPostFooter}>
                <span>
                  Length: {generatedPost.fullPostText.length} characters · Recommended CTA: <strong>{generatedPost.ctaLabel}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className={`${styles.gbpBtn} ${copiedPost ? styles.gbpBtnSuccess : styles.gbpBtnPrimary}`}
                    onClick={() => copyToClipboard(generatedPost.fullPostText, setCopiedPost)}
                  >
                    {copiedPost ? '✓ Post Copied' : 'Copy Post Text'}
                  </button>
                  <a href={gbpUrls.managerUrl} target="_blank" rel="noopener noreferrer" className={styles.gbpBtn}>
                    Open Google Business to Post ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI REVIEW REPLY ASSISTANT */}
          {activeTab === 'reply_assistant' && (
            <div className={styles.gbpCardBox}>
              <div className={styles.gbpCardHeader}>
                <strong>AI Review Response Playbook</strong>
                <small>Responding to reviews within 24h improves local conversion rates and trust</small>
              </div>

              {/* Star Rating Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Rating:</span>
                <div className={styles.gbpPillGroup}>
                  {[5, 4, 3, 2, 1].map((starsNum) => (
                    <button
                      key={starsNum}
                      type="button"
                      className={`${styles.gbpPillBtn} ${replyRating === starsNum ? styles.gbpPillBtnActive : ''}`}
                      onClick={() => setReplyRating(starsNum)}
                    >
                      {'★'.repeat(starsNum)} ({starsNum}★)
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="Reviewer Name (e.g. Michael)"
                  value={replyReviewerName}
                  onChange={(e) => setReplyReviewerName(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="Service Completed (e.g. bathroom remodel)"
                  value={replyService}
                  onChange={(e) => setReplyService(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.gbpCopyInput}
                  placeholder="City / Area (e.g. Denver)"
                  value={replyCity}
                  onChange={(e) => setReplyCity(e.target.value)}
                />
              </div>

              {replyRating >= 5 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted-2)' }}>Tone:</span>
                  <div className={styles.gbpPillGroup}>
                    <button
                      type="button"
                      className={`${styles.gbpPillBtn} ${replyTone === 'seo_boost' ? styles.gbpPillBtnActive : ''}`}
                      onClick={() => setReplyTone('seo_boost')}
                    >
                      🚀 SEO Keyword Boost (Recommended)
                    </button>
                    <button
                      type="button"
                      className={`${styles.gbpPillBtn} ${replyTone === 'enthusiastic' ? styles.gbpPillBtnActive : ''}`}
                      onClick={() => setReplyTone('enthusiastic')}
                    >
                      🎉 Enthusiastic &amp; Warm
                    </button>
                    <button
                      type="button"
                      className={`${styles.gbpPillBtn} ${replyTone === 'professional' ? styles.gbpPillBtnActive : ''}`}
                      onClick={() => setReplyTone('professional')}
                    >
                      👔 Professional
                    </button>
                  </div>
                </div>
              )}

              {/* Generated Response */}
              <textarea
                className={styles.gbpPostArea}
                readOnly
                value={generatedReply}
                aria-label="Generated Review Response"
                style={{ minHeight: '90px' }}
              />

              <div className={styles.gbpPostFooter}>
                <span style={{ color: replyRating <= 3 ? '#ef4444' : 'var(--muted-2)' }}>
                  {replyRating <= 3
                    ? '🛡️ FTC & Google Compliant: Courteous de-escalation directing to private resolution.'
                    : '✓ Local SEO Optimized: Mentions completed trade service and target locality.'}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className={`${styles.gbpBtn} ${copiedReply ? styles.gbpBtnSuccess : styles.gbpBtnPrimary}`}
                    onClick={() => copyToClipboard(generatedReply, setCopiedReply)}
                  >
                    {copiedReply ? '✓ Reply Copied' : 'Copy Reply'}
                  </button>
                  <a href={gbpUrls.googleSearchManageUrl} target="_blank" rel="noopener noreferrer" className={styles.gbpBtn}>
                    Open in Google to Reply ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LOCAL SEO 3-PACK SCORECARD */}
          {activeTab === 'seo_scorecard' && (
            <div className={styles.gbpCardBox}>
              <div className={styles.gbpCardHeader}>
                <strong>Google Maps 3-Pack Growth Audit</strong>
                <span className={styles.gbpScorePill}>Score: {growthScorecard.score}/100</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted-2)', lineHeight: 1.45 }}>{growthScorecard.summary}</p>

              <div className={styles.gbpScoreGrid}>
                {growthScorecard.checklist.map((item) => (
                  <div key={item.id} className={styles.gbpScoreItem}>
                    <span className={styles.gbpScoreIcon} aria-hidden="true">
                      {item.status === 'complete' ? '✅' : item.status === 'warning' ? '⚠️' : '❌'}
                    </span>
                    <div className={styles.gbpScoreMeta}>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      {item.tip && <p style={{ color: '#ff9b54', marginTop: '0.2rem' }}>💡 Tip: {item.tip}</p>}
                    </div>
                    <span
                      className={`${styles.gbpScoreTag} ${
                        item.status === 'complete'
                          ? styles.gbpScoreTagComplete
                          : item.status === 'warning'
                          ? styles.gbpScoreTagWarning
                          : styles.gbpScoreTagMissing
                      }`}
                    >
                      {item.actionLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {busy && !placeId && <p className={styles.googleImportBusy}>Fetching reviews…</p>}
      {error && <p className={styles.googleImportError}>{error}</p>}
      <p className={styles.fieldHint}>
        Google returns up to 5 verified reviews via Google Places. Use the Growth Hub tools to draft Google Posts, generate direct QR codes,
        and reply with local SEO keywords.
      </p>
    </div>
  );
}
