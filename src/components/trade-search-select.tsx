'use client';

import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { TRADES, type Trade } from '@/lib/trades';
import { matchTrades, findBestTradeMatch } from '@/lib/trade-matching';

export type TradeSearchSelectProps = {
  id?: string;
  name?: string;
  value: string; // Trade slug or ''
  onChange: (slug: string) => void;
  businessName?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  className?: string;
};

const POPULAR_TRADE_SLUGS = [
  'plumbers',
  'electricians',
  'hvac',
  'roofers',
  'landscapers',
  'painters',
  'cleaning-services',
  'remodelers',
  'handyman',
  'concrete',
];

/**
 * Heuristically extracts a trade from the business name.
 * e.g. "Midwest Glass Company" -> "Glass & Mirror Companies"
 *      "Brookhaven Plumbing" -> "Plumbers"
 *      "Summit Roofing & Gutters" -> "Roofers"
 */
export function inferTradeFromBusinessName(businessName?: string | null): Trade | null {
  if (!businessName) return null;
  const cleaned = businessName.trim();
  if (!cleaned) return null;

  // Split words and strip common noise words
  const stopWords = new Set([
    'and', '&', 'the', 'of', 'co', 'co.', 'company', 'inc', 'inc.', 'llc', 'ltd',
    'services', 'service', 'solutions', 'group', 'pros', 'pro', 'care', 'systems',
    'specialists', 'contracting', 'contractors', 'enterprises', 'enterprise',
    'holdings', 'holding', 'ventures', 'venture', 'corp', 'corporation', 'agency',
    'associates', 'consulting', 'consultants', 'industries', 'industry', 'brothers',
    'sons', 'son', 'family', 'llp', 'pllc', 'management', 'mgmt', 'properties',
  ]);

  const words = cleaned
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));

  // 1. Test 2-word combinations with high confidence (e.g. "Glass & Mirror", "Tree Care")
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    const match = findBestTradeMatch(pair, 550);
    if (match) return match;
  }

  // 2. Test individual words with high confidence (e.g. "Glass", "Plumbing", "Roofing")
  for (const word of words) {
    const match = findBestTradeMatch(word, 550);
    if (match) return match;
  }

  return null;
}

export default function TradeSearchSelect({
  id = 'wf-trade',
  name = 'trade',
  value,
  onChange,
  businessName = '',
  placeholder = 'Search your trade (e.g. Plumber, HVAC, Glass)…',
  disabled = false,
  autoFocus = false,
  required = false,
  className = '',
}: TradeSearchSelectProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);

  // Find currently selected trade object
  const selectedTrade = useMemo(() => {
    return value ? TRADES.find((t) => t.slug === value) ?? null : null;
  }, [value]);

  // Detected trade from business name
  const inferredTrade = useMemo(() => {
    return inferTradeFromBusinessName(businessName);
  }, [businessName]);

  const [inputValue, setInputValue] = useState(
    selectedTrade ? selectedTrade.name : value === '' ? '' : value,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Keep inputValue in sync if value changes externally
  useEffect(() => {
    if (selectedTrade) {
      setInputValue(selectedTrade.name);
    } else if (value === '') {
      // If explicit empty and user hasn't typed anything custom
      if (inputValue === 'Something else' || !inputValue) {
        setInputValue('');
      }
    }
  }, [value, selectedTrade]);

  // Build the list of trade options based on query
  const query = inputValue.trim();
  const matchingTrades = useMemo(() => {
    if (!query || (selectedTrade && query.toLowerCase() === selectedTrade.name.toLowerCase())) {
      return [];
    }
    return matchTrades(query, { limit: 8 });
  }, [query, selectedTrade]);

  const popularTrades = useMemo(() => {
    return POPULAR_TRADE_SLUGS
      .map((slug) => TRADES.find((t) => t.slug === slug))
      .filter((t): t is Trade => Boolean(t));
  }, []);

  // Compute all visible selectable items in order for keyboard navigation
  type SuggestionItem =
    | { type: 'inferred'; trade: Trade }
    | { type: 'match'; trade: Trade }
    | { type: 'popular'; trade: Trade }
    | { type: 'something_else' };

  const items: SuggestionItem[] = useMemo(() => {
    const list: SuggestionItem[] = [];

    if (query && (!selectedTrade || query.toLowerCase() !== selectedTrade.name.toLowerCase())) {
      // Searching state
      for (const t of matchingTrades) {
        list.push({ type: 'match', trade: t });
      }
    } else {
      // Default/Empty query state
      if (inferredTrade && inferredTrade.slug !== value) {
        list.push({ type: 'inferred', trade: inferredTrade });
      }
      for (const t of popularTrades) {
        if (!inferredTrade || t.slug !== inferredTrade.slug) {
          list.push({ type: 'popular', trade: t });
        }
      }
    }

    // Always include "Something else" as the last option
    list.push({ type: 'something_else' });

    return list;
  }, [query, selectedTrade, matchingTrades, inferredTrade, popularTrades, value]);

  function handleSelect(item: SuggestionItem) {
    if (item.type === 'something_else') {
      onChange('');
      setInputValue('Something else');
    } else {
      onChange(item.trade.slug);
      setInputValue(item.trade.name);
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setInputValue(next);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // If cleared, trigger empty
    if (!next.trim()) {
      onChange('');
    }
  }

  function handleInputFocus() {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }

  function handleInputBlur() {
    // Delay to let click on list item register
    blurTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);

      // If user typed something but didn't pick from dropdown, try to auto-resolve
      const trimmed = inputValue.trim();
      if (!trimmed || trimmed.toLowerCase() === 'something else') {
        onChange('');
        return;
      }

      if (selectedTrade && trimmed.toLowerCase() === selectedTrade.name.toLowerCase()) {
        return;
      }

      const best = findBestTradeMatch(trimmed, 250);
      if (best) {
        onChange(best.slug);
        setInputValue(best.name);
      }
    }, 180);
  }

  function handleClear(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onChange('');
    setInputValue('');
    setIsOpen(true);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
    }

    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < items.length) {
        event.preventDefault();
        handleSelect(items[highlightedIndex]);
      } else if (isOpen && items.length > 0 && query && matchingTrades.length > 0) {
        // Auto-select first matching result on Enter
        event.preventDefault();
        handleSelect(items[0]);
      }
      // If closed, let Enter trigger standard form submit
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else if (event.key === 'Tab') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < items.length) {
        handleSelect(items[highlightedIndex]);
      }
      setIsOpen(false);
    }
  }

  const activeDescendantId =
    isOpen && highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined;

  return (
    <div className={`trade-search-select ${isOpen ? 'is-open' : ''} ${className}`}>
      {/* Hidden input ensures standard form data submission sends the canonical slug */}
      <input type="hidden" name={name} value={value} />

      <div className="trade-search-input-box">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          required={required}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
        />

        <div className="trade-search-controls">
          {inputValue && (
            <button
              type="button"
              tabIndex={-1}
              className="trade-search-clear-btn"
              onClick={handleClear}
              title="Clear selection"
              aria-label="Clear selection"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            className="trade-search-chevron-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isOpen) {
                setIsOpen(false);
              } else {
                inputRef.current?.focus();
                setIsOpen(true);
              }
            }}
            aria-label="Toggle trade list"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && (
        <div id={listboxId} className="trade-search-dropdown" role="listbox" aria-label="Trades">
          {/* If searching and no matches */}
          {query && matchingTrades.length === 0 && (
            <div className="trade-search-empty-notice">
              <span>No direct trade match for &ldquo;{query}&rdquo;</span>
              <small>You can choose &ldquo;Something else&rdquo; below to use a custom specialty.</small>
            </div>
          )}

          {/* Render suggestions */}
          {items.map((item, index) => {
            const isHighlighted = index === highlightedIndex;
            const optId = `${listboxId}-opt-${index}`;

            if (item.type === 'inferred') {
              const isSelected = value === item.trade.slug;
              return (
                <div key={`inferred-${item.trade.slug}`}>
                  <div className="trade-search-group-header">
                    <span>✨ SUGGESTED FROM BUSINESS NAME</span>
                  </div>
                  <button
                    id={optId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`trade-search-option inferred-option ${isHighlighted ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item);
                    }}
                  >
                    <div className="trade-search-option-main">
                      <span className="trade-search-option-name">{item.trade.name}</span>
                      <span className="trade-search-badge">Recommended</span>
                    </div>
                    <small className="trade-search-option-desc">
                      {item.trade.services.slice(0, 3).join(' · ')}
                    </small>
                  </button>
                </div>
              );
            }

            if (item.type === 'popular') {
              const isSelected = value === item.trade.slug;
              const isFirstPopular =
                index === 0 || (index === 1 && items[0]?.type === 'inferred');

              return (
                <div key={`popular-${item.trade.slug}`}>
                  {isFirstPopular && (
                    <div className="trade-search-group-header">
                      <span>POPULAR TRADES</span>
                    </div>
                  )}
                  <button
                    id={optId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`trade-search-option ${isHighlighted ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item);
                    }}
                  >
                    <div className="trade-search-option-main">
                      <span className="trade-search-option-name">{item.trade.name}</span>
                      {isSelected && <span className="trade-search-check">✓</span>}
                    </div>
                    <small className="trade-search-option-desc">
                      {item.trade.services.slice(0, 3).join(' · ')}
                    </small>
                  </button>
                </div>
              );
            }

            if (item.type === 'match') {
              const isSelected = value === item.trade.slug;
              return (
                <button
                  key={`match-${item.trade.slug}`}
                  id={optId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`trade-search-option ${isHighlighted ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(item);
                  }}
                >
                  <div className="trade-search-option-main">
                    <span className="trade-search-option-name">{item.trade.name}</span>
                    {isSelected && <span className="trade-search-check">✓</span>}
                  </div>
                  <small className="trade-search-option-desc">
                    {item.trade.services.slice(0, 3).join(' · ')}
                  </small>
                </button>
              );
            }

            // item.type === 'something_else'
            const isSelected = value === '';
            return (
              <div key="something-else" className="trade-search-fallback-divider">
                <button
                  id={optId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`trade-search-option something-else-option ${isHighlighted ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(item);
                  }}
                >
                  <div className="trade-search-option-main">
                    <span className="trade-search-option-name">Something else</span>
                    {isSelected && <span className="trade-search-check">✓</span>}
                  </div>
                  <small className="trade-search-option-desc">
                    Custom specialty or unlisted trade &mdash; tailor it anytime in Settings
                  </small>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
