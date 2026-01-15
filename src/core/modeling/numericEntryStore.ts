/**
 * Numeric Entry Store - CAD-style Typed Input
 *
 * Plasticity-style "type anywhere" numeric input:
 * - Type numbers while tool active → starts capture
 * - Tab = switch between X/Y fields
 * - Enter = apply value
 * - Escape = cancel
 *
 * v1.0: Initial numeric entry store
 */

import { create } from 'zustand';

export type NumericField = 'X' | 'Y';

interface NumericEntryState {
  /** Is numeric entry mode active */
  active: boolean;
  /** Current field being edited */
  field: NumericField;
  /** Buffer of typed characters */
  buffer: string;
  /** Parsed numeric value (null if invalid) */
  parsedValue: number | null;

  // Actions
  open: (field?: NumericField) => void;
  close: () => void;
  setField: (field: NumericField) => void;
  setBuffer: (buffer: string) => void;
  append: (char: string) => void;
  backspace: () => void;
  toggleField: () => void;
  getValue: () => number | null;
}

export const useNumericEntryStore = create<NumericEntryState>((set, get) => ({
  active: false,
  field: 'Y', // Default to Y (depth) since it's most common
  buffer: '',
  parsedValue: null,

  open: (field = 'Y') =>
    set({
      active: true,
      field,
      buffer: '',
      parsedValue: null,
    }),

  close: () =>
    set({
      active: false,
      buffer: '',
      parsedValue: null,
    }),

  setField: (field) => set({ field }),

  setBuffer: (buffer) => {
    const parsed = parseFloat(buffer);
    set({
      buffer,
      parsedValue: Number.isFinite(parsed) ? parsed : null,
    });
  },

  append: (char) => {
    const state = get();
    const newBuffer = state.buffer + char;
    const parsed = parseFloat(newBuffer);
    set({
      buffer: newBuffer,
      parsedValue: Number.isFinite(parsed) ? parsed : null,
    });
  },

  backspace: () => {
    const state = get();
    const newBuffer = state.buffer.slice(0, -1);
    const parsed = parseFloat(newBuffer);
    set({
      buffer: newBuffer,
      parsedValue: newBuffer.length > 0 && Number.isFinite(parsed) ? parsed : null,
    });
  },

  toggleField: () => {
    const state = get();
    set({ field: state.field === 'X' ? 'Y' : 'X' });
  },

  getValue: () => get().parsedValue,
}));

// Selector hooks
export const useNumericEntryActive = () => useNumericEntryStore((s) => s.active);
export const useNumericEntryField = () => useNumericEntryStore((s) => s.field);
export const useNumericEntryBuffer = () => useNumericEntryStore((s) => s.buffer);
export const useNumericEntryValue = () => useNumericEntryStore((s) => s.parsedValue);
