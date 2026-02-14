/**
 * ToolResetButton.test.tsx - Tool Reset Button Component Tests
 *
 * Tests for the ToolResetButton UI component.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolResetButton } from '../ToolResetButton';

// ============================================
// TESTS
// ============================================

describe('ToolResetButton', () => {
  const defaultProps = {
    toolId: 'DRILL_5',
    onReset: vi.fn(),
    onCancel: vi.fn(),
    resetting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders tool ID in warning message', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getByText('DRILL_5')).toBeInTheDocument();
    });

    it('renders warning header', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getByText('Reset Tool Wear')).toBeInTheDocument();
    });

    it('renders all reason options', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getByText('Replaced')).toBeInTheDocument();
      expect(screen.getByText('Resharpened')).toBeInTheDocument();
      expect(screen.getByText('Manual Reset')).toBeInTheDocument();
    });

    it('renders note textarea', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getByPlaceholderText(/New tool installed/i)
      ).toBeInTheDocument();
    });

    it('renders confirmation checkbox', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(
        screen.getByText(/I understand this action cannot be undone/i)
      ).toBeInTheDocument();
    });

    it('renders Cancel and Reset buttons', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset Wear/i })).toBeInTheDocument();
    });
  });

  describe('Reason selection', () => {
    it('selects REPLACED by default', () => {
      render(<ToolResetButton {...defaultProps} />);

      const replacedButton = screen.getByText('Replaced').closest('button');
      expect(replacedButton).toHaveStyle({ borderColor: '#8b5cf6' });
    });

    it('allows selecting different reasons', () => {
      render(<ToolResetButton {...defaultProps} />);

      const resharpButton = screen.getByText('Resharpened').closest('button')!;
      fireEvent.click(resharpButton);

      // The resharpened button should now be selected
      expect(resharpButton).toHaveStyle({ borderColor: '#8b5cf6' });
    });

    it('passes selected reason to onReset', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Select RESHARPENED
      const resharpButton = screen.getByText('Resharpened').closest('button')!;
      fireEvent.click(resharpButton);

      // Check confirmation
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'RESHARPENED',
        note: undefined,
      });
    });
  });

  describe('Note input', () => {
    it('allows entering a note', () => {
      render(<ToolResetButton {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/New tool installed/i);
      fireEvent.change(textarea, { target: { value: 'Test note' } });

      expect(textarea).toHaveValue('Test note');
    });

    it('passes note to onReset', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Enter note
      const textarea = screen.getByPlaceholderText(/New tool installed/i);
      fireEvent.change(textarea, { target: { value: 'New Guhring drill' } });

      // Check confirmation
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: 'New Guhring drill',
      });
    });

    it('trims whitespace from note', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Enter note with whitespace
      const textarea = screen.getByPlaceholderText(/New tool installed/i);
      fireEvent.change(textarea, { target: { value: '  test  ' } });

      // Check confirmation
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: 'test',
      });
    });

    it('passes undefined when note is empty', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Check confirmation (no note entered)
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: undefined,
      });
    });
  });

  describe('Confirmation checkbox', () => {
    it('is unchecked by default', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('can be checked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it('disables Reset button when unchecked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      expect(resetButton).toBeDisabled();
    });

    it('enables Reset button when checked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      expect(resetButton).not.toBeDisabled();
    });
  });

  describe('Cancel button', () => {
    it('calls onCancel when clicked', () => {
      const onCancel = vi.fn();
      render(<ToolResetButton {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('does not call onReset when Cancel clicked', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(onReset).not.toHaveBeenCalled();
    });
  });

  describe('Reset button', () => {
    it('does not call onReset when clicked without confirmation', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Button is disabled, but let's try clicking anyway
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).not.toHaveBeenCalled();
    });

    it('calls onReset when clicked with confirmation', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Check confirmation
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('Resetting state', () => {
    it('shows "Resetting..." text when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      expect(screen.getByText('Resetting...')).toBeInTheDocument();
    });

    it('disables Reset button when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      const resetButton = screen.getByRole('button', { name: /Resetting/i });
      expect(resetButton).toBeDisabled();
    });

    it('disables Cancel button when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Reason descriptions', () => {
    it('shows description for Replaced option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getByText('Tool was replaced with a new one')
      ).toBeInTheDocument();
    });

    it('shows description for Resharpened option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getByText('Tool was resharpened/reconditioned')
      ).toBeInTheDocument();
    });

    it('shows description for Manual Reset option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getByText('Manual correction or calibration')
      ).toBeInTheDocument();
    });
  });

  describe('Full reset flow', () => {
    it('completes full reset flow with all options', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // 1. Select reason
      const manualButton = screen.getByText('Manual Reset').closest('button')!;
      fireEvent.click(manualButton);

      // 2. Enter note
      const textarea = screen.getByPlaceholderText(/New tool installed/i);
      fireEvent.change(textarea, { target: { value: 'Calibration adjustment' } });

      // 3. Confirm
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // 4. Reset
      const resetButton = screen.getByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'MANUAL',
        note: 'Calibration adjustment',
      });
    });
  });
});
