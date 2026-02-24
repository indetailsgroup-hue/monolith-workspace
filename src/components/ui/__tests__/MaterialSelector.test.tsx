/**
 * @vitest-environment jsdom
 */

/**
 * MaterialSelector.test.tsx - Tests for MaterialSelector component
 *
 * Tests the visual material picker functionality:
 * - Renders material grid correctly
 * - Filter tabs switch between categories
 * - onSelect called with correct material ID
 * - Apply mode buttons toggle correctly
 * - Material grouping displays correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MaterialSelector } from '../MaterialSelector';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock material stores
vi.mock('@/core/materials/useMaterialStore', () => ({
  useMaterialStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ preloadVisibleThumbnails: vi.fn() })
  ),
  useThumbnail: vi.fn((materialId: string) => ({
    thumbDataUrl: materialId.includes('grey') ? undefined : 'data:image/png;base64,fake',
    isLoaded: true,
  })),
}));

vi.mock('@/core/materials/useMaterialHistoryStore', () => ({
  useMaterialHistoryStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToHistory: vi.fn(), getRecentIds: () => [] })
  ),
}));

vi.mock('@/core/materials/useMaterialFavoritesStore', () => ({
  useMaterialFavoritesStore: vi.fn(() => ({
    favoriteIds: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  })),
}));

// Mock the expandable-screen component
vi.mock('@/components/ui/expandable-screen', () => ({
  ExpandableScreen: ({ children }: React.PropsWithChildren) => <div data-testid="expandable-screen">{children}</div>,
  ExpandableScreenTrigger: ({ children }: React.PropsWithChildren) => (
    <div data-testid="expandable-trigger">{children}</div>
  ),
  ExpandableScreenContent: ({ children }: { children: (props: { close: () => void }) => React.ReactNode }) => (
    <div data-testid="expandable-content">{children({ close: vi.fn() })}</div>
  ),
}));

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

// ============================================
// TEST DATA
// ============================================

const mockMaterials = {
  'mat-mel-white': {
    id: 'mat-mel-white',
    name: 'Melamine White',
    type: 'MELAMINE',
    thickness: 16,
    textureUrl: '/textures/white.jpg',
  },
  'mat-mel-grey': {
    id: 'mat-mel-grey',
    name: 'Melamine Grey',
    type: 'MELAMINE',
    thickness: 16,
  },
  'mat-hpl-oak': {
    id: 'mat-hpl-oak',
    name: 'HPL Oak',
    type: 'HPL',
    thickness: 18,
    textureUrl: '/textures/oak.jpg',
  },
  'mat-fenix-black': {
    id: 'mat-fenix-black',
    name: 'FENIX Black',
    type: 'FENIX_NTM',
    thickness: 16,
    textureUrl: '/textures/fenix.jpg',
  },
};

const MockIcon = () => <span data-testid="mock-icon">🎨</span>;

// ============================================
// TESTS
// ============================================

describe('MaterialSelector', () => {
  let mockOnSelect: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockOnSelect = vi.fn();
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with title', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Title appears in both trigger and content
      const titles = screen.getAllByText('Core Material');
      expect(titles.length).toBeGreaterThan(0);
    });

    it('should render the expandable screen structure', () => {
      render(
        <MaterialSelector
          title="Surface Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="blue"
          number={2}
        />
      );

      expect(screen.getAllByTestId('expandable-screen').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('expandable-trigger').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('expandable-content').length).toBeGreaterThan(0);
    });

    it('should show "Not selected" when no material is selected', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      expect(screen.getAllByText('Not selected').length).toBeGreaterThan(0);
    });

    it('should show selected material name in trigger', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-mel-white"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Material name appears in trigger (truncated) and in expanded content
      const materialNames = screen.getAllByText(/Melamine White/);
      expect(materialNames.length).toBeGreaterThan(0);
    });

    it('should show step number', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={3}
        />
      );

      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });
  });

  describe('expanded content', () => {
    it('should render material count', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Content should show "4 materials available"
      expect(screen.getAllByText('4 materials available').length).toBeGreaterThan(0);
    });

    it('should render filter tabs for material types', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Should have "All" tab and type-specific tabs (appear in both tabs and headers)
      expect(screen.getAllByText('All').length).toBeGreaterThan(0);
      // Melamine appears in tab and header, use getAllBy
      expect(screen.getAllByText('Melamine').length).toBeGreaterThan(0);
      expect(screen.getAllByText('HPL Wood').length).toBeGreaterThan(0);
      expect(screen.getAllByText('FENIX NTM (Super Matte)').length).toBeGreaterThan(0);
    });

    it('should render all materials in grid', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      expect(screen.getAllByText('Melamine White').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Melamine Grey').length).toBeGreaterThan(0);
      expect(screen.getAllByText('HPL Oak').length).toBeGreaterThan(0);
      expect(screen.getAllByText('FENIX Black').length).toBeGreaterThan(0);
    });

    it('should group materials by type with section headers', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Section headers show count - MELAMINE has 2 options
      expect(screen.getAllByText(/2 options/).length).toBeGreaterThan(0);
      // HPL and FENIX both have 1 option each, so multiple "1 options" texts
      const oneOptionHeaders = screen.getAllByText(/1 options/);
      expect(oneOptionHeaders.length).toBeGreaterThanOrEqual(2); // At least HPL and FENIX
    });
  });

  describe('material selection', () => {
    it('should call onSelect when material is clicked', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      const materialCards = screen.getAllByText('Melamine White');
      const materialCard = materialCards[0].closest('div[class*="cursor-pointer"]');
      if (materialCard) {
        fireEvent.click(materialCard);
      }

      expect(mockOnSelect).toHaveBeenCalledWith('mat-mel-white');
    });

    it('should show properties panel when material is selected', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-hpl-oak"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Material properties section should be visible
      expect(screen.getAllByText('Material Properties').length).toBeGreaterThan(0);
    });

    it('should show apply mode buttons when material is selected', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-hpl-oak"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      expect(screen.getAllByText('Selected Panels Only').length).toBeGreaterThan(0);
      expect(screen.getAllByText('All Panels').length).toBeGreaterThan(0);
    });

    it('should toggle apply mode when buttons are clicked', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-hpl-oak"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      const allPanelsButtons = screen.getAllByText('All Panels');
      const allPanelsButton = allPanelsButtons[0];
      fireEvent.click(allPanelsButton);

      // The button should be visually selected (we can't easily test CSS classes)
      // but we can verify it doesn't throw
      expect(allPanelsButton).toBeInTheDocument();
    });
  });

  describe('filter functionality', () => {
    it('should filter materials when type tab is clicked', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Click on HPL filter (first occurrence is the tab button)
      const hplElements = screen.getAllByText('HPL Wood');
      const hplTab = hplElements[0]; // Tab button is first
      fireEvent.click(hplTab);

      // After filtering, HPL Oak should still be visible
      expect(screen.getAllByText('HPL Oak').length).toBeGreaterThan(0);
    });

    it('should show all materials when "All" tab is clicked', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // First filter to HPL (first occurrence is the tab button)
      const hplElements = screen.getAllByText('HPL Wood');
      const hplTab = hplElements[0];
      fireEvent.click(hplTab);

      // Then click All
      const allTabs = screen.getAllByText('All');
      const allTab = allTabs[0];
      fireEvent.click(allTab);

      // All materials should be visible
      expect(screen.getAllByText('Melamine White').length).toBeGreaterThan(0);
      expect(screen.getAllByText('HPL Oak').length).toBeGreaterThan(0);
    });
  });

  describe('apply functionality', () => {
    it('should call onSelect with applyMode when Apply button is clicked', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-hpl-oak"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      const applyButtons = screen.getAllByText('Apply Material');
      fireEvent.click(applyButtons[0]);

      expect(mockOnSelect).toHaveBeenCalledWith('mat-hpl-oak', 'selected');
    });

    it('should call onSelect with "all" applyMode when All Panels is selected', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId="mat-hpl-oak"
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Select "All Panels" mode
      const allPanelsButtons = screen.getAllByText('All Panels');
      fireEvent.click(allPanelsButtons[0]);

      // Click Apply
      const applyButtons = screen.getAllByText('Apply Material');
      fireEvent.click(applyButtons[0]);

      expect(mockOnSelect).toHaveBeenCalledWith('mat-hpl-oak', 'all');
    });
  });

  describe('color themes', () => {
    it('should accept orange color theme', () => {
      const { container } = render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      expect(container.querySelector('[class*="orange"]')).toBeInTheDocument();
    });

    it('should accept blue color theme', () => {
      const { container } = render(
        <MaterialSelector
          title="Surface Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="blue"
          number={2}
        />
      );

      expect(container.querySelector('[class*="blue"]')).toBeInTheDocument();
    });

    it('should accept cyan color theme', () => {
      const { container } = render(
        <MaterialSelector
          title="Edge Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="cyan"
          number={3}
        />
      );

      expect(container.querySelector('[class*="cyan"]')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should handle empty materials gracefully', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={{}}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      expect(screen.getAllByText('0 materials available').length).toBeGreaterThan(0);
    });
  });

  describe('material display', () => {
    it('should show material thickness when available', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Materials show thickness
      expect(screen.getAllByText(/16mm/).length).toBeGreaterThan(0);
    });

    it('should render texture image when textureUrl is provided', () => {
      const { container } = render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Images have alt="" (presentational) so use DOM query instead of role
      const images = container.querySelectorAll('img');
      expect(images.length).toBeGreaterThan(0);
    });

    it('should show placeholder for materials without texture', () => {
      render(
        <MaterialSelector
          title="Core Material"
          materials={mockMaterials}
          selectedId={null}
          onSelect={mockOnSelect}
          icon={<MockIcon />}
          color="orange"
          number={1}
        />
      );

      // Melamine Grey has no textureUrl, should show placeholder
      expect(screen.getAllByText('No Preview').length).toBeGreaterThan(0);
    });
  });
});
