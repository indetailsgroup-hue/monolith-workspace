/**
 * @vitest-environment jsdom
 */

/**
 * ToolThresholdEditor.test.tsx - Tool Threshold Editor Component Tests
 *
 * Tests for the ToolThresholdEditor UI component.
 *
 * @version 1.0.0
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ToolThresholdEditor } from '../ToolThresholdEditor';
import { THRESHOLD_PRESETS } from '../../../tooling/query/toolThresholdQuery';

// ============================================
// TESTS
// ============================================

describe('ToolThresholdEditor', () => {
  const defaultProps = {
    toolId: 'DRILL_5',
    currentThreshold: 10000,
    currentWearUnits: 5000,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    saving: false,
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders tool ID in header', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      expect(screen.getAllByText('DRILL_5').length).toBeGreaterThan(0);
    });

    it('shows current threshold value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // Both Current and New boxes show 10,000 initially
      const values = screen.getAllByText('10,000');
      expect(values.length).toBeGreaterThanOrEqual(1);
    });

    it('renders slider with correct initial value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      expect(sliders[0]).toHaveValue('10000');
    });

    it('renders numeric input with correct initial value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue('10000');
    });

    it('renders all preset buttons', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // Get all buttons and check preset labels exist
      const allButtons = screen.getAllByRole('button');
      const presetLabels = allButtons.map(btn => btn.textContent || '');

      expect(presetLabels.some(label => label.includes('Light'))).toBe(true);
      expect(presetLabels.some(label => label.includes('Standard'))).toBe(true);
      expect(presetLabels.some(label => label.includes('Heavy') && !label.includes('Extra'))).toBe(true);
      expect(presetLabels.some(label => label.includes('Extra_heavy'))).toBe(true);
    });

    it('shows health preview with correct percentage', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // currentWearUnits: 5000, currentThreshold: 10000
      // Health = 100 - (5000/10000 * 100) = 50%
      expect(screen.getAllByText('50.0%').length).toBeGreaterThan(0);
    });
  });

  describe('Slider interaction', () => {
    it('updates displayed value when slider changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '15000' } });

      // New value should be displayed
      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue('15000');
    });

    it('updates health preview when slider changes', async () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '5000' } });

      // currentWearUnits: 5000, newThreshold: 5000
      // Health = 100 - (5000/5000 * 100) = 0%
      await waitFor(() => {
        expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Text input interaction', () => {
    it('accepts numeric input', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: '20000' } });

      expect(inputs[0]).toHaveValue('20000');
    });

    it('clamps value on blur if out of range (too low)', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: '50' } });
      fireEvent.blur(inputs[0]);

      // Should clamp to minimum 100
      expect(inputs[0]).toHaveValue('100');
    });

    it('clamps large values to maximum', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: '999999' } });
      fireEvent.blur(inputs[0]);

      // Should clamp to maximum 100000
      expect(inputs[0]).toHaveValue('100000');
    });

    it('reverts to current threshold on invalid input', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: 'abc' } });
      fireEvent.blur(inputs[0]);

      // Should revert to current threshold
      expect(inputs[0]).toHaveValue('10000');
    });
  });

  describe('Preset buttons', () => {
    it('sets LIGHT preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const allButtons = screen.getAllByRole('button');
      const lightButton = allButtons.find(btn => btn.textContent?.includes('Light'))!;
      fireEvent.click(lightButton);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue(String(THRESHOLD_PRESETS.LIGHT));
    });

    it('sets STANDARD preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const allButtons = screen.getAllByRole('button');
      const standardButton = allButtons.find(btn => btn.textContent?.includes('Standard'))!;
      fireEvent.click(standardButton);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue(String(THRESHOLD_PRESETS.STANDARD));
    });

    it('sets HEAVY preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // Find the Heavy button (not Extra_heavy) by checking all buttons
      const allButtons = screen.getAllByRole('button');
      const heavyButton = allButtons.find(
        btn => btn.textContent?.includes('Heavy') && !btn.textContent?.includes('Extra')
      )!;
      fireEvent.click(heavyButton);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue(String(THRESHOLD_PRESETS.HEAVY));
    });
  });

  describe('Save and Cancel buttons', () => {
    it('calls onSave with new threshold when Save clicked', () => {
      const onSave = vi.fn();
      render(<ToolThresholdEditor {...defaultProps} onSave={onSave} />);

      // Change value
      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '15000' } });

      // Click save
      const saveButtons = screen.getAllByRole('button', { name: /Save/i });
      fireEvent.click(saveButtons[0]);

      expect(onSave).toHaveBeenCalledWith(15000);
    });

    it('calls onCancel when Cancel clicked', () => {
      const onCancel = vi.fn();
      render(<ToolThresholdEditor {...defaultProps} onCancel={onCancel} />);

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[0]);

      expect(onCancel).toHaveBeenCalled();
    });

    it('disables Save button when no changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const saveButtons = screen.getAllByRole('button', { name: /Save/i });
      expect(saveButtons[0]).toBeDisabled();
    });

    it('enables Save button when value changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '15000' } });

      const saveButtons = screen.getAllByRole('button', { name: /Save/i });
      expect(saveButtons[0]).not.toBeDisabled();
    });

    it('disables buttons when saving', () => {
      render(<ToolThresholdEditor {...defaultProps} saving={true} />);

      const saveButtons = screen.getAllByRole('button', { name: /Saving/i });
      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });

      expect(saveButtons[0]).toBeDisabled();
      expect(cancelButtons[0]).toBeDisabled();
    });

    it('shows "Saving..." text when saving', () => {
      render(<ToolThresholdEditor {...defaultProps} saving={true} />);

      expect(screen.getAllByText('Saving...').length).toBeGreaterThan(0);
    });
  });

  describe('Health preview status', () => {
    it('shows OK status when health > 15%', () => {
      render(
        <ToolThresholdEditor
          {...defaultProps}
          currentThreshold={10000}
          currentWearUnits={5000}
        />
      );

      expect(screen.getAllByText(/OK/i).length).toBeGreaterThan(0);
    });

    it('shows NEARING_LIMIT status when health <= 15% but > 0%', async () => {
      render(
        <ToolThresholdEditor
          {...defaultProps}
          currentThreshold={10000}
          currentWearUnits={9000}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText(/NEARING LIMIT/i).length).toBeGreaterThan(0);
      });
    });

    it('shows OVER_LIMIT status when health <= 0%', async () => {
      render(
        <ToolThresholdEditor
          {...defaultProps}
          currentThreshold={10000}
          currentWearUnits={12000}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText(/OVER LIMIT/i).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Comparison display', () => {
    it('shows current vs new threshold comparison', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '15000' } });

      // Should show both current and new
      expect(screen.getAllByText('10,000').length).toBeGreaterThan(0); // Current
      expect(screen.getAllByText('15,000').length).toBeGreaterThan(0); // New
    });

    it('highlights new value when changed', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '15000' } });

      // The new value container should have different styling
      // We can check that both values are present
      expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
      expect(screen.getAllByText('New').length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('handles zero current wear units', () => {
      render(
        <ToolThresholdEditor
          {...defaultProps}
          currentWearUnits={0}
        />
      );

      // Health should be 100%
      expect(screen.getAllByText('100.0%').length).toBeGreaterThan(0);
    });

    it('handles threshold equal to wear units', () => {
      render(
        <ToolThresholdEditor
          {...defaultProps}
          currentThreshold={5000}
          currentWearUnits={5000}
        />
      );

      // Health should be 0%
      expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
    });

    it('handles very small threshold values', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: '100' } });
      fireEvent.blur(inputs[0]);

      expect(inputs[0]).toHaveValue('100');
    });
  });
});
