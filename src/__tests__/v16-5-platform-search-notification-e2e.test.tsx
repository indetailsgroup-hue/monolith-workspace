/**
 * v16.5.0 Tests
 * - Platform-wide search (PlatformSearchPanel + platformSearch logic)
 * - NotificationCenter real-time E2E flow
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

// ─── Mock Supabase ───────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockSupabase = {
  rpc: mockRpc,
};

vi.mock('../core/auth/supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

// ─── Platform Search Logic Tests ─────────────────────────────────────────────

describe('platformSearch', () => {
  let platformSearch: any;
  let searchJobs: any;
  let searchMembers: any;
  let searchInvoices: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../admin/platformSearch');
    platformSearch = mod.platformSearch;
    searchJobs = mod.searchJobs;
    searchMembers = mod.searchMembers;
    searchInvoices = mod.searchInvoices;
  });

  it('returns empty results for blank query', async () => {
    const result = await platformSearch({ query: '' });
    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns empty results for whitespace query', async () => {
    const result = await platformSearch({ query: '   ' });
    expect(result.results).toHaveLength(0);
  });

  it('searchJobs maps RPC response to SearchResult format', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'job-1',
          org_id: 'org-1',
          org_name: 'DAPH Decor',
          title: 'Kitchen Panels',
          job_number: 'JOB-001',
          status: 'in_progress',
          customer_name: 'Client A',
          match_field: 'title',
          match_snippet: 'Kitchen Panels',
          created_at: '2026-08-01T00:00:00Z',
          total_count: 1,
        },
      ],
      error: null,
    });

    const { results, count } = await searchJobs('Kitchen');
    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe('job');
    expect(results[0].title).toBe('Kitchen Panels');
    expect(results[0].orgName).toBe('DAPH Decor');
    expect(results[0].url).toBe('/jobs/job-1');
    expect(count).toBe(1);
  });

  it('searchMembers maps RPC response correctly', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'mem-1',
          org_id: 'org-2',
          org_name: 'TestCo',
          display_name: 'John Doe',
          email: 'john@test.com',
          role: 'DESIGNER',
          match_field: 'display_name',
          match_snippet: 'John Doe',
          joined_at: '2026-07-15T00:00:00Z',
          created_at: '2026-07-15T00:00:00Z',
          total_count: 1,
        },
      ],
      error: null,
    });

    const { results } = await searchMembers('John');
    expect(results[0].entityType).toBe('member');
    expect(results[0].title).toBe('John Doe');
    expect(results[0].subtitle).toContain('DESIGNER');
  });

  it('searchInvoices maps RPC response correctly', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          org_name: 'DAPH',
          invoice_number: 'INV-2026-001',
          status: 'paid',
          total_amount: 50000,
          customer_name: 'Customer X',
          match_field: 'invoice_number',
          match_snippet: 'INV-2026-001',
          issued_at: '2026-08-10T00:00:00Z',
          created_at: '2026-08-10T00:00:00Z',
          total_count: 1,
        },
      ],
      error: null,
    });

    const { results } = await searchInvoices('INV-2026');
    expect(results[0].entityType).toBe('invoice');
    expect(results[0].title).toBe('INV-2026-001');
    expect(results[0].subtitle).toContain('paid');
    expect(results[0].subtitle).toContain('50,000');
  });

  it('searchJobs throws on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Permission denied' },
    });

    await expect(searchJobs('test')).rejects.toThrow('Job search failed: Permission denied');
  });

  it('platformSearch runs all entity searches in parallel', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'j1', org_id: 'o1', org_name: 'Org1', title: 'Job1', job_number: 'J1', status: 'active', customer_name: 'C1', match_field: 'title', match_snippet: 'Job1', created_at: '2026-08-20T00:00:00Z', total_count: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'm1', org_id: 'o1', org_name: 'Org1', display_name: 'User1', email: 'u@t.com', role: 'ADMIN', match_field: 'name', match_snippet: 'User1', joined_at: '2026-08-19T00:00:00Z', created_at: '2026-08-19T00:00:00Z', total_count: 1 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await platformSearch({ query: 'test' });
    expect(result.results).toHaveLength(2);
    expect(result.totalCount).toBe(2);
    expect(result.facets.byType.job).toBe(1);
    expect(result.facets.byType.member).toBe(1);
    expect(result.facets.byType.invoice).toBe(0);
    expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('platformSearch filters by entity type', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await platformSearch({ query: 'test', entityTypes: ['invoice'] });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('platform_search_invoices', expect.any(Object));
  });

  it('platformSearch passes orgId filter', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await platformSearch({ query: 'test', orgId: 'org-123' });
    expect(mockRpc).toHaveBeenCalledWith('platform_search_jobs', expect.objectContaining({ filter_org_id: 'org-123' }));
  });

  it('platformSearch builds org facets from results', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [
        { id: 'j1', org_id: 'o1', org_name: 'Alpha', title: 'T', job_number: 'J', status: 's', customer_name: 'C', match_field: 'f', match_snippet: 's', created_at: '2026-08-01T00:00:00Z', total_count: 2 },
        { id: 'j2', org_id: 'o2', org_name: 'Beta', title: 'T2', job_number: 'J2', status: 's', customer_name: 'C2', match_field: 'f', match_snippet: 's', created_at: '2026-08-02T00:00:00Z', total_count: 2 },
      ], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await platformSearch({ query: 'test' });
    expect(result.facets.byOrg).toHaveLength(2);
    expect(result.facets.byOrg[0].orgName).toBeDefined();
  });

  it('platformSearch handles partial search failure gracefully', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'j1', org_id: 'o1', org_name: 'O', title: 'T', job_number: 'J', status: 's', customer_name: 'C', match_field: 'f', match_snippet: 's', created_at: '2026-08-01T00:00:00Z', total_count: 1 }], error: null })
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await platformSearch({ query: 'test' });
    // Jobs succeeded, members failed, invoices empty — allSettled means partial results
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('createDebouncedSearch debounces calls', async () => {
    const { createDebouncedSearch } = await import('../admin/platformSearch');
    const callback = vi.fn();
    const debouncedSearch = createDebouncedSearch(50);

    mockRpc.mockResolvedValue({ data: [], error: null });

    debouncedSearch({ query: 'a' }, callback);
    debouncedSearch({ query: 'ab' }, callback);
    debouncedSearch({ query: 'abc' }, callback);

    await new Promise((r) => setTimeout(r, 100));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ─── PlatformSearchPanel UI Tests ────────────────────────────────────────────

describe('PlatformSearchPanel', () => {
  let PlatformSearchPanel: any;
  const mockSearchFn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../admin/PlatformSearchPanel');
    PlatformSearchPanel = mod.PlatformSearchPanel;
    mockSearchFn.mockResolvedValue({
      results: [],
      totalCount: 0,
      queryTimeMs: 5,
      facets: { byType: { job: 0, member: 0, invoice: 0 }, byOrg: [] },
    });
  });

  it('renders search input', () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('shows filter chips when query entered', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'test' } });
    await waitFor(() => {
      expect(screen.getByTestId('filter-job')).toBeDefined();
      expect(screen.getByTestId('filter-member')).toBeDefined();
      expect(screen.getByTestId('filter-invoice')).toBeDefined();
    });
  });

  it('calls searchFn after debounce when typing', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'DAPH' } });
    await waitFor(() => {
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'DAPH' })
      );
    });
  });

  it('displays search results', async () => {
    mockSearchFn.mockResolvedValue({
      results: [
        { id: 'r1', entityType: 'job', title: 'Kitchen Job', subtitle: 'in_progress', orgId: 'o1', orgName: 'DAPH', matchField: 'title', matchSnippet: 'Kitchen', createdAt: '2026-08-01T00:00:00Z', url: '/jobs/r1' },
      ],
      totalCount: 1,
      queryTimeMs: 12,
      facets: { byType: { job: 1, member: 0, invoice: 0 }, byOrg: [{ orgId: 'o1', orgName: 'DAPH', count: 1 }] },
    });

    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Kitchen' } });

    await waitFor(() => {
      expect(screen.getByTestId('result-count')).toBeDefined();
      expect(screen.getByText('Kitchen Job')).toBeDefined();
    });
  });

  it('shows no-results message when empty', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByTestId('no-results')).toBeDefined();
    });
  });

  it('navigates when result clicked', async () => {
    mockSearchFn.mockResolvedValue({
      results: [
        { id: 'r1', entityType: 'job', title: 'Job A', subtitle: 'sub', orgId: 'o1', orgName: 'Org', matchField: 'f', matchSnippet: 's', createdAt: '2026-08-01T00:00:00Z', url: '/jobs/r1' },
      ],
      totalCount: 1,
      queryTimeMs: 5,
      facets: { byType: { job: 1, member: 0, invoice: 0 }, byOrg: [] },
    });

    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Job' } });

    await waitFor(() => screen.getByTestId('search-result-r1'));
    fireEvent.click(screen.getByTestId('search-result-r1'));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/r1');
  });

  it('toggles filter chips', async () => {
    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    await waitFor(() => screen.getByTestId('filter-job'));
    fireEvent.click(screen.getByTestId('filter-job'));

    await waitFor(() => {
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({ entityTypes: ['member', 'invoice'] })
      );
    });
  });

  it('shows error state', async () => {
    mockSearchFn.mockRejectedValue(new Error('Network failure'));

    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'err' } });

    await waitFor(() => {
      expect(screen.getByTestId('search-error')).toBeDefined();
    });
  });

  it('clears results on Escape key', async () => {
    mockSearchFn.mockResolvedValue({
      results: [{ id: 'r1', entityType: 'job', title: 'T', subtitle: 's', orgId: 'o', orgName: 'O', matchField: 'f', matchSnippet: 's', createdAt: '2026-08-01T00:00:00Z', url: '/x' }],
      totalCount: 1,
      queryTimeMs: 1,
      facets: { byType: { job: 1, member: 0, invoice: 0 }, byOrg: [] },
    });

    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });
    await waitFor(() => screen.getByTestId('result-count'));

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('result-count')).toBeNull();
    });
  });

  it('shows loading indicator during search', async () => {
    let resolveSearch: any;
    mockSearchFn.mockReturnValue(new Promise((r) => { resolveSearch = r; }));

    render(<PlatformSearchPanel searchFn={mockSearchFn} onNavigate={mockNavigate} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'loading' } });

    await waitFor(() => {
      expect(screen.getByTestId('search-loading')).toBeDefined();
    });

    act(() => {
      resolveSearch({
        results: [], totalCount: 0, queryTimeMs: 0,
        facets: { byType: { job: 0, member: 0, invoice: 0 }, byOrg: [] },
      });
    });
  });
});

// ─── NotificationCenter Real-Time E2E Flow ───────────────────────────────────

describe('NotificationCenter real-time E2E', () => {
  let useNotificationStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const storeMod = await import('../notifications/notificationStore');
    useNotificationStore = storeMod.useNotificationStore;

    // Reset store to clean state
    useNotificationStore.setState({
      notifications: [],
      preferences: {
        userId: 'user-1',
        orgId: 'org-1',
        emailDigest: { job_status: 'daily', billing: 'immediate', team: 'daily', system: 'daily', usage: 'weekly', export: 'none' },
        inAppEnabled: { job_status: true, billing: true, team: true, system: true, usage: true, export: true },
        globalMute: false,
        muteUntil: undefined,
        quietHours: undefined,
      },
      isPanelOpen: false,
      filterCategory: 'all',
      loading: false,
    });
  });

  it('renders notification bell', async () => {
    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    expect(screen.getByTestId('notification-bell')).toBeDefined();
  });

  it('no unread badge when empty', async () => {
    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    expect(screen.queryByTestId('unread-badge')).toBeNull();
  });

  it('shows unread badge when notifications exist', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'job_status', priority: 'normal', title: 'Job completed', body: 'Job #123 done', actionUrl: '/jobs/123', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
      ],
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    expect(screen.getByTestId('unread-badge')).toBeDefined();
    expect(screen.getByTestId('unread-badge').textContent).toBe('1');
  });

  it('opens panel on bell click', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'billing', priority: 'high', title: 'Payment due', body: 'Invoice overdue', actionUrl: '/billing', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
      ],
      isPanelOpen: false,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    expect(useNotificationStore.getState().isPanelOpen).toBe(true);
  });

  it('displays notifications in open panel', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'job_status', priority: 'normal', title: 'New job assigned', body: 'You have a new job', actionUrl: '/jobs/1', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
        { id: 'n2', orgId: 'org-1', userId: 'user-1', category: 'team', priority: 'low', title: 'New member joined', body: 'Alice joined', actionUrl: '/team', isRead: true, createdAt: '2026-08-27T10:00:00Z' },
      ],
      isPanelOpen: true,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    expect(screen.getByText('New job assigned')).toBeDefined();
    expect(screen.getByText('New member joined')).toBeDefined();
  });

  it('marks notification as read on click', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'system', priority: 'low', title: 'System update', body: 'v2.0 deployed', actionUrl: '/changelog', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
      ],
      isPanelOpen: true,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    fireEvent.click(screen.getByText('System update'));

    // After clicking, the notification should be marked read
    const state = useNotificationStore.getState();
    const notif = state.notifications.find((n: any) => n.id === 'n1');
    expect(notif.isRead).toBe(true);
  });

  it('marks all as read', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'system', priority: 'low', title: 'Update 1', body: 'b', actionUrl: '/', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
        { id: 'n2', orgId: 'org-1', userId: 'user-1', category: 'system', priority: 'low', title: 'Update 2', body: 'b', actionUrl: '/', isRead: false, createdAt: '2026-08-28T09:00:00Z' },
      ],
      isPanelOpen: true,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);

    // The "อ่านทั้งหมด" button
    const markAllBtn = screen.getByText('อ่านทั้งหมด');
    fireEvent.click(markAllBtn);

    const state = useNotificationStore.getState();
    expect(state.notifications.every((n: any) => n.isRead)).toBe(true);
  });

  it('simulates real-time notification arrival via store addNotification', async () => {
    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    const { rerender } = render(<NotificationCenter />);
    expect(screen.queryByTestId('unread-badge')).toBeNull();

    // Simulate real-time push via store action
    act(() => {
      useNotificationStore.getState().addNotification({
        orgId: 'org-1',
        userId: 'user-1',
        category: 'usage',
        priority: 'high',
        title: '80% usage reached',
        body: 'Approaching limit',
        actionUrl: '/settings/usage',
      });
    });

    rerender(<NotificationCenter />);
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toBeDefined();
    });
  });

  it('handles rapid successive notifications', async () => {
    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);

    act(() => {
      const store = useNotificationStore.getState();
      store.addNotification({ orgId: 'org-1', userId: 'user-1', category: 'job_status', priority: 'normal', title: 'Job 1', body: 'b', actionUrl: '/' });
      store.addNotification({ orgId: 'org-1', userId: 'user-1', category: 'billing', priority: 'high', title: 'Bill 1', body: 'b', actionUrl: '/' });
      store.addNotification({ orgId: 'org-1', userId: 'user-1', category: 'team', priority: 'low', title: 'Team update', body: 'b', actionUrl: '/' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge').textContent).toBe('3');
    });
  });

  it('handles notification with critical priority', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n-crit', orgId: 'org-1', userId: 'user-1', category: 'system', priority: 'urgent', title: 'Service disruption', body: 'Immediate action required', actionUrl: '/admin', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
      ],
      isPanelOpen: true,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    expect(screen.getByText('Service disruption')).toBeDefined();
  });

  it('filters notifications by category in panel', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', orgId: 'org-1', userId: 'user-1', category: 'billing', priority: 'high', title: 'Bill due', body: 'Pay now', actionUrl: '/billing', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
        { id: 'n2', orgId: 'org-1', userId: 'user-1', category: 'job_status', priority: 'normal', title: 'Job done', body: 'Completed', actionUrl: '/jobs/2', isRead: false, createdAt: '2026-08-28T09:00:00Z' },
      ],
      isPanelOpen: true,
      filterCategory: 'billing',
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);
    // Only billing notification visible
    expect(screen.getByText('Bill due')).toBeDefined();
    expect(screen.queryByText('Job done')).toBeNull();
  });

  it('deletes a notification', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n-del', orgId: 'org-1', userId: 'user-1', category: 'system', priority: 'low', title: 'Deletable', body: 'b', actionUrl: '/', isRead: false, createdAt: '2026-08-28T10:00:00Z' },
      ],
      isPanelOpen: true,
    });

    const { NotificationCenter } = await import('../notifications/NotificationCenter');
    render(<NotificationCenter />);

    // Click the delete button (🗑️)
    const deleteBtn = screen.getByTitle('ลบ');
    fireEvent.click(deleteBtn);

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
  });
});

// ─── useNotificationRealtime Hook Tests ──────────────────────────────────────

describe('useNotificationRealtime', () => {
  let useNotificationStore: any;
  let useNotificationRealtime: any;

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };
  const mockClient = {
    channel: vi.fn().mockReturnValue(mockChannel),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const storeMod = await import('../notifications/notificationStore');
    useNotificationStore = storeMod.useNotificationStore;
    const hookMod = await import('../notifications/useNotificationRealtime');
    useNotificationRealtime = hookMod.useNotificationRealtime;

    useNotificationStore.setState({
      notifications: [],
      preferences: { userId: 'user-1', orgId: 'org-1', emailDigest: {}, inAppEnabled: { job_status: true, billing: true, team: true, system: true, usage: true, export: true }, globalMute: false, muteUntil: undefined, quietHours: undefined },
      isPanelOpen: false,
      filterCategory: 'all',
    });
  });

  it('subscribes to Supabase channel on mount', async () => {
    const { renderHook } = await import('@testing-library/react');

    renderHook(() => useNotificationRealtime({ orgId: 'org-1', userId: 'user-1', supabaseClient: mockClient as any }));

    expect(mockClient.channel).toHaveBeenCalledWith(expect.stringContaining('notifications'));
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('unsubscribes on unmount', async () => {
    const { renderHook } = await import('@testing-library/react');

    const { unmount } = renderHook(() => useNotificationRealtime({ orgId: 'org-1', userId: 'user-1', supabaseClient: mockClient as any }));
    unmount();

    expect(mockChannel.unsubscribe).toHaveBeenCalled();
  });

  it('does not subscribe when orgId is empty', async () => {
    const { renderHook } = await import('@testing-library/react');

    renderHook(() => useNotificationRealtime({ orgId: '', userId: 'user-1', supabaseClient: mockClient as any }));

    expect(mockClient.channel).not.toHaveBeenCalled();
  });

  it('does not subscribe when supabaseClient is undefined', async () => {
    const { renderHook } = await import('@testing-library/react');

    renderHook(() => useNotificationRealtime({ orgId: 'org-1', userId: 'user-1', supabaseClient: undefined as any }));

    expect(mockClient.channel).not.toHaveBeenCalled();
  });
});
