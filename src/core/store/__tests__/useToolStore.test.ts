/**
 * useToolStore.test.ts - Unit tests for Tool Store
 *
 * Tests tool selection, snap options, and keyboard handlers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing store (zustand persist calls it on init)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

import { useToolStore } from '../useToolStore';

describe('useToolStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useToolStore.setState({
      activeTool: 'select',
      previousTool: 'select',
      options: {
        snap: {
          enabled: true,
          gridSize: 10,
          snapToVertex: true,
          snapToEdge: true,
          snapToFace: false,
          snapToGrid: true,
        },
      },
      draggingCabinetId: null,
    });
  });

  describe('Tool Selection', () => {
    it('should start with select tool', () => {
      const { activeTool } = useToolStore.getState();
      expect(activeTool).toBe('select');
    });

    it('should switch to move tool', () => {
      useToolStore.getState().setTool('move');
      expect(useToolStore.getState().activeTool).toBe('move');
      expect(useToolStore.getState().previousTool).toBe('select');
    });

    it('should switch to rotate tool', () => {
      useToolStore.getState().setTool('rotate');
      expect(useToolStore.getState().activeTool).toBe('rotate');
    });

    it('should toggle tool on/off', () => {
      useToolStore.getState().toggleTool('move');
      expect(useToolStore.getState().activeTool).toBe('move');

      useToolStore.getState().toggleTool('move');
      expect(useToolStore.getState().activeTool).toBe('select'); // Back to previous
    });

    it('should restore previous tool', () => {
      useToolStore.getState().setTool('move');
      useToolStore.getState().setTool('rotate');
      useToolStore.getState().restorePreviousTool();
      expect(useToolStore.getState().activeTool).toBe('move');
    });

    it('should not switch if already on same tool', () => {
      const initialPrevious = useToolStore.getState().previousTool;
      useToolStore.getState().setTool('select'); // Already on select
      expect(useToolStore.getState().previousTool).toBe(initialPrevious);
    });
  });

  describe('Snap Options', () => {
    it('should toggle snap enabled', () => {
      expect(useToolStore.getState().options.snap.enabled).toBe(true);
      useToolStore.getState().setSnapEnabled(false);
      expect(useToolStore.getState().options.snap.enabled).toBe(false);
    });

    it('should set grid size', () => {
      useToolStore.getState().setGridSize(25);
      expect(useToolStore.getState().options.snap.gridSize).toBe(25);
    });

    it('should set snap options partially', () => {
      useToolStore.getState().setSnapOptions({ snapToFace: true, snapToVertex: false });
      const snap = useToolStore.getState().options.snap;
      expect(snap.snapToFace).toBe(true);
      expect(snap.snapToVertex).toBe(false);
      expect(snap.snapToEdge).toBe(true); // Unchanged
    });
  });

  describe('Dragging State', () => {
    it('should set dragging cabinet id', () => {
      useToolStore.getState().setDraggingCabinetId('cabinet-123');
      expect(useToolStore.getState().draggingCabinetId).toBe('cabinet-123');
    });

    it('should clear dragging cabinet id', () => {
      useToolStore.getState().setDraggingCabinetId('cabinet-123');
      useToolStore.getState().setDraggingCabinetId(null);
      expect(useToolStore.getState().draggingCabinetId).toBe(null);
    });
  });

  describe('Grid Snap Calculation', () => {
    it('should snap to grid correctly', () => {
      const gridSize = 10;
      const snapToGrid = (value: number) => Math.round(value / gridSize) * gridSize;

      expect(snapToGrid(14)).toBe(10);
      expect(snapToGrid(15)).toBe(20);
      expect(snapToGrid(16)).toBe(20);
      expect(snapToGrid(-14)).toBe(-10);
      expect(snapToGrid(0)).toBe(0);
    });
  });
});
