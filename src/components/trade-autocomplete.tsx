'use client';

import { useId, useRef, useState } from 'react';
import { suggestTrades, type TradeSuggestion } from '@/lib/trade-suggest';

/**
 * "Field of work / trade", with a guess at what you are typing.
 *
 * Wears the address autocomplete's clothes on purpose — the two are the only
 * comboboxes in Settings and behaving differently would be the only thing
 * anybody noticed about either.
 *
 * Free text throughout. Trades are stranger and more specific than any list,
 * and this one exists to save typing, not to police the answer.
 */
export default function TradeAutocomplete({
  id,
  name,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const listboxId = useId();
  const [value, setValue] = useState(defaultValue ?? '');
  const [suggestions, setSuggestions] = useState<TradeSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const blurTimer = useRef<number | null>(null);

  function offer(next: string) {
    setSuggestions(suggestTrades(next));
    setHighlighted(-1);
  }

  function choose(suggestion: TradeSuggestion) {
    setValue(suggestion.value);
    setSuggestions([]);
    setHighlighted(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && highlighted >= 0) {
      // Only when something is highlighted. Otherwise Enter submits the form,
      // which is what Enter in a settings field is supposed to do.
      event.preventDefault();
      choose(suggestions[highlighted]);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
      setHighlighted(-1);
    }
  }

  return (
    <div className={`address-autocomplete${suggestions.length > 0 ? ' is-open' : ''}`}>
      <input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        // Off, or the browser's own saved-value dropdown covers ours.
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          offer(event.currentTarget.value);
        }}
        onFocus={(event) => offer(event.currentTarget.value)}
        onBlur={() => {
          // Delayed, so a click on a suggestion lands before the list closes.
          blurTimer.current = window.setTimeout(() => setSuggestions([]), 140);
        }}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 ? (
        <div id={listboxId} className="address-autocomplete-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.value}-${index}`}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(suggestion)}
            >
              <span>{suggestion.value}</span>
              {suggestion.note ? <small>{suggestion.note}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
