/**
 * AutocompleteDropdown.tsx — Type-ahead suggestion dropdown
 * Integrates into PlatformSearchPanel with recent + popular suggestions
 * v16.7.0
 */

import React from 'react';
import type { AutocompleteSuggestion } from './searchAutocomplete';

export interface AutocompleteDropdownProps {
  recent: string[];
  popular: AutocompleteSuggestion[];
  visible: boolean;
  activeIndex: number;
  onSelect: (query: string) => void;
  onClearRecent: () => void;
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  recent,
  popular,
  visible,
  activeIndex,
  onSelect,
  onClearRecent,
}) => {
  if (!visible || (recent.length === 0 && popular.length === 0)) return null;

  let itemIndex = 0;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className="autocomplete-dropdown"
      data-testid="autocomplete-dropdown"
    >
      {/* ─── Recent Searches ──────────────────────── */}
      {recent.length > 0 && (
        <div className="autocomplete-section">
          <div className="autocomplete-section-header">
            <span className="section-label">Recent</span>
            <button
              className="clear-recent-btn"
              onClick={onClearRecent}
              aria-label="Clear recent searches"
              data-testid="clear-recent-btn"
            >
              Clear
            </button>
          </div>
          {recent.map((query) => {
            const idx = itemIndex++;
            return (
              <div
                key={`recent-${query}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={`autocomplete-item ${idx === activeIndex ? 'active' : ''}`}
                data-testid={`autocomplete-recent-${idx}`}
                onClick={() => onSelect(query)}
              >
                <span className="item-icon">🕒</span>
                <span className="item-text">{query}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Popular Suggestions ─────────────────── */}
      {popular.length > 0 && (
        <div className="autocomplete-section">
          <div className="autocomplete-section-header">
            <span className="section-label">Popular</span>
          </div>
          {popular.map((suggestion) => {
            const idx = itemIndex++;
            return (
              <div
                key={`popular-${suggestion.query}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={`autocomplete-item ${idx === activeIndex ? 'active' : ''}`}
                data-testid={`autocomplete-popular-${idx}`}
                onClick={() => onSelect(suggestion.query)}
              >
                <span className="item-icon">🔥</span>
                <span className="item-text">{suggestion.query}</span>
                <span className="item-freq">{suggestion.frequency}×</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AutocompleteDropdown;
