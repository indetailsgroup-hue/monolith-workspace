/**
 * ToolThresholdEditor.test.tsx - Tool Threshold Editor Component Tests
 *
 * Tests for the ToolThresholdEditor UI component.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders tool ID in header', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      expect(screen.getByText('DRILL_5')).toBeInTheDocument();
    });

    it('shows current threshold value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // Both Current and New boxes show 10,000 initially
      const values = screen.getAllByText('10,000');
      expect(values.length).toBeGreaterThanOrEqual(1);
    });

    it('renders slider with correct initial value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      expect(slider).toHaveValue('10000');
    });

    it('renders numeric input with correct initial value', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('10000');
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
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });
  });

  describe('Slider interaction', () => {
    it('updates displayed value when slider changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '15000' } });

      // New value should be displayed
      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue('15000');
    });

    it('updates health preview when slider changes', async () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '5000' } });

      // currentWearUnits: 5000, newThreshold: 5000
      // Health = 100 - (5000/5000 * 100) = 0%
      await waitFor(() => {
        expect(screen.getByText('0.0%')).toBeInTheDocument();
      });
    });
  });

  describe('Text input interaction', () => {
    it('accepts numeric input', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '20000' } });

      expect(input).toHaveValue('20000');
    });

    it('clamps value on blur if out of range (too low)', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.blur(input);

      // Should clamp to minimum 100
      expect(input).toHaveValue('100');
    });

    it('clamps large values to maximum', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '999999' } });
      fireEvent.blur(input);

      // Should clamp to maximum 100000
      expect(input).toHaveValue('100000');
    });

    it('reverts to current threshold on invalid input', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.blur(input);

      // Should revert to current threshold
      expect(input).toHaveValue('10000');
    });
  });

  describe('Preset buttons', () => {
    it('sets LIGHT preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const lightButton = screen.getByText(/Light/i).closest('button')!;
      fireEvent.click(lightButton);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue(String(THRESHOLD_PRESETS.LIGHT));
    });

    it('sets STANDARD preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const standardButton = screen.getByText(/Standard/i).closest('button')!;
      fireEvent.click(standardButton);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue(String(THRESHOLD_PRESETS.STANDARD));
    });

    it('sets HEAVY preset value when clicked', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      // Find the Heavy button (not Extra_heavy) by checking all buttons
      const allButtons = screen.getAllByRole('button');
      const heavyButton = allButtons.find(
        btn => btn.textContent?.includes('Heavy') && !btn.textContent?.includes('Extra')
      )!;
      fireEvent.click(heavyButton);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue(String(THRESHOLD_PRESETS.HEAVY));
    });
  });

  describe('Save and Cancel buttons', () => {
    it('calls onSave with new threshold when Save clicked', () => {
      const onSave = vi.fn();
      render(<ToolThresholdEditor {...defaultProps} onSave={onSave} />);

      // Change value
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '15000' } });

      // Click save
      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      expect(onSave).toHaveBeenCalledWith(15000);
    });

    it('calls onCancel when Cancel clicked', () => {
      const onCancel = vi.fn();
      render(<ToolThresholdEditor {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('disables Save button when no changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();
    });

    it('enables Save button when value changes', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '15000' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).not.toBeDisabled();
    });

    it('disables buttons when saving', () => {
      render(<ToolThresholdEditor {...defaultProps} saving={true} />);

      const saveButton = screen.getByRole('button', { name: /Saving/i });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });

      expect(saveButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it('shows "Saving..." text when saving', () => {
      render(<ToolThresholdEditor {...defaultProps} saving={true} />);

      expect(screen.getByText('Saving...')).toBeInTheDocument();
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

      expect(screen.getByText(/OK/i)).toBeInTheDocument();
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
        expect(screen.getByText(/NEARING LIMIT/i)).toBeInTheDocument();
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
        expect(screen.getByText(/OVER LIMIT/i)).toBeInTheDocument();
      });
    });
  });

  describe('Comparison display', () => {
    it('shows current vs new threshold comparison', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '15000' } });

      // Should show both current and new
      expect(screen.getByText('10,000')).toBeInTheDocument(); // Current
      expect(screen.getByText('15,000')).toBeInTheDocument(); // New
    });

    it('highlights new value when changed', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '15000' } });

      // The new value container should have different styling
      // We can check that both values are present
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
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
      expect(screen.getByText('100.0%')).toBeInTheDocument();
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
      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('handles very small threshold values', () => {
      render(<ToolThresholdEditor {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.blur(input);

      expect(input).toHaveValue('100');
    });
  });
});
