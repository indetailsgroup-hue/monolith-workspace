/**
 * @vitest-environment jsdom
 */

/**
 * ToolResetButton.test.tsx - Tool Reset Button Component Tests
 *
 * Tests for the ToolResetButton UI component.
 *
 * @version 1.0.0
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders tool ID in warning message', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getAllByText('DRILL_5').length).toBeGreaterThan(0);
    });

    it('renders warning header', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getAllByText('Reset Tool Wear').length).toBeGreaterThan(0);
    });

    it('renders all reason options', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getAllByText('Replaced').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Resharpened').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Manual Reset').length).toBeGreaterThan(0);
    });

    it('renders note textarea', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getAllByPlaceholderText(/New tool installed/i).length
      ).toBeGreaterThan(0);
    });

    it('renders confirmation checkbox', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/I understand this action cannot be undone/i).length
      ).toBeGreaterThan(0);
    });

    it('renders Cancel and Reset buttons', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(screen.getAllByRole('button', { name: /Cancel/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Reset Wear/i }).length).toBeGreaterThan(0);
    });
  });

  describe('Reason selection', () => {
    it('selects REPLACED by default', () => {
      render(<ToolResetButton {...defaultProps} />);

      const replacedButtons = screen.getAllByText('Replaced');
      const replacedButton = replacedButtons[0].closest('button');
      expect(replacedButton).toHaveStyle({ borderColor: '#8b5cf6' });
    });

    it('allows selecting different reasons', () => {
      render(<ToolResetButton {...defaultProps} />);

      const resharpButtons = screen.getAllByText('Resharpened');
      const resharpButton = resharpButtons[0].closest('button')!;
      fireEvent.click(resharpButton);

      // The resharpened button should now be selected
      expect(resharpButton).toHaveStyle({ borderColor: '#8b5cf6' });
    });

    it('passes selected reason to onReset', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Select RESHARPENED
      const resharpButtons = screen.getAllByText('Resharpened');
      const resharpButton = resharpButtons[0].closest('button')!;
      fireEvent.click(resharpButton);

      // Check confirmation
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'RESHARPENED',
        note: undefined,
      });
    });
  });

  describe('Note input', () => {
    it('allows entering a note', () => {
      render(<ToolResetButton {...defaultProps} />);

      const textareas = screen.getAllByPlaceholderText(/New tool installed/i);
      fireEvent.change(textareas[0], { target: { value: 'Test note' } });

      expect(textareas[0]).toHaveValue('Test note');
    });

    it('passes note to onReset', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Enter note
      const textareas = screen.getAllByPlaceholderText(/New tool installed/i);
      fireEvent.change(textareas[0], { target: { value: 'New Guhring drill' } });

      // Check confirmation
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: 'New Guhring drill',
      });
    });

    it('trims whitespace from note', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Enter note with whitespace
      const textareas = screen.getAllByPlaceholderText(/New tool installed/i);
      fireEvent.change(textareas[0], { target: { value: '  test  ' } });

      // Check confirmation
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: 'test',
      });
    });

    it('passes undefined when note is empty', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Check confirmation (no note entered)
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'REPLACED',
        note: undefined,
      });
    });
  });

  describe('Confirmation checkbox', () => {
    it('is unchecked by default', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).not.toBeChecked();
    });

    it('can be checked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      expect(checkboxes[0]).toBeChecked();
    });

    it('disables Reset button when unchecked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      expect(resetButtons[0]).toBeDisabled();
    });

    it('enables Reset button when checked', () => {
      render(<ToolResetButton {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      expect(resetButtons[0]).not.toBeDisabled();
    });
  });

  describe('Cancel button', () => {
    it('calls onCancel when clicked', () => {
      const onCancel = vi.fn();
      render(<ToolResetButton {...defaultProps} onCancel={onCancel} />);

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[0]);

      expect(onCancel).toHaveBeenCalled();
    });

    it('does not call onReset when Cancel clicked', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[0]);

      expect(onReset).not.toHaveBeenCalled();
    });
  });

  describe('Reset button', () => {
    it('does not call onReset when clicked without confirmation', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Button is disabled, but let's try clicking anyway
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).not.toHaveBeenCalled();
    });

    it('calls onReset when clicked with confirmation', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // Check confirmation
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // Click reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('Resetting state', () => {
    it('shows "Resetting..." text when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      expect(screen.getAllByText('Resetting...').length).toBeGreaterThan(0);
    });

    it('disables Reset button when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      const resetButtons = screen.getAllByRole('button', { name: /Resetting/i });
      expect(resetButtons[0]).toBeDisabled();
    });

    it('disables Cancel button when resetting', () => {
      render(<ToolResetButton {...defaultProps} resetting={true} />);

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      expect(cancelButtons[0]).toBeDisabled();
    });
  });

  describe('Reason descriptions', () => {
    it('shows description for Replaced option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getAllByText('Tool was replaced with a new one').length
      ).toBeGreaterThan(0);
    });

    it('shows description for Resharpened option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getAllByText('Tool was resharpened/reconditioned').length
      ).toBeGreaterThan(0);
    });

    it('shows description for Manual Reset option', () => {
      render(<ToolResetButton {...defaultProps} />);

      expect(
        screen.getAllByText('Manual correction or calibration').length
      ).toBeGreaterThan(0);
    });
  });

  describe('Full reset flow', () => {
    it('completes full reset flow with all options', () => {
      const onReset = vi.fn();
      render(<ToolResetButton {...defaultProps} onReset={onReset} />);

      // 1. Select reason
      const manualButtons = screen.getAllByText('Manual Reset');
      const manualButton = manualButtons[0].closest('button')!;
      fireEvent.click(manualButton);

      // 2. Enter note
      const textareas = screen.getAllByPlaceholderText(/New tool installed/i);
      fireEvent.change(textareas[0], { target: { value: 'Calibration adjustment' } });

      // 3. Confirm
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      // 4. Reset
      const resetButtons = screen.getAllByRole('button', { name: /Reset Wear/i });
      fireEvent.click(resetButtons[0]);

      expect(onReset).toHaveBeenCalledWith({
        reason: 'MANUAL',
        note: 'Calibration adjustment',
      });
    });
  });
});
