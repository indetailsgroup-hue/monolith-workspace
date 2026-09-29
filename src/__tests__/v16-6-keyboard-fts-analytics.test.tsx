/**
 * v16.6.0 Tests
 * - Keyboard navigation in PlatformSearchPanel
 * - Search analytics dashboard
 * - Search logging integration
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

// ─── Mock Supabase ───────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });

vi.mock('../core/auth/supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// ─── Keyboard Navigation Tests ───────────────────────────────────────────────

describe('PlatformSearchPanel keyboard navigation', () => {
  let PlatformSearchPanel: any;
  const mockSearchFn = vi.fn();
  const mockNavigate = vi.fn();

  const mockResults = {
    results: [
      { id: 'r1', entityType: 'job', title: 'Kitchen Job', subtitle: 'active', orgId: 'o1', orgName: 'DAPH', matchField: 'title', matchSnippet: 'Kitchen', createdAt: '2026-08-20T00:00:00Z', url: '/jobs/r1' },
      { id: 'r2', entityType: 'member', title: 'John Doe', subtitle: 'ADMIN', orgId: 'o1', orgName: 'DAPH', matchField: 'name', matchSnippet: 'John', createdAt: '2026-08-19T00:00:00Z', url: '/members/r2' },
      { id: 'r3', entityType: 'invoice', title: 'INV-001', subtitle: 'paid', orgId: 'o2', orgName: 'TestCo', matchField: 'number', matchSnippet: 'INV', createdAt: '2026-08-18T00:00:00Z', url: '/invoices/r3' },
    ],
    totalCount: 3,
    queryTimeMs: 8,
    facets: { byType: { job: 1, member: 1, invoice: 1 }, byOrg: [] },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../admin/PlatformSearchPanel');
    PlatformSearchPanel = mod.PlatformSearchPanel;
    mockSearchFn.mockResolvedValue(mockResults);
  });

  it('ArrowDown moves activeIndex forward', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      const firstResult = screen.getByTestId('search-result-r1');
      expect(firstResult.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('ArrowDown wraps to start after last item', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    // Press down 4 times (3 results + 1 wrap)
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 1
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 2
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // wraps to 0

    await waitFor(() => {
      expect(screen.getByTestId('search-result-r1').getAttribute('aria-selected')).toBe('true');
    });
  });

  it('ArrowUp moves activeIndex backward', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    // Move down first, then up
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 1
    fireEvent.keyDown(input, { key: 'ArrowUp' });   // index 0

    await waitFor(() => {
      expect(screen.getByTestId('search-result-r1').getAttribute('aria-selected')).toBe('true');
    });
  });

  it('ArrowUp wraps to last item from start', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r3'));

    // ArrowUp from -1 wraps to last
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    await waitFor(() => {
      expect(screen.getByTestId('search-result-r3').getAttribute('aria-selected')).toBe('true');
    });
  });

  it('Enter navigates to active result', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    fireEvent.keyDown(input, { key: 'ArrowDown' }); // select first
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/jobs/r1');
  });

  it('Enter on second item navigates correctly', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r2'));

    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // index 1
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/members/r2');
  });

  it('Enter does nothing when no item selected', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    fireEvent.keyDown(input, { key: 'Enter' }); // activeIndex is -1
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Escape clears query and resets activeIndex', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('search-result-r1')).toBeNull();
    });
  });

  it('mouse hover updates activeIndex', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r2'));

    fireEvent.mouseEnter(screen.getByTestId('search-result-r2'));

    await waitFor(() => {
      expect(screen.getByTestId('search-result-r2').getAttribute('aria-selected')).toBe('true');
    });
  });

  it('shows keyboard hints when results visible', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByTestId('keyboard-hints')).toBeDefined();
    });
  });

  it('has correct ARIA attributes for combobox pattern', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');

    fireEvent.change(input, { target: { value: 'test' } });
    await waitFor(() => screen.getByTestId('search-result-r1'));

    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('search-results-listbox');
  });

  it('aria-activedescendant updates with activeIndex', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(input.getAttribute('aria-activedescendant')).toBe('search-result-option-0');
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(input.getAttribute('aria-activedescendant')).toBe('search-result-option-1');
    });
  });
});

// ─── Search Analytics Dashboard Tests ────────────────────────────────────────

describe('SearchAnalyticsDashboard', () => {
  let SearchAnalyticsDashboard: any;

  const mockData = {
    totalSearches: 1542,
    uniqueUsers: 23,
    avgQueryTimeMs: 45.3,
    avgResultCount: 8.2,
    zeroResultRate: 12.5,
    searchesPerDay: [
      { date: '2026-08-01', count: 42 },
      { date: '2026-08-02', count: 55 },
      { date: '2026-08-03', count: 38 },
      { date: '2026-08-04', count: 67 },
      { date: '2026-08-05', count: 51 },
    ],
    topQueries: [
      { query: 'kitchen panels', count: 89 },
      { query: 'daph decor', count: 67 },
      { query: 'invoice 2026', count: 45 },
      { query: 'john designer', count: 32 },
    ],
    topEntityTypes: [
      { type: 'job', count: 890 },
      { type: 'member', count: 412 },
      { type: 'invoice', count: 240 },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../admin/SearchAnalyticsDashboard');
    SearchAnalyticsDashboard = mod.SearchAnalyticsDashboard;
  });

  it('renders with initial data', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.getByTestId('search-analytics-dashboard')).toBeDefined();
  });

  it('displays KPI values correctly', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.getByTestId('kpi-grid')).toBeDefined();
    expect(screen.getByText('1,542')).toBeDefined(); // total searches
    expect(screen.getByText('23')).toBeDefined(); // unique users
    expect(screen.getByText('45.3ms')).toBeDefined(); // avg response
    expect(screen.getByText('8.2')).toBeDefined(); // avg results
    expect(screen.getByText('12.5%')).toBeDefined(); // zero rate
  });

  it('renders daily sparkline chart', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.getByTestId('sparkline-daily')).toBeDefined();
  });

  it('renders top queries bar chart', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.getByTestId('chart-top-search-queries')).toBeDefined();
    expect(screen.getByText('kitchen panels')).toBeDefined();
    expect(screen.getByText('daph decor')).toBeDefined();
  });

  it('renders entity type chart', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.getByTestId('chart-searches-by-entity-type')).toBeDefined();
  });

  it('does not show zero-result alert when rate is low', () => {
    render(<SearchAnalyticsDashboard initialData={mockData} />);
    expect(screen.queryByTestId('zero-result-alert')).toBeNull();
  });

  it('shows zero-result alert when rate is high', () => {
    const highZeroData = { ...mockData, zeroResultRate: 35 };
    render(<SearchAnalyticsDashboard initialData={highZeroData} />);
    expect(screen.getByTestId('zero-result-alert')).toBeDefined();
  });

  it('shows loading state', () => {
    const neverResolve = () => new Promise<any>(() => {});
    render(<SearchAnalyticsDashboard fetchFn={neverResolve} />);
    expect(screen.getByTestId('analytics-loading')).toBeDefined();
  });

  it('shows error state on fetch failure', async () => {
    const failFn = () => Promise.reject(new Error('DB connection lost'));
    render(<SearchAnalyticsDashboard fetchFn={failFn} />);
    await waitFor(() => {
      expect(screen.getByTestId('analytics-error')).toBeDefined();
    });
  });

  it('period buttons change daysBack', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockData);
    render(<SearchAnalyticsDashboard fetchFn={fetchFn} />);

    await waitFor(() => screen.getByTestId('search-analytics-dashboard'));

    fireEvent.click(screen.getByTestId('period-7d'));
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith(7);
    });
  });

  it('renders with empty data gracefully', () => {
    const emptyData = {
      totalSearches: 0,
      uniqueUsers: 0,
      avgQueryTimeMs: 0,
      avgResultCount: 0,
      zeroResultRate: 0,
      searchesPerDay: [],
      topQueries: [],
      topEntityTypes: [],
    };
    render(<SearchAnalyticsDashboard initialData={emptyData} />);
    expect(screen.getByTestId('search-analytics-dashboard')).toBeDefined();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});

// ─── Search Logging Tests ────────────────────────────────────────────────────

describe('searchAnalytics data layer', () => {
  let logSearch: any;
  let fetchSearchAnalytics: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../admin/searchAnalytics');
    logSearch = mod.logSearch;
    fetchSearchAnalytics = mod.fetchSearchAnalytics;
  });

  it('logSearch calls RPC with correct params', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'log-id-123', error: null });

    const result = await logSearch({
      query: 'kitchen',
      entityTypes: ['job', 'invoice'],
      resultCount: 5,
      queryTimeMs: 32,
    });

    expect(mockRpc).toHaveBeenCalledWith('log_platform_search', {
      search_query: 'kitchen',
      entity_types: ['job', 'invoice'],
      org_filter: null,
      result_count: 5,
      query_time_ms: 32,
    });
    expect(result).toBe('log-id-123');
  });

  it('logSearch returns null on error without throwing', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

    const result = await logSearch({
      query: 'test',
      entityTypes: ['job'],
      resultCount: 0,
      queryTimeMs: 10,
    });

    expect(result).toBeNull();
  });

  it('fetchSearchAnalytics maps response correctly', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        total_searches: 500,
        unique_users: 10,
        avg_query_time_ms: 33.5,
        avg_result_count: 6.8,
        zero_result_rate: 15.2,
        searches_per_day: [{ date: '2026-08-01', count: 50 }],
        top_queries: [{ query: 'panel', count: 42 }],
        top_entity_types: [{ type: 'job', count: 300 }],
      }],
      error: null,
    });

    const result = await fetchSearchAnalytics(14);
    expect(result.totalSearches).toBe(500);
    expect(result.uniqueUsers).toBe(10);
    expect(result.avgQueryTimeMs).toBe(33.5);
    expect(result.zeroResultRate).toBe(15.2);
    expect(result.topQueries).toHaveLength(1);
    expect(result.topQueries[0].query).toBe('panel');
  });

  it('fetchSearchAnalytics throws on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'unauthorized' } });
    await expect(fetchSearchAnalytics()).rejects.toThrow('Analytics fetch failed: unauthorized');
  });
});
