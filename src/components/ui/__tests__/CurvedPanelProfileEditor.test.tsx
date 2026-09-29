/**
 * @vitest-environment jsdom
 */

/**
 * CurvedPanelProfileEditor.test.tsx
 *
 * Unit tests for CurvedPanelProfileEditor component.
 *
 * Coverage:
 *   1. No panel selected → shows placeholder message
 *   2. Panel selected + RECT profile → shows kind selector, no arc fields
 *   3. Change kind to ARC → ARC fields appear (edge, radius, sweepDeg)
 *   4. Change kind to S_CURVE → dual-arc fields appear
 *   5. Change kind to ROUNDED_CORNER → corner radius inputs (TL/TR/BL/BR)
 *   6. Valid ARC → preview shows kerfCount / developedLength
 *   7. Invalid ARC (radius > panel half) → G12 error badge displayed
 *   8. Reset button calls updatePanelProfile with { kind: 'RECT' }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CurvedPanelProfileEditor } from '../CurvedPanelProfileEditor';

// ============================================
// MOCKS
// ============================================

// --- Store ---
const mockUpdatePanelProfile = vi.fn();
let mockSelectedPanelId: string | null = null;
let mockPanels: ReturnType<typeof makeMockPanel>[] = [];

vi.mock('../../../core/store/useCabinetStore', () => ({
  useCabinet: () =>
    mockPanels.length > 0 ? { panels: mockPanels } : null,
  useCabinetStore: (selector: (s: object) => unknown) =>
    selector({
      selectedPanelId: mockSelectedPanelId,
      updatePanelProfile: mockUpdatePanelProfile,
    }),
}));

// --- curve compute (let each test override via vi.mocked) ---
vi.mock('../../../core/manufacturing/curve/curveProfile', () => ({
  computeCurveProfile: vi.fn(() => ({
    valid: true,
    errors: [],
    arcSegments: [],
    kerfZones: [{ edge: 'TOP', start: 50, end: 550, depth: 80 }],
  })),
}));

vi.mock('../../../factory/packet/builders/curveFieldsComputer', () => ({
  resolveMaterial: vi.fn(() => 'MDF'),
  DEFAULT_KERF_TOOL: { kind: 'SAW', bladeKerf: 3.2, kEff: 3.4, maxDepth: 30 },
  computeCurveFields: vi.fn(() => ({
    kerfCount: 12,
    developedLength: 80,
    projectedDepth: 5,
    curvedEdge: 'TOP',
  })),
}));

// ============================================
// HELPERS
// ============================================

function makeMockPanel(profileOverride = {}) {
  return {
    id: 'panel-test-1',
    name: 'Left Side',
    role: 'LEFT_SIDE' as const,
    coreMaterialId: 'MDF_18',
    finishWidth: 600,
    finishHeight: 720,
    profile: { kind: 'RECT' as const },
    computed: { realThickness: 18, cutWidth: 597, cutHeight: 717, surfaceArea: 0, edgeLength: 0, cost: 0, co2: 0 },
    faces: { faceA: null, faceB: null },
    edges: { top: null, bottom: null, left: null, right: null },
    grainDirection: 'VERTICAL' as const,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    visible: true,
    selected: false,
    ...profileOverride,
  };
}

// ============================================
// TESTS
// ============================================

describe('CurvedPanelProfileEditor', () => {
  beforeEach(() => {
    mockUpdatePanelProfile.mockClear();
    mockSelectedPanelId = null;
    mockPanels = [];
  });

  afterEach(() => {
    cleanup();
  });

  // ── 1. No panel selected ──────────────────────────────────────

  it('shows placeholder when no panel is selected', () => {
    render(<CurvedPanelProfileEditor />);
    expect(screen.getByText(/เลือก panel ใน Catalog tab/i)).toBeTruthy();
  });

  // ── 2. Panel selected + RECT profile ─────────────────────────

  it('shows panel name and kind selector when panel is selected', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [makeMockPanel()];

    render(<CurvedPanelProfileEditor />);

    // Panel header
    expect(screen.getByText('Left Side')).toBeTruthy();
    // Kind buttons should be rendered
    expect(screen.getByText('แบน')).toBeTruthy();   // RECT
    expect(screen.getByText('โค้ง Arc')).toBeTruthy(); // ARC
    expect(screen.getByText('S-Curve')).toBeTruthy(); // S_CURVE
    expect(screen.getByText('โค้งมุม')).toBeTruthy(); // ROUNDED_CORNER

    // RECT placeholder message
    expect(screen.getByText(/แผ่นแบน/i)).toBeTruthy();
  });

  // ── 3. Kind → ARC ────────────────────────────────────────────

  it('clicking ARC kind calls updatePanelProfile with ARC defaults', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [makeMockPanel()];

    render(<CurvedPanelProfileEditor />);

    fireEvent.click(screen.getByText('โค้ง Arc'));

    expect(mockUpdatePanelProfile).toHaveBeenCalledWith(
      'panel-test-1',
      expect.objectContaining({ kind: 'ARC', edge: 'TOP', radius: 150, sweepDeg: 30 }),
    );
  });

  // ── 4. ARC profile — fields rendered ─────────────────────────

  it('shows ARC fields when profile.kind === ARC', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 150, sweepDeg: 30 } }),
    ];

    render(<CurvedPanelProfileEditor />);

    // Edge selector buttons
    expect(screen.getByText('บน')).toBeTruthy();
    expect(screen.getByText('ล่าง')).toBeTruthy();
    expect(screen.getByText('ซ้าย')).toBeTruthy();
    expect(screen.getByText('ขวา')).toBeTruthy();

    // Numeric labels
    expect(screen.getByText('รัศมี (Radius)')).toBeTruthy();
    expect(screen.getByText('มุมงอ (Sweep °)')).toBeTruthy();
  });

  // ── 5. S_CURVE fields ─────────────────────────────────────────

  it('shows dual-arc fields when profile.kind === S_CURVE', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({
        profile: { kind: 'S_CURVE', edge: 'BOTTOM', r1: 100, r2: 120, sweepDeg1: 20, sweepDeg2: 25 },
      }),
    ];

    render(<CurvedPanelProfileEditor />);

    expect(screen.getByText('Arc 1')).toBeTruthy();
    expect(screen.getByText('Arc 2')).toBeTruthy();
    expect(screen.getByText('r1 รัศมี')).toBeTruthy();
    expect(screen.getByText('r2 รัศมี')).toBeTruthy();
  });

  // ── 6. ROUNDED_CORNER fields ──────────────────────────────────

  it('shows corner radius inputs for ROUNDED_CORNER', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({
        profile: { kind: 'ROUNDED_CORNER', corners: { TL: 50, TR: 50, BL: 50, BR: 50 } },
      }),
    ];

    render(<CurvedPanelProfileEditor />);

    expect(screen.getByText('TL')).toBeTruthy();
    expect(screen.getByText('TR')).toBeTruthy();
    expect(screen.getByText('BL')).toBeTruthy();
    expect(screen.getByText('BR')).toBeTruthy();
  });

  // ── 7. Valid ARC → preview card ───────────────────────────────

  it('shows kerfCount and developedLength in preview for valid ARC', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 150, sweepDeg: 30 } }),
    ];

    render(<CurvedPanelProfileEditor />);

    // computeCurveFields mock returns kerfCount=12, developedLength=80
    expect(screen.getByText('12')).toBeTruthy();   // kerfCount
    expect(screen.getByText('80.0')).toBeTruthy(); // developedLength
  });

  // ── 8. Invalid ARC → G12 badge ───────────────────────────────

  it('shows G12 error badge when computeCurveProfile returns invalid', async () => {
    const { computeCurveProfile } = await import('../../../core/manufacturing/curve/curveProfile');
    vi.mocked(computeCurveProfile).mockReturnValueOnce({
      valid: false,
      errors: ['G12_FITTING_IN_KERF_ZONE'],
      arcSegments: [],
      kerfZones: [],
    });

    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 9999, sweepDeg: 30 } }),
    ];

    render(<CurvedPanelProfileEditor />);

    expect(screen.getByText(/G12: โค้งไม่พอดีขนาดแผ่น/i)).toBeTruthy();
    // Preview header should say invalid
    expect(screen.getByText(/✗ G12 Error/i)).toBeTruthy();
  });

  // ── 9. Reset button ───────────────────────────────────────────

  it('reset button calls updatePanelProfile with { kind: RECT }', () => {
    mockSelectedPanelId = 'panel-test-1';
    mockPanels = [
      makeMockPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 150, sweepDeg: 30 } }),
    ];

    render(<CurvedPanelProfileEditor />);

    fireEvent.click(screen.getByText('รีเซ็ตเป็นแผ่นแบน (RECT)'));

    expect(mockUpdatePanelProfile).toHaveBeenCalledWith(
      'panel-test-1',
      { kind: 'RECT' },
    );
  });
});
