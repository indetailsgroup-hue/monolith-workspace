/**
 * @vitest-environment jsdom
 */

/**
 * PanelConfigModal.test.tsx - Tests for PanelConfigModal component
 *
 * Tests panel configuration functionality:
 * - Modal renders with correct panel data
 * - Material selection updates store
 * - Edge banding toggles persist correctly
 * - Position offset inputs work
 * - onClose called when modal closes
 * - Panel not found shows nothing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PanelConfigModal } from '../PanelConfigModal';

// ============================================
// MOCK DATA
// ============================================

const mockPanel = {
  id: 'panel-shelf-1',
  name: 'Shelf 1',
  role: 'SHELF' as const,
  position: [0, 200, 0] as [number, number, number],
  coreMaterialId: 'core-pb-16',
  finishWidth: 800,
  finishHeight: 500,
  faces: {
    faceA: 'surf-mel-white',
    faceB: 'surf-mel-white',
  },
  edges: {
    top: 'edge-pvc-1',
    bottom: null,
    left: 'edge-pvc-1',
    right: 'edge-pvc-1',
  },
};

const mockSidePanel = {
  id: 'panel-left-1',
  name: 'Left Side',
  role: 'LEFT_SIDE' as const,
  position: [0, 0, 0] as [number, number, number],
  coreMaterialId: 'core-pb-16',
  finishWidth: 600,
  finishHeight: 720,
  faces: {
    faceA: 'surf-mel-white',
    faceB: 'surf-mel-white',
  },
  edges: {
    top: null,
    bottom: null,
    left: null,
    right: null,
  },
};

const mockCabinet = {
  id: 'cabinet-1',
  name: 'Test Cabinet',
  panels: [mockPanel, mockSidePanel],
  dimensions: {
    width: 800,
    height: 720,
    depth: 550,
  },
};

const mockCoreMaterials = {
  'core-pb-16': {
    id: 'core-pb-16',
    name: 'Particle Board 16mm',
    thickness: 16,
    costPerSqm: 250,
    co2PerSqm: 8.2,
  },
  'core-mdf-18': {
    id: 'core-mdf-18',
    name: 'MDF 18mm',
    thickness: 18,
    costPerSqm: 360,
    co2PerSqm: 10.2,
  },
};

const mockSurfaceMaterials = {
  'surf-mel-white': {
    id: 'surf-mel-white',
    name: 'Melamine White',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 120,
    co2PerSqm: 0.5,
    color: '#F5F5F5',
  },
  'surf-hpl-oak': {
    id: 'surf-hpl-oak',
    name: 'HPL Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 580,
    co2PerSqm: 2.1,
    color: '#8B7355',
    textureUrl: '/textures/oak.jpg',
  },
};

const mockEdgeMaterials = {
  'edge-pvc-1': {
    id: 'edge-pvc-1',
    name: 'PVC White 1mm',
    code: 'PVC-W-1.0',
    thickness: 1,
    height: 22,
    costPerMeter: 15,
    color: '#FFFFFF',
  },
  'edge-pvc-2': {
    id: 'edge-pvc-2',
    name: 'PVC Grey 2mm',
    code: 'PVC-G-2.0',
    thickness: 2,
    height: 22,
    costPerMeter: 25,
    color: '#666666',
  },
};

// Mock store state and functions
const mockUpdatePanelMaterial = vi.fn();
const mockUpdatePanelEdge = vi.fn();

// Mock the store
vi.mock('@/core/store/useCabinetStore', () => ({
  useCabinetStore: vi.fn(() => ({
    coreMaterials: mockCoreMaterials,
    surfaceMaterials: mockSurfaceMaterials,
    edgeMaterials: mockEdgeMaterials,
    updatePanelMaterial: mockUpdatePanelMaterial,
    updatePanelEdge: mockUpdatePanelEdge,
  })),
  useCabinet: vi.fn(() => mockCabinet),
}));

// Mock the ManufacturingCalculator
vi.mock('@/core/engines/ManufacturingCalculator', () => ({
  calculateTotalThickness: vi.fn(() => 16.6),
  calculateInternalDepth: vi.fn(() => 500),
  calculateCutDimensions: vi.fn(() => ({ cutWidth: 799, cutHeight: 499 })),
  getShelfDepthFormula: vi.fn(() => 'D(550) - Back(6) - Front(20) - Set(24)'),
  DEFAULT_BACK_CONFIG: {
    grooveOffset: 10,
    thickness: 6,
  },
}));

// ============================================
// TESTS
// ============================================

describe('PanelConfigModal', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockUpdatePanelMaterial.mockClear();
    mockUpdatePanelEdge.mockClear();
  });

  describe('rendering', () => {
    it('should render modal with panel name', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Shelf 1').length).toBeGreaterThan(0);
    });

    it('should render "Individual Configuration" subtitle', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Individual Configuration').length).toBeGreaterThan(0);
    });

    it('should render close button', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // X button in header
      const closeButtons = screen.getAllByRole('button');
      expect(closeButtons.length).toBeGreaterThan(0);
    });

    it('should render Done button in footer', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    });

    it('should return null if panel not found', () => {
      const { container } = render(
        <PanelConfigModal panelId="non-existent-panel" onClose={mockOnClose} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('position controls (shelves/dividers)', () => {
    it('should show position controls for SHELF panels', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Front Setback').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Back Setback (LED)').length).toBeGreaterThan(0);
    });

    it('should NOT show position controls for SIDE panels', () => {
      render(<PanelConfigModal panelId="panel-left-1" onClose={mockOnClose} />);

      expect(screen.queryAllByText('Front Setback').length).toBe(0);
      expect(screen.queryAllByText('Back Setback (LED)').length).toBe(0);
    });

    it('should show Gap Height control for shelves', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText(/Gap Height/).length).toBeGreaterThan(0);
    });

    it('should update front setback when slider changes', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      const sliders = screen.getAllByRole('slider');
      const frontSlider = sliders[0]; // First slider is front setback

      fireEvent.change(frontSlider, { target: { value: '30' } });

      expect(screen.getAllByText('30 mm').length).toBeGreaterThan(0);
    });
  });

  describe('core material selection', () => {
    it('should render Core Structure section', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Core Structure').length).toBeGreaterThan(0);
    });

    it('should list all core materials', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Particle Board 16mm').length).toBeGreaterThan(0);
      expect(screen.getAllByText('MDF 18mm').length).toBeGreaterThan(0);
    });

    it('should call updatePanelMaterial when core is changed', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      const mdfButtons = screen.getAllByText('MDF 18mm');
      fireEvent.click(mdfButtons[0]);

      expect(mockUpdatePanelMaterial).toHaveBeenCalledWith(
        'panel-shelf-1',
        'core',
        'core-mdf-18'
      );
    });

    it('should show material thickness', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('16mm').length).toBeGreaterThan(0);
      expect(screen.getAllByText('18mm').length).toBeGreaterThan(0);
    });
  });

  describe('face material selection', () => {
    it('should render Face A section', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Face A (Primary)').length).toBeGreaterThan(0);
    });

    it('should render Face B section', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Face B (Outer)').length).toBeGreaterThan(0);
    });

    it('should call updatePanelMaterial when Face A is changed', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Find surface material buttons (they're in the grid)
      const oakButtons = screen.getAllByText('HPL Oak');
      // First occurrence should be in Face A section
      if (oakButtons[0]) {
        fireEvent.click(oakButtons[0]);
      }

      expect(mockUpdatePanelMaterial).toHaveBeenCalledWith(
        'panel-shelf-1',
        'faceA',
        'surf-hpl-oak'
      );
    });

    it('should sync Face B with Face A when synced', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // By default, Face B is synced
      expect(screen.getAllByText('Synced').length).toBeGreaterThan(0);

      // Change Face A
      const oakButtons = screen.getAllByText('HPL Oak');
      if (oakButtons[0]) {
        fireEvent.click(oakButtons[0]);
      }

      // Should update both faceA and faceB
      expect(mockUpdatePanelMaterial).toHaveBeenCalledWith(
        'panel-shelf-1',
        'faceA',
        'surf-hpl-oak'
      );
      expect(mockUpdatePanelMaterial).toHaveBeenCalledWith(
        'panel-shelf-1',
        'faceB',
        'surf-hpl-oak'
      );
    });

    it('should show Face B materials when unsynced', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Click to unsync
      const syncButtons = screen.getAllByText('Synced');
      fireEvent.click(syncButtons[0]);

      // Should show Custom
      expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);

      // Face B material grid should be visible
      const oakButtons = screen.getAllByText('HPL Oak');
      expect(oakButtons.length).toBeGreaterThan(1); // At least 2 (one in each section)
    });
  });

  describe('edge banding selection', () => {
    it('should render Edge Banding section', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Edge Banding').length).toBeGreaterThan(0);
    });

    it('should render edge selects for all sides', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('TOP').length).toBeGreaterThan(0);
      expect(screen.getAllByText('BOTTOM').length).toBeGreaterThan(0);
      expect(screen.getAllByText('LEFT').length).toBeGreaterThan(0);
      expect(screen.getAllByText('RIGHT').length).toBeGreaterThan(0);
    });

    it('should call updatePanelEdge when edge is changed', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Find the TOP select and change it
      const selects = screen.getAllByRole('combobox');
      const topSelect = selects[0]; // First select is TOP

      fireEvent.change(topSelect, { target: { value: 'edge-pvc-2' } });

      expect(mockUpdatePanelEdge).toHaveBeenCalledWith(
        'panel-shelf-1',
        'top',
        'edge-pvc-2'
      );
    });

    it('should call updatePanelEdge with null when "None" is selected', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      const selects = screen.getAllByRole('combobox');
      const topSelect = selects[0];

      fireEvent.change(topSelect, { target: { value: 'none' } });

      expect(mockUpdatePanelEdge).toHaveBeenCalledWith(
        'panel-shelf-1',
        'top',
        null
      );
    });

    it('should show all edge material options', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Each select should have None + all edge materials
      const selects = screen.getAllByRole('combobox');
      expect(selects[0]).toContainHTML('None');
      expect(selects[0]).toContainHTML('PVC White 1mm');
      expect(selects[0]).toContainHTML('PVC Grey 2mm');
    });
  });

  describe('manufacturing data', () => {
    it('should show Manufacturing Data section', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Manufacturing Data').length).toBeGreaterThan(0);
    });

    it('should show FINISH dimensions', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('FINISH').length).toBeGreaterThan(0);
      expect(screen.getAllByText('800.0 × 500.0').length).toBeGreaterThan(0);
    });

    it('should show CUT dimensions', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('CUT').length).toBeGreaterThan(0);
      expect(screen.getAllByText('799.0 × 499.0').length).toBeGreaterThan(0);
    });

    it('should show thickness', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      expect(screen.getAllByText('Thk: 16.6mm').length).toBeGreaterThan(0);
    });

    it('should show formula for shelves', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Formula should be visible
      expect(screen.getAllByText(/D\(550\)/).length).toBeGreaterThan(0);
    });
  });

  describe('modal actions', () => {
    it('should call onClose when X button is clicked', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      // Find X button (it's the button with X icon in header)
      const buttons = screen.getAllByRole('button');
      const closeButton = buttons.find((btn) =>
        btn.querySelector('svg.lucide-x') || btn.textContent === ''
      );

      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when Done button is clicked', () => {
      render(<PanelConfigModal panelId="panel-shelf-1" onClose={mockOnClose} />);

      const doneButtons = screen.getAllByText('Done');
      fireEvent.click(doneButtons[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('different panel roles', () => {
    it('should show correct formula for side panels', () => {
      render(<PanelConfigModal panelId="panel-left-1" onClose={mockOnClose} />);

      // Side panels show depth formula
      expect(screen.getAllByText(/D\(550\)/).length).toBeGreaterThan(0);
    });
  });
});
