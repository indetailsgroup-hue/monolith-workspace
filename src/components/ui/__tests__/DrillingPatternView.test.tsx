/**
 * @vitest-environment jsdom
 */

/**
 * DrillingPatternView.test.tsx - Tests for DrillingPatternView component
 *
 * Tests:
 * - Renders all patterns from DRILLING_PATTERNS
 * - Shows SVG elements for holes
 * - Shows pattern details when a pattern is selected
 * - Pattern count matches DRILLING_PATTERNS
 * - Highlights pattern when a fitting is selected
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { DrillingPatternView } from '../DrillingPatternView';
import { DrillingPatternDetailCard } from '../DrillingPatternDetailCard';
import { DRILLING_PATTERNS, FITTING_CATALOGUE } from '../../../core/fitting/FittingCatalogue';

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

afterEach(() => {
  cleanup();
});

// ============================================
// TESTS: DrillingPatternView
// ============================================

describe('DrillingPatternView', () => {
  const patternKeys = Object.keys(DRILLING_PATTERNS);
  const patternCount = patternKeys.length;

  describe('rendering', () => {
    it('should render the drilling pattern view container', () => {
      render(<DrillingPatternView />);
      expect(screen.getByTestId('drilling-pattern-view')).toBeInTheDocument();
    });

    it('should render all patterns from DRILLING_PATTERNS', () => {
      render(<DrillingPatternView />);

      for (const key of patternKeys) {
        expect(screen.getByTestId(`pattern-item-${key}`)).toBeInTheDocument();
      }
    });

    it('should display the correct pattern count in the header', () => {
      render(<DrillingPatternView />);
      expect(
        screen.getByText(`${patternCount} pattern${patternCount !== 1 ? 's' : ''} in catalogue`),
      ).toBeInTheDocument();
    });

    it('should show pattern names', () => {
      render(<DrillingPatternView />);

      for (const key of patternKeys) {
        const pattern = DRILLING_PATTERNS[key];
        // Pattern name appears in the list item text and in the SVG label
        const names = screen.getAllByText(pattern.name);
        expect(names.length).toBeGreaterThan(0);
      }
    });

    it('should show hole counts for each pattern', () => {
      render(<DrillingPatternView />);

      for (const key of patternKeys) {
        const pattern = DRILLING_PATTERNS[key];
        const holeText = `${pattern.holes.length} hole${pattern.holes.length !== 1 ? 's' : ''}`;
        const matches = screen.getAllByText(holeText);
        expect(matches.length).toBeGreaterThan(0);
      }
    });
  });

  describe('SVG visualization', () => {
    it('should render SVG elements for each pattern', () => {
      render(<DrillingPatternView />);

      const svgs = screen.getAllByTestId('pattern-svg');
      expect(svgs.length).toBe(patternCount);
    });

    it('should render panel outline rectangles', () => {
      render(<DrillingPatternView />);

      const outlines = screen.getAllByTestId('panel-outline');
      expect(outlines.length).toBe(patternCount);
    });

    it('should render hole circles for each pattern', () => {
      render(<DrillingPatternView />);

      // Total hole circles rendered should equal sum of all pattern holes
      const totalHoles = patternKeys.reduce(
        (sum, key) => sum + DRILLING_PATTERNS[key].holes.length,
        0,
      );

      // Each pattern's SVG contains hole circles scoped by pattern item
      for (const key of patternKeys) {
        const pattern = DRILLING_PATTERNS[key];
        const patternItem = screen.getByTestId(`pattern-item-${key}`);
        for (let i = 0; i < pattern.holes.length; i++) {
          expect(within(patternItem).getByTestId(`hole-circle-${i}`)).toBeInTheDocument();
        }
      }

      // Also verify total count
      const allCircles = screen.getAllByTestId(/^hole-circle-/);
      expect(allCircles.length).toBe(totalHoles);
    });

    it('should render depth labels for holes', () => {
      render(<DrillingPatternView />);

      // Check that depth labels are present
      for (const key of patternKeys) {
        const pattern = DRILLING_PATTERNS[key];
        for (let i = 0; i < pattern.holes.length; i++) {
          const depthLabels = screen.getAllByTestId(`hole-depth-label-${i}`);
          expect(depthLabels.length).toBeGreaterThan(0);
        }
      }
    });

    it('should render system type labels in SVG', () => {
      render(<DrillingPatternView />);

      const labels = screen.getAllByTestId('system-type-label');
      expect(labels.length).toBe(patternCount);
    });
  });

  describe('pattern selection', () => {
    it('should show detail card when a pattern is clicked', () => {
      render(<DrillingPatternView />);

      // Click the first pattern
      const firstKey = patternKeys[0];
      fireEvent.click(screen.getByTestId(`pattern-item-${firstKey}`));

      // Detail card should appear
      expect(screen.getByTestId('drilling-pattern-detail-card')).toBeInTheDocument();
    });

    it('should hide detail card when the same pattern is clicked again', () => {
      render(<DrillingPatternView />);

      const firstKey = patternKeys[0];
      const patternButton = screen.getByTestId(`pattern-item-${firstKey}`);

      // Click to open
      fireEvent.click(patternButton);
      expect(screen.getByTestId('drilling-pattern-detail-card')).toBeInTheDocument();

      // Click again to close
      fireEvent.click(patternButton);
      expect(screen.queryByTestId('drilling-pattern-detail-card')).not.toBeInTheDocument();
    });

    it('should show hole details table in the detail card', () => {
      render(<DrillingPatternView />);

      const firstKey = patternKeys[0];
      fireEvent.click(screen.getByTestId(`pattern-item-${firstKey}`));

      const pattern = DRILLING_PATTERNS[firstKey];
      for (let i = 0; i < pattern.holes.length; i++) {
        expect(screen.getByTestId(`hole-row-${i}`)).toBeInTheDocument();
      }
    });

    it('should close detail card via close button', () => {
      render(<DrillingPatternView />);

      const firstKey = patternKeys[0];
      fireEvent.click(screen.getByTestId(`pattern-item-${firstKey}`));

      // Click the close button (aria-label)
      const closeButton = screen.getByLabelText('Close detail card');
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('drilling-pattern-detail-card')).not.toBeInTheDocument();
    });
  });

  describe('fitting highlighting', () => {
    it('should highlight pattern when selectedFittingId matches', () => {
      // Find a fitting that uses BLUM_CLIP_35MM
      const fitting = FITTING_CATALOGUE.find(
        (f) => f.drillingPatternId === 'BLUM_CLIP_35MM',
      );
      expect(fitting).toBeDefined();

      const { container } = render(
        <DrillingPatternView selectedFittingId={fitting!.id} />,
      );

      // The BLUM_CLIP_35MM pattern item should have green-500 border class (highlight)
      const patternItem = screen.getByTestId('pattern-item-BLUM_CLIP_35MM');
      expect(patternItem.className).toContain('green-500');
    });

    it('should not highlight when no fitting is selected', () => {
      render(<DrillingPatternView />);

      const patternItem = screen.getByTestId('pattern-item-BLUM_CLIP_35MM');
      expect(patternItem.className).not.toContain('green-500');
    });
  });

  describe('pattern count validation', () => {
    it('should match the count of DRILLING_PATTERNS', () => {
      render(<DrillingPatternView />);

      const patternList = screen.getByTestId('pattern-list');
      const items = within(patternList).getAllByTestId(/^pattern-item-/);
      expect(items.length).toBe(Object.keys(DRILLING_PATTERNS).length);
    });
  });
});

// ============================================
// TESTS: DrillingPatternDetailCard
// ============================================

describe('DrillingPatternDetailCard', () => {
  const samplePattern = DRILLING_PATTERNS['BLUM_CLIP_35MM'];

  it('should render pattern name', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);
    expect(screen.getByText(samplePattern.name)).toBeInTheDocument();
  });

  it('should render system type badge', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);
    const badge = screen.getByTestId('system-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('SYSTEM 32');
  });

  it('should render hole rows', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);

    for (let i = 0; i < samplePattern.holes.length; i++) {
      expect(screen.getByTestId(`hole-row-${i}`)).toBeInTheDocument();
    }
  });

  it('should display hole dimensions', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);

    // Check that the first hole diameter and depth are shown
    const firstHole = samplePattern.holes[0];
    expect(screen.getByText(`${firstHole.diameter}mm`)).toBeInTheDocument();
    expect(screen.getByText(`${firstHole.depth}mm`)).toBeInTheDocument();
  });

  it('should show associated fittings', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);

    const associatedFittings = FITTING_CATALOGUE.filter(
      (f) => f.drillingPatternId === samplePattern.id,
    );
    expect(associatedFittings.length).toBeGreaterThan(0);

    for (const fitting of associatedFittings) {
      expect(screen.getByTestId(`associated-fitting-${fitting.id}`)).toBeInTheDocument();
    }
  });

  it('should render mini SVG preview', () => {
    render(<DrillingPatternDetailCard pattern={samplePattern} />);
    expect(screen.getByTestId('mini-svg-preview')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DrillingPatternDetailCard pattern={samplePattern} onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close detail card');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
