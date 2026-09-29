/**
 * v16.7 Tests — Autocomplete, Bookmarks, CSV Export
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mock Supabase ───────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../core/auth/supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// Helper to set up mock chain for .from().select().order()
function setupFromChain(resolvedValue: { data: any; error: any }) {
  mockFrom.mockReturnValue({
    select: () => ({
      order: () => Promise.resolve(resolvedValue),
    }),
    insert: (row: any) => ({
      select: () => ({
        single: () => Promise.resolve(resolvedValue),
      }),
    }),
    delete: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
    update: (data: any) => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Autocomplete Data Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('searchAutocomplete', () => {
  let mod: typeof import('../admin/searchAutocomplete');

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../admin/searchAutocomplete');
  });

  it('fetchAutocompleteSuggestions returns empty for short prefix', async () => {
    const result = await mod.fetchAutocompleteSuggestions('a');
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('fetchAutocompleteSuggestions calls RPC with correct params', async () => {
    mockRpc.mockResolvedValue({
      data: [{ query_text: 'test query', frequency: 5, last_used: '2026-01-01' }],
      error: null,
    });
    const result = await mod.fetchAutocompleteSuggestions('te');
    expect(mockRpc).toHaveBeenCalledWith('get_search_suggestions', {
      query_prefix: 'te',
      result_limit: 8,
    });
    expect(result).toEqual([{ query: 'test query', frequency: 5, lastUsed: '2026-01-01' }]);
  });

  it('fetchAutocompleteSuggestions handles RPC error gracefully', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const result = await mod.fetchAutocompleteSuggestions('err');
    expect(result).toEqual([]);
  });

  it('getRecentSearches returns empty initially', () => {
    expect(mod.getRecentSearches()).toEqual([]);
  });

  it('addRecentSearch stores and deduplicates', () => {
    mod.addRecentSearch('hello');
    mod.addRecentSearch('world');
    mod.addRecentSearch('hello'); // moves to front
    const recent = mod.getRecentSearches();
    expect(recent).toEqual(['hello', 'world']);
  });

  it('addRecentSearch enforces max 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      mod.addRecentSearch(`q${i}`);
    }
    expect(mod.getRecentSearches()).toHaveLength(10);
    expect(mod.getRecentSearches()[0]).toBe('q14');
  });

  it('clearRecentSearches removes all', () => {
    mod.addRecentSearch('test');
    mod.clearRecentSearches();
    expect(mod.getRecentSearches()).toEqual([]);
  });

  it('getCombinedSuggestions merges recent + popular', async () => {
    mod.addRecentSearch('test query');
    mod.addRecentSearch('testing'); // 'testing' is now first (unshift)
    mockRpc.mockResolvedValue({
      data: [{ query_text: 'test popular', frequency: 10, last_used: '2026-01-01' }],
      error: null,
    });
    const combined = await mod.getCombinedSuggestions('test');
    // Both match "test" filter, order is most-recent-first
    expect(combined.recent).toEqual(['testing', 'test query']);
    expect(combined.popular).toHaveLength(1);
    expect(combined.popular[0].query).toBe('test popular');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Bookmarks Data Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('searchBookmarks', () => {
  let bookmarks: typeof import('../admin/searchBookmarks');

  beforeEach(async () => {
    vi.resetModules();
    bookmarks = await import('../admin/searchBookmarks');
  });

  it('fetchBookmarks calls supabase from search_bookmarks', async () => {
    setupFromChain({ data: [], error: null });
    const result = await bookmarks.fetchBookmarks();
    expect(mockFrom).toHaveBeenCalledWith('search_bookmarks');
    expect(result).toEqual([]);
  });

  it('createBookmark returns mapped row', async () => {
    setupFromChain({
      data: {
        id: 'bm-1',
        user_id: 'u-1',
        label: 'My Search',
        query: 'test',
        entity_types: ['job'],
        org_filter: null,
        use_count: 0,
        last_used_at: '2026-01-01',
        created_at: '2026-01-01',
      },
      error: null,
    });
    const result = await bookmarks.createBookmark({
      label: 'My Search',
      query: 'test',
      entityTypes: ['job'],
    });
    expect(result.id).toBe('bm-1');
    expect(result.label).toBe('My Search');
    expect(result.entityTypes).toEqual(['job']);
  });

  it('deleteBookmark calls from with search_bookmarks', async () => {
    setupFromChain({ data: null, error: null });
    await bookmarks.deleteBookmark('bm-1');
    expect(mockFrom).toHaveBeenCalledWith('search_bookmarks');
  });

  it('incrementBookmarkUse calls RPC', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await bookmarks.incrementBookmarkUse('bm-1');
    expect(mockRpc).toHaveBeenCalledWith('increment_bookmark_use', { bookmark_id: 'bm-1' });
  });

  it('updateBookmarkLabel calls from with search_bookmarks', async () => {
    setupFromChain({ data: null, error: null });
    await bookmarks.updateBookmarkLabel('bm-1', 'New Label');
    expect(mockFrom).toHaveBeenCalledWith('search_bookmarks');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: CSV Export
// ═══════════════════════════════════════════════════════════════════════════════

describe('csvExport', () => {
  let csvExport: typeof import('../admin/csvExport');

  beforeEach(async () => {
    vi.resetModules();
    csvExport = await import('../admin/csvExport');
  });

  const sampleData = {
    kpis: {
      totalSearches: 1500,
      uniqueUsers: 42,
      avgResultsPerSearch: 7.3,
      zeroResultRate: 0.12,
    },
    topQueries: [
      { query: 'daph decor', count: 120, avgResults: 8 },
      { query: 'invoice pending', count: 95, avgResults: 5 },
    ],
    dailyVolume: [
      { date: '2026-08-01', searches: 45 },
      { date: '2026-08-02', searches: 62 },
    ],
  };

  it('buildSearchAnalyticsCsv includes KPI section', () => {
    const csv = csvExport.buildSearchAnalyticsCsv(sampleData);
    expect(csv).toContain('=== Search Analytics KPIs ===');
    expect(csv).toContain('Total Searches,1500');
    expect(csv).toContain('Unique Users,42');
    expect(csv).toContain('Avg Results per Search,7.3');
    expect(csv).toContain('Zero-Result Rate,12.0%');
  });

  it('buildSearchAnalyticsCsv includes top queries section', () => {
    const csv = csvExport.buildSearchAnalyticsCsv(sampleData);
    expect(csv).toContain('=== Top Queries ===');
    expect(csv).toContain('daph decor,120,8');
    expect(csv).toContain('invoice pending,95,5');
  });

  it('buildSearchAnalyticsCsv includes daily volume section', () => {
    const csv = csvExport.buildSearchAnalyticsCsv(sampleData);
    expect(csv).toContain('=== Daily Search Volume ===');
    expect(csv).toContain('2026-08-01,45');
    expect(csv).toContain('2026-08-02,62');
  });

  it('buildSearchAnalyticsCsv escapes commas in query text', () => {
    const dataWithComma = {
      ...sampleData,
      topQueries: [{ query: 'hello, world', count: 10, avgResults: 3 }],
    };
    const csv = csvExport.buildSearchAnalyticsCsv(dataWithComma);
    expect(csv).toContain('"hello, world",10,3');
  });

  it('downloadSearchAnalyticsCsv triggers blob download', () => {
    // Mock URL APIs on global
    const mockUrl = 'blob:http://localhost/fake';
    global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
    global.URL.revokeObjectURL = vi.fn();

    // Save real createElement to avoid recursion
    const realCreateElement = document.createElement.bind(document);
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', style: { display: '' }, click: clickSpy } as any;
      }
      return realCreateElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((el: any) => el);
    vi.spyOn(document.body, 'removeChild').mockImplementation((el: any) => el);

    csvExport.downloadSearchAnalyticsCsv(sampleData, 'test.csv');

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: AutocompleteDropdown Component
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutocompleteDropdown', () => {
  let AutocompleteDropdown: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../admin/AutocompleteDropdown');
    AutocompleteDropdown = mod.AutocompleteDropdown;
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: ['test'],
        popular: [],
        visible: false,
        activeIndex: -1,
        onSelect: vi.fn(),
        onClearRecent: vi.fn(),
      })
    );
    expect(container.querySelector('[data-testid="autocomplete-dropdown"]')).toBeNull();
  });

  it('renders nothing when no suggestions', () => {
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: [],
        popular: [],
        visible: true,
        activeIndex: -1,
        onSelect: vi.fn(),
        onClearRecent: vi.fn(),
      })
    );
    expect(container.querySelector('[data-testid="autocomplete-dropdown"]')).toBeNull();
  });

  it('renders recent and popular sections', () => {
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: ['recent query'],
        popular: [{ query: 'popular query', frequency: 10, lastUsed: '2026-01-01' }],
        visible: true,
        activeIndex: -1,
        onSelect: vi.fn(),
        onClearRecent: vi.fn(),
      })
    );
    expect(container.querySelector('[data-testid="autocomplete-dropdown"]')).not.toBeNull();
    expect(container.textContent).toContain('Recent');
    expect(container.textContent).toContain('Popular');
    expect(container.textContent).toContain('recent query');
    expect(container.textContent).toContain('popular query');
    expect(container.textContent).toContain('10×');
  });

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: ['click me'],
        popular: [],
        visible: true,
        activeIndex: -1,
        onSelect,
        onClearRecent: vi.fn(),
      })
    );
    const item = container.querySelector('[data-testid="autocomplete-recent-0"]');
    expect(item).not.toBeNull();
    fireEvent.click(item!);
    expect(onSelect).toHaveBeenCalledWith('click me');
  });

  it('calls onClearRecent when clear button clicked', () => {
    const onClear = vi.fn();
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: ['test'],
        popular: [],
        visible: true,
        activeIndex: -1,
        onSelect: vi.fn(),
        onClearRecent: onClear,
      })
    );
    const btn = container.querySelector('[data-testid="clear-recent-btn"]');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(onClear).toHaveBeenCalled();
  });

  it('highlights active item with aria-selected', () => {
    const { container } = render(
      React.createElement(AutocompleteDropdown, {
        recent: ['item0', 'item1'],
        popular: [],
        visible: true,
        activeIndex: 1,
        onSelect: vi.fn(),
        onClearRecent: vi.fn(),
      })
    );
    const item1 = container.querySelector('[data-testid="autocomplete-recent-1"]');
    expect(item1).not.toBeNull();
    expect(item1!.getAttribute('aria-selected')).toBe('true');
    expect(item1!.className).toContain('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: BookmarkPanel Component
// ═══════════════════════════════════════════════════════════════════════════════

describe('BookmarkPanel', () => {
  let BookmarkPanel: any;

  beforeEach(async () => {
    vi.resetModules();
    // Set default mock: fetchBookmarks returns empty
    setupFromChain({ data: [], error: null });
    const mod = await import('../admin/BookmarkPanel');
    BookmarkPanel = mod.BookmarkPanel;
  });

  it('shows empty state when no bookmarks', async () => {
    render(React.createElement(BookmarkPanel, { onExecuteBookmark: vi.fn() }));
    await waitFor(() => {
      expect(screen.getByTestId('bookmark-empty')).toBeTruthy();
    });
  });

  it('shows pin button when currentQuery is provided', async () => {
    render(
      React.createElement(BookmarkPanel, {
        onExecuteBookmark: vi.fn(),
        currentQuery: 'my search',
      })
    );
    await waitFor(() => {
      expect(screen.getByTestId('pin-bookmark-btn')).toBeTruthy();
    });
  });

  it('does not show pin button when query is empty', async () => {
    render(
      React.createElement(BookmarkPanel, {
        onExecuteBookmark: vi.fn(),
        currentQuery: '',
      })
    );
    await waitFor(() => {
      expect(screen.getByTestId('bookmark-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('pin-bookmark-btn')).toBeNull();
  });

  it('renders bookmark list when data exists', async () => {
    vi.resetModules();
    setupFromChain({
      data: [
        {
          id: 'bm-1',
          user_id: 'u-1',
          label: 'Saved Query',
          query: 'saved',
          entity_types: ['job'],
          org_filter: null,
          use_count: 5,
          last_used_at: '2026-01-01',
          created_at: '2026-01-01',
        },
      ],
      error: null,
    });
    const mod2 = await import('../admin/BookmarkPanel');
    const BP = mod2.BookmarkPanel;
    render(React.createElement(BP, { onExecuteBookmark: vi.fn() }));
    await waitFor(() => {
      expect(screen.getByTestId('bookmark-list')).toBeTruthy();
    });
    expect(screen.getByText(/Saved Query/)).toBeTruthy();
    expect(screen.getByText('5×')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Integration — Wiring Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('v16.7 Integration', () => {
  it('admin barrel exports all v16.7 modules', async () => {
    vi.resetModules();
    const admin = await import('../admin/index');
    expect(admin.fetchAutocompleteSuggestions).toBeDefined();
    expect(admin.getRecentSearches).toBeDefined();
    expect(admin.addRecentSearch).toBeDefined();
    expect(admin.clearRecentSearches).toBeDefined();
    expect(admin.getCombinedSuggestions).toBeDefined();
    expect(admin.fetchBookmarks).toBeDefined();
    expect(admin.createBookmark).toBeDefined();
    expect(admin.deleteBookmark).toBeDefined();
    expect(admin.incrementBookmarkUse).toBeDefined();
    expect(admin.updateBookmarkLabel).toBeDefined();
    expect(admin.downloadSearchAnalyticsCsv).toBeDefined();
    expect(admin.buildSearchAnalyticsCsv).toBeDefined();
    expect(admin.AutocompleteDropdown).toBeDefined();
    expect(admin.BookmarkPanel).toBeDefined();
  });

  it('addRecentSearch + fetchAutocompleteSuggestions combined flow', async () => {
    vi.resetModules();
    const { addRecentSearch, getRecentSearches, fetchAutocompleteSuggestions } =
      await import('../admin/searchAutocomplete');
    addRecentSearch('integration test');
    expect(getRecentSearches()).toContain('integration test');

    mockRpc.mockResolvedValue({ data: [], error: null });
    const suggestions = await fetchAutocompleteSuggestions('int');
    expect(mockRpc).toHaveBeenCalledWith('get_search_suggestions', {
      query_prefix: 'int',
      result_limit: 8,
    });
    expect(suggestions).toEqual([]);
  });
});
