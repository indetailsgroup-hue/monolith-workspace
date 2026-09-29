/**
 * PlatformSearchPanel — Super Admin global search UI
 * Searches across jobs, members, and invoices for all tenants
 * Supports keyboard navigation, autocomplete, and bookmarks
 * v16.8.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  platformSearch,
  PlatformSearchOptions,
  PlatformSearchResponse,
  SearchResult,
  SearchEntityType,
} from './platformSearch';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { BookmarkPanel } from './BookmarkPanel';
import {
  getCombinedSuggestions,
  addRecentSearch,
  clearRecentSearches,
  type CombinedSuggestions,
} from './searchAutocomplete';

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface SearchFilterChipsProps {
  activeTypes: SearchEntityType[];
  onToggle: (type: SearchEntityType) => void;
  facets: Record<SearchEntityType, number>;
}

function SearchFilterChips({ activeTypes, onToggle, facets }: SearchFilterChipsProps) {
  const chips: { type: SearchEntityType; label: string; icon: string }[] = [
    { type: 'job', label: 'Jobs', icon: '📋' },
    { type: 'member', label: 'Members', icon: '👤' },
    { type: 'invoice', label: 'Invoices', icon: '💰' },
  ];

  return (
    <div className="flex gap-2 mb-3" role="group" aria-label="Search filters">
      {chips.map(({ type, label, icon }) => (
        <button
          key={type}
          onClick={() => onToggle(type)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            activeTypes.includes(type)
              ? 'bg-blue-100 text-blue-800 border border-blue-300'
              : 'bg-gray-100 text-gray-500 border border-gray-200'
          }`}
          aria-pressed={activeTypes.includes(type)}
          data-testid={`filter-${type}`}
        >
          {icon} {label} {facets[type] > 0 && `(${facets[type]})`}
        </button>
      ))}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  isActive: boolean;
  index: number;
  onNavigate: (url: string) => void;
  onHover: (index: number) => void;
}

function SearchResultItem({ result, isActive, index, onNavigate, onHover }: SearchResultItemProps) {
  const typeColors: Record<SearchEntityType, string> = {
    job: 'bg-green-100 text-green-800',
    member: 'bg-purple-100 text-purple-800',
    invoice: 'bg-amber-100 text-amber-800',
  };

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${
        isActive ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
      onClick={() => onNavigate(result.url)}
      onMouseEnter={() => onHover(index)}
      role="option"
      aria-selected={isActive}
      id={`search-result-option-${index}`}
      data-testid={`search-result-${result.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[result.entityType]}`}
            >
              {result.entityType}
            </span>
            <h4 className="text-sm font-medium text-gray-900 truncate">{result.title}</h4>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{result.subtitle}</p>
          {result.matchSnippet && (
            <p className="text-xs text-gray-400 mt-1 italic">
              Match: {result.matchField} — &quot;{result.matchSnippet}&quot;
            </p>
          )}
        </div>
        <div className="text-right ml-3 flex-shrink-0">
          <span className="text-xs text-gray-400">{result.orgName}</span>
          <p className="text-xs text-gray-300 mt-0.5">
            {new Date(result.createdAt).toLocaleDateString('th-TH')}
          </p>
        </div>
      </div>
    </div>
  );
}

interface OrgFacetListProps {
  orgFacets: { orgId: string; orgName: string; count: number }[];
  selectedOrg: string | undefined;
  onSelectOrg: (orgId: string | undefined) => void;
}

function OrgFacetList({ orgFacets, selectedOrg, onSelectOrg }: OrgFacetListProps) {
  if (orgFacets.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <h5 className="text-xs font-medium text-gray-500 mb-2">By Organization</h5>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => onSelectOrg(undefined)}
          className={`px-2 py-0.5 rounded text-xs ${
            !selectedOrg ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
          data-testid="org-filter-all"
        >
          All
        </button>
        {orgFacets.slice(0, 8).map((org) => (
          <button
            key={org.orgId}
            onClick={() => onSelectOrg(org.orgId)}
            className={`px-2 py-0.5 rounded text-xs ${
              selectedOrg === org.orgId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
            data-testid={`org-filter-${org.orgId}`}
          >
            {org.orgName} ({org.count})
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface PlatformSearchPanelProps {
  onNavigate?: (url: string) => void;
  /** For testing: inject search function */
  searchFn?: (options: PlatformSearchOptions) => Promise<PlatformSearchResponse>;
  /** Show bookmarks section */
  showBookmarks?: boolean;
}

export function PlatformSearchPanel({
  onNavigate = () => {},
  searchFn = platformSearch,
  showBookmarks = true,
}: PlatformSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<SearchEntityType[]>([
    'job',
    'member',
    'invoice',
  ]);
  const [selectedOrg, setSelectedOrg] = useState<string | undefined>();
  const [response, setResponse] = useState<PlatformSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<CombinedSuggestions>({ recent: [], popular: [] });
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalSuggestionCount = suggestions.recent.length + suggestions.popular.length;

  // ─── Search Execution ─────────────────────────────────────────────

  const executeSearch = useCallback(
    async (searchQuery: string, types: SearchEntityType[], orgId?: string) => {
      if (!searchQuery.trim()) {
        setResponse(null);
        setActiveIndex(-1);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await searchFn({
          query: searchQuery,
          entityTypes: types,
          orgId,
          limit: 20,
        });
        setResponse(result);
        setActiveIndex(-1);
        addRecentSearch(searchQuery.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResponse(null);
      } finally {
        setIsLoading(false);
      }
    },
    [searchFn]
  );

  // Debounced search on query/filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim()) {
        executeSearch(query, activeTypes, selectedOrg);
      } else {
        setResponse(null);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeTypes, selectedOrg, executeSearch]);

  // ─── Autocomplete Fetching ────────────────────────────────────────

  useEffect(() => {
    if (autocompleteRef.current) clearTimeout(autocompleteRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setSuggestions({ recent: [], popular: [] });
      setShowAutocomplete(false);
      return;
    }

    autocompleteRef.current = setTimeout(async () => {
      try {
        const combined = await getCombinedSuggestions(query.trim());
        setSuggestions(combined);
        // Show autocomplete only when there are no results yet (user is still typing)
        if (!response || response.results.length === 0) {
          setShowAutocomplete(true);
        }
      } catch {
        // Silently fail
      }
    }, 150);

    return () => {
      if (autocompleteRef.current) clearTimeout(autocompleteRef.current);
    };
  }, [query]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleToggleType = (type: SearchEntityType) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSelectSuggestion = (suggestionQuery: string) => {
    setQuery(suggestionQuery);
    setShowAutocomplete(false);
    setAutocompleteIndex(-1);
    executeSearch(suggestionQuery, activeTypes, selectedOrg);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setSuggestions((prev) => ({ ...prev, recent: [] }));
  };

  const handleBookmarkExecute = (bookmarkQuery: string, entityTypes: string[]) => {
    setQuery(bookmarkQuery);
    const types = entityTypes.filter((t): t is SearchEntityType =>
      ['job', 'member', 'invoice'].includes(t)
    );
    if (types.length > 0) setActiveTypes(types);
    executeSearch(bookmarkQuery, types.length > 0 ? types : activeTypes, selectedOrg);
  };

  const resultCount = response?.results.length || 0;

  // ─── Keyboard Navigation ──────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // When autocomplete dropdown is showing, keyboard controls it
    if (showAutocomplete && totalSuggestionCount > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setAutocompleteIndex((prev) => {
            const next = prev + 1;
            return next >= totalSuggestionCount ? 0 : next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setAutocompleteIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? totalSuggestionCount - 1 : next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (autocompleteIndex >= 0) {
            const allItems = [
              ...suggestions.recent,
              ...suggestions.popular.map((s) => s.query),
            ];
            if (allItems[autocompleteIndex]) {
              handleSelectSuggestion(allItems[autocompleteIndex]);
            }
          } else {
            // Execute current query directly
            setShowAutocomplete(false);
            executeSearch(query, activeTypes, selectedOrg);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowAutocomplete(false);
          setAutocompleteIndex(-1);
          break;
        default:
          break;
      }
      return;
    }

    // Regular results keyboard navigation
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= resultCount ? 0 : next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? resultCount - 1 : next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && response?.results[activeIndex]) {
          onNavigate(response.results[activeIndex].url);
        }
        break;
      case 'Escape':
        setQuery('');
        setResponse(null);
        setActiveIndex(-1);
        setShowAutocomplete(false);
        break;
    }
  };

  const handleInputFocus = () => {
    if (query.trim().length >= 2 && totalSuggestionCount > 0 && !response) {
      setShowAutocomplete(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowAutocomplete(true);
  };

  return (
    <div className="w-full max-w-2xl mx-auto" data-testid="platform-search-panel">
      {/* Bookmarks Section */}
      {showBookmarks && (
        <div className="mb-4" data-testid="bookmarks-section">
          <BookmarkPanel
            onExecuteBookmark={handleBookmarkExecute}
            currentQuery={query}
          />
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={() => {
            // Delay hide so click events on dropdown can fire
            setTimeout(() => setShowAutocomplete(false), 200);
          }}
          placeholder="Search jobs, members, invoices across all tenants..."
          className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          aria-label="Platform search"
          aria-expanded={showAutocomplete || (!!response && query.trim().length > 0)}
          aria-activedescendant={
            showAutocomplete && autocompleteIndex >= 0
              ? `autocomplete-option-${autocompleteIndex}`
              : activeIndex >= 0
                ? `search-result-option-${activeIndex}`
                : undefined
          }
          aria-controls="search-results-listbox"
          role="combobox"
          aria-autocomplete="list"
          data-testid="search-input"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        {isLoading && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
            data-testid="search-loading"
          >
            ⏳
          </span>
        )}

        {/* Autocomplete Dropdown */}
        <AutocompleteDropdown
          recent={suggestions.recent}
          popular={suggestions.popular}
          visible={showAutocomplete && !response}
          activeIndex={autocompleteIndex}
          onSelect={handleSelectSuggestion}
          onClearRecent={handleClearRecent}
        />
      </div>

      {/* Keyboard hint */}
      {response && response.results.length > 0 && query.trim() && (
        <div className="mt-1 text-xs text-gray-400 flex gap-3" data-testid="keyboard-hints">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc clear</span>
        </div>
      )}

      {/* Filter Chips */}
      {query.trim() && (
        <div className="mt-3">
          <SearchFilterChips
            activeTypes={activeTypes}
            onToggle={handleToggleType}
            facets={response?.facets.byType || { job: 0, member: 0, invoice: 0 }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700" data-testid="search-error">
          {error}
        </div>
      )}

      {/* Results */}
      {response && query.trim() && (
        <div className="mt-2 border border-gray-200 rounded-lg shadow-sm bg-white max-h-96 overflow-y-auto">
          {/* Stats bar */}
          <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-500 flex justify-between">
            <span data-testid="result-count">
              {response.totalCount} result{response.totalCount !== 1 ? 's' : ''} found
            </span>
            <span>{response.queryTimeMs}ms</span>
          </div>

          {/* Result list */}
          {response.results.length > 0 ? (
            <div role="listbox" id="search-results-listbox" aria-label="Search results">
              {response.results.map((result, idx) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  isActive={idx === activeIndex}
                  index={idx}
                  onNavigate={onNavigate}
                  onHover={setActiveIndex}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-400" data-testid="no-results">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {/* Org facets */}
          <div className="px-3 pb-3">
            <OrgFacetList
              orgFacets={response.facets.byOrg}
              selectedOrg={selectedOrg}
              onSelectOrg={setSelectedOrg}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PlatformSearchPanel;

// ─── Super-admin-guarded export (v16.8.0) ────────────────────────────────────
import withSuperAdminGuard from './withSuperAdminGuard';
export const GuardedPlatformSearchPanel = withSuperAdminGuard(PlatformSearchPanel);
