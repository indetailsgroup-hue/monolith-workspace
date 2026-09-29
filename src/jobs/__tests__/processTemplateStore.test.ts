/**
 * processTemplateStore.test.ts
 * MONOLITH v17.0 — Process Templates Module
 * Framework: Vitest + vi.mock (no DOM required)
 *
 * Tests:
 *  - PlanGateError — name, message format, instanceof check
 *  - fetchBottleneckData — throws PlanGateError for FREE / STARTER plans
 *  - logStageEntry — throws PlanGateError for non-PROFESSIONAL
 *  - logStageExit — throws PlanGateError for non-PROFESSIONAL
 *  - setFilters — merges partial filters into existing state
 *  - clearError — resets error to null
 *  - reset — restores initial state
 *  - fetchTemplates — handles Supabase error, sets error state
 *  - fetchTemplates — success path sets templates array
 *  - deleteTemplate — removes template from state list optimistically
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE CLIENT
// ============================================================================
// Mock MUST be declared before importing the store (Vitest hoists vi.mock calls).

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../core/supabase', () => ({
  supabase: mockSupabase,
}));

// ── Helper: builds a chainable Supabase query mock ───────────────────────────

function buildQueryMock(resolveWith: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'eq', 'or',
    'ilike', 'order', 'single',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // `single()` is terminal; list queries await the chain itself. Keeping
  // `order()` chainable matters because fetchTemplates orders by two columns.
  (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolveWith);
  chain['then'] = vi.fn((resolve, reject) =>
    Promise.resolve(resolveWith).then(resolve, reject),
  );
  return chain;
}

// ============================================================================
// IMPORT STORE (after mock)
// ============================================================================

import { useProcessTemplateStore, PlanGateError } from '../processTemplateStore';

// ============================================================================
// PlanGateError
// ============================================================================

describe('PlanGateError', () => {
  it('has name = "PlanGateError"', () => {
    const err = new PlanGateError('PROFESSIONAL', 'STARTER');
    expect(err.name).toBe('PlanGateError');
  });

  it('message includes required and current plan', () => {
    const err = new PlanGateError('PROFESSIONAL', 'FREE');
    expect(err.message).toContain('PROFESSIONAL');
    expect(err.message).toContain('FREE');
  });

  it('is an instance of Error', () => {
    const err = new PlanGateError('ENTERPRISE', 'STARTER');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PlanGateError);
  });

  it('is distinguishable from generic Error via name', () => {
    const err = new PlanGateError('PROFESSIONAL', 'STARTER');
    expect(err.name).not.toBe('Error');
  });
});

// ============================================================================
// Store state management
// ============================================================================

describe('useProcessTemplateStore — state actions', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useProcessTemplateStore.getState().reset();
    vi.clearAllMocks();
  });

  // ── setFilters ────────────────────────────────────────────────────────────

  describe('setFilters', () => {
    it('merges partial filters without replacing unrelated keys', () => {
      const store = useProcessTemplateStore.getState();
      store.setFilters({ category: 'CNC' });
      const { filters } = useProcessTemplateStore.getState();
      expect(filters.category).toBe('CNC');
      expect(filters.isActive).toBe(true);  // unchanged default
      expect(filters.search).toBe('');       // unchanged default
    });

    it('can update multiple filter keys at once', () => {
      useProcessTemplateStore.getState().setFilters({ category: 'CABINET', search: 'ตู้' });
      const { filters } = useProcessTemplateStore.getState();
      expect(filters.category).toBe('CABINET');
      expect(filters.search).toBe('ตู้');
    });

    it('can clear category by setting null', () => {
      useProcessTemplateStore.getState().setFilters({ category: 'CNC' });
      useProcessTemplateStore.getState().setFilters({ category: null });
      expect(useProcessTemplateStore.getState().filters.category).toBeNull();
    });
  });

  // ── clearError ────────────────────────────────────────────────────────────

  describe('clearError', () => {
    it('sets error to null when called', () => {
      // Manually inject an error
      useProcessTemplateStore.setState({ error: 'test error' });
      useProcessTemplateStore.getState().clearError();
      expect(useProcessTemplateStore.getState().error).toBeNull();
    });

    it('is a no-op when error is already null', () => {
      expect(useProcessTemplateStore.getState().error).toBeNull();
      useProcessTemplateStore.getState().clearError();
      expect(useProcessTemplateStore.getState().error).toBeNull();
    });
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears templates array', () => {
      useProcessTemplateStore.setState({ templates: [{ id: 'x' } as never] });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().templates).toHaveLength(0);
    });

    it('clears selectedTemplate', () => {
      useProcessTemplateStore.setState({ selectedTemplate: { id: 'x' } as never });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().selectedTemplate).toBeNull();
    });

    it('resets isLoading to false', () => {
      useProcessTemplateStore.setState({ isLoading: true });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().isLoading).toBe(false);
    });

    it('resets error to null', () => {
      useProcessTemplateStore.setState({ error: 'some error' });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().error).toBeNull();
    });

    it('resets bottleneckData to empty array', () => {
      useProcessTemplateStore.setState({ bottleneckData: [{ stageName: 'A' } as never] });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().bottleneckData).toHaveLength(0);
    });

    it('resets filters.isActive to true', () => {
      useProcessTemplateStore.setState({ filters: { isActive: false } });
      useProcessTemplateStore.getState().reset();
      expect(useProcessTemplateStore.getState().filters.isActive).toBe(true);
    });
  });
});

// ============================================================================
// Plan Gate enforcement
// ============================================================================

describe('useProcessTemplateStore — plan gate enforcement', () => {
  beforeEach(() => {
    useProcessTemplateStore.getState().reset();
    vi.clearAllMocks();
  });

  // ── fetchBottleneckData ───────────────────────────────────────────────────

  describe('fetchBottleneckData', () => {
    it('throws PlanGateError for FREE plan', async () => {
      await expect(
        useProcessTemplateStore.getState().fetchBottleneckData('org-1', 'FREE')
      ).rejects.toThrow(PlanGateError);
    });

    it('throws PlanGateError for STARTER plan', async () => {
      await expect(
        useProcessTemplateStore.getState().fetchBottleneckData('org-1', 'STARTER')
      ).rejects.toThrow(PlanGateError);
    });

    it('PlanGateError message mentions PROFESSIONAL and current plan', async () => {
      try {
        await useProcessTemplateStore.getState().fetchBottleneckData('org-1', 'STARTER');
      } catch (err) {
        expect(err).toBeInstanceOf(PlanGateError);
        expect((err as PlanGateError).message).toContain('PROFESSIONAL');
        expect((err as PlanGateError).message).toContain('STARTER');
      }
    });

    it('does NOT throw for PROFESSIONAL plan (calls Supabase)', async () => {
      const mockChain = buildQueryMock({ data: [], error: null });
      mockSupabase.from.mockReturnValue(mockChain);

      await expect(
        useProcessTemplateStore.getState().fetchBottleneckData('org-1', 'PROFESSIONAL')
      ).resolves.not.toThrow();
    });

    it('does NOT throw for ENTERPRISE plan', async () => {
      const mockChain = buildQueryMock({ data: [], error: null });
      mockSupabase.from.mockReturnValue(mockChain);

      await expect(
        useProcessTemplateStore.getState().fetchBottleneckData('org-1', 'ENTERPRISE')
      ).resolves.not.toThrow();
    });
  });

  // ── logStageEntry ─────────────────────────────────────────────────────────

  describe('logStageEntry', () => {
    it('throws PlanGateError for FREE plan', async () => {
      await expect(
        useProcessTemplateStore.getState().logStageEntry('org-1', 'FREE', {
          jobId: 'job-1',
          stageName: 'ออกแบบ',
        })
      ).rejects.toThrow(PlanGateError);
    });

    it('throws PlanGateError for STARTER plan', async () => {
      await expect(
        useProcessTemplateStore.getState().logStageEntry('org-1', 'STARTER', {
          jobId: 'job-1',
          stageName: 'ออกแบบ',
        })
      ).rejects.toThrow(PlanGateError);
    });

    it('does NOT throw for PROFESSIONAL plan (calls Supabase)', async () => {
      const mockChain = buildQueryMock({
        data: { id: 'log-1', stageName: 'ออกแบบ' },
        error: null,
      });
      mockSupabase.from.mockReturnValue(mockChain);

      await expect(
        useProcessTemplateStore.getState().logStageEntry('org-1', 'PROFESSIONAL', {
          jobId: 'job-1',
          stageName: 'ออกแบบ',
        })
      ).resolves.not.toThrow();
    });
  });

  // ── logStageExit ──────────────────────────────────────────────────────────

  describe('logStageExit', () => {
    it('throws PlanGateError for FREE plan', async () => {
      await expect(
        useProcessTemplateStore.getState().logStageExit('org-1', 'FREE', { id: 'log-1' })
      ).rejects.toThrow(PlanGateError);
    });

    it('throws PlanGateError for STARTER plan', async () => {
      await expect(
        useProcessTemplateStore.getState().logStageExit('org-1', 'STARTER', { id: 'log-1' })
      ).rejects.toThrow(PlanGateError);
    });
  });
});

// ============================================================================
// fetchTemplates — error handling
// ============================================================================

describe('useProcessTemplateStore — fetchTemplates', () => {
  beforeEach(() => {
    useProcessTemplateStore.getState().reset();
    vi.clearAllMocks();
  });

  it('sets error state when Supabase returns error', async () => {
    const mockChain = buildQueryMock({ data: null, error: { message: 'DB connection failed' } });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().fetchTemplates('org-1');

    const { error, isLoading } = useProcessTemplateStore.getState();
    expect(error).toBeTruthy();
    expect(isLoading).toBe(false);
  });

  it('sets templates on successful fetch', async () => {
    const fakeTemplates = [
      { id: 'tpl-1', name: 'ตู้ครัว', category: 'CABINET', isGlobal: true },
      { id: 'tpl-2', name: 'งาน CNC', category: 'CNC', isGlobal: false },
    ];
    const mockChain = buildQueryMock({ data: fakeTemplates, error: null });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().fetchTemplates('org-1');

    const { templates, error, isLoading } = useProcessTemplateStore.getState();
    expect(templates).toHaveLength(2);
    expect(error).toBeNull();
    expect(isLoading).toBe(false);
  });

  it('sets isLoading true during fetch and false after', async () => {
    let capturedLoadingState = false;
    const mockChain = buildQueryMock({ data: [], error: null });
    // Intercept the await boundary to capture loading state mid-flight.
    (mockChain['then'] as ReturnType<typeof vi.fn>).mockImplementationOnce((resolve, reject) => {
      capturedLoadingState = useProcessTemplateStore.getState().isLoading;
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().fetchTemplates('org-1');

    expect(capturedLoadingState).toBe(true);
    expect(useProcessTemplateStore.getState().isLoading).toBe(false);
  });
});

// ============================================================================
// deleteTemplate — optimistic state update
// ============================================================================

describe('useProcessTemplateStore — deleteTemplate', () => {
  beforeEach(() => {
    useProcessTemplateStore.getState().reset();
    vi.clearAllMocks();
  });

  it('removes the template from state.templates after delete', async () => {
    // Pre-populate state
    useProcessTemplateStore.setState({
      templates: [
        { id: 'tpl-1', name: 'ตู้ครัว' } as never,
        { id: 'tpl-2', name: 'ประตู' } as never,
      ],
    });

    const mockChain = buildQueryMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().deleteTemplate('tpl-1');

    const { templates } = useProcessTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('tpl-2');
  });

  it('clears selectedTemplate if deleted template was selected', async () => {
    useProcessTemplateStore.setState({
      templates: [{ id: 'tpl-1', name: 'ตู้ครัว' } as never],
      selectedTemplate: { id: 'tpl-1', name: 'ตู้ครัว' } as never,
    });

    const mockChain = buildQueryMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().deleteTemplate('tpl-1');

    expect(useProcessTemplateStore.getState().selectedTemplate).toBeNull();
  });

  it('keeps selectedTemplate if a DIFFERENT template is deleted', async () => {
    useProcessTemplateStore.setState({
      templates: [
        { id: 'tpl-1' } as never,
        { id: 'tpl-2' } as never,
      ],
      selectedTemplate: { id: 'tpl-2', name: 'ประตู' } as never,
    });

    const mockChain = buildQueryMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(mockChain);

    await useProcessTemplateStore.getState().deleteTemplate('tpl-1');

    expect(useProcessTemplateStore.getState().selectedTemplate?.id).toBe('tpl-2');
  });
});
