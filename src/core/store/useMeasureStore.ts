/**
 * MeasureStore - State Management for Measure 3D Tool
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Part of Workspace Core Tools
 * - Implements Seq-B: Measure 3D from Activity Diagram
 * - All dimensions in millimeters (mm)
 * 
 * FLOW:
 * 1. User presses M or clicks Measure Tool
 * 2. Click first point → awaiting-second-point
 * 3. Click second point → create segment with distance
 * 4. Repeat or switch tool
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================
// TYPES
// ============================================

export interface MeasurePoint {
  id: string;
  world: [number, number, number];  // World coordinates in mm
  snapType?: SnapMode;
}

export interface MeasureSegment {
  id: string;
  from: MeasurePoint;
  to: MeasurePoint;
  lengthMm: number;
  color?: string;
  label?: string;
}

export type MeasureMode = 'idle' | 'awaiting-second-point';
export type SnapMode = 'vertex' | 'edge' | 'face-grid' | 'none';

export interface MeasureState {
  // Tool state
  isActive: boolean;
  activeMode: MeasureMode;
  
  // Current measurement in progress
  previewFrom: MeasurePoint | null;
  previewTo: [number, number, number] | null;  // Mouse position for preview line
  
  // Completed measurements
  segments: MeasureSegment[];
  
  // Settings
  snapMode: SnapMode;
  snapTolerance: number;  // mm
  showLabels: boolean;
  labelUnit: 'mm' | 'cm' | 'm';
  
  // Actions
  activateTool: () => void;
  deactivateTool: () => void;
  addPoint: (world: [number, number, number], snapType?: SnapMode) => void;
  updatePreview: (world: [number, number, number] | null) => void;
  cancelMeasurement: () => void;
  deleteSegment: (id: string) => void;
  clearAllSegments: () => void;
  setSnapMode: (mode: SnapMode) => void;
  setShowLabels: (show: boolean) => void;
  setLabelUnit: (unit: 'mm' | 'cm' | 'm') => void;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId(): string {
  return `measure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function computeDistance(
  from: [number, number, number],
  to: [number, number, number]
): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function formatDistance(mm: number, unit: 'mm' | 'cm' | 'm'): string {
  switch (unit) {
    case 'mm':
      return `${mm.toFixed(1)} mm`;
    case 'cm':
      return `${(mm / 10).toFixed(2)} cm`;
    case 'm':
      return `${(mm / 1000).toFixed(3)} m`;
    default:
      return `${mm.toFixed(1)} mm`;
  }
}

// ============================================
// STORE
// ============================================

export const useMeasureStore = create<MeasureState>()(
  immer((set, get) => ({
    // Initial state
    isActive: false,
    activeMode: 'idle',
    previewFrom: null,
    previewTo: null,
    segments: [],
    snapMode: 'vertex',
    snapTolerance: 10,  // 10mm snap tolerance
    showLabels: true,
    labelUnit: 'mm',
    
    // Activate Measure Tool (Seq-B Step 1)
    activateTool: () => set((state) => {
      state.isActive = true;
      state.activeMode = 'idle';
      state.previewFrom = null;
      state.previewTo = null;
    }),
    
    // Deactivate Measure Tool
    deactivateTool: () => set((state) => {
      state.isActive = false;
      state.activeMode = 'idle';
      state.previewFrom = null;
      state.previewTo = null;
    }),
    
    // Add point - either first or second (Seq-B Step 2-3)
    addPoint: (world, snapType) => set((state) => {
      const point: MeasurePoint = {
        id: generateId(),
        world,
        snapType: (snapType || undefined) as typeof snapType,
      };
      
      if (state.activeMode === 'idle') {
        // First point - start measurement
        state.previewFrom = point;
        state.activeMode = 'awaiting-second-point';
      } else {
        // Second point - complete measurement
        const from = state.previewFrom!;
        const lengthMm = computeDistance(from.world, world);
        
        const segment: MeasureSegment = {
          id: generateId(),
          from,
          to: point,
          lengthMm,
          color: '#00ff00',  // Green for measurements
        };
        
        state.segments.push(segment);
        state.previewFrom = null;
        state.previewTo = null;
        state.activeMode = 'idle';
      }
    }),
    
    // Update preview line position (mouse move)
    updatePreview: (world) => set((state) => {
      if (state.activeMode === 'awaiting-second-point') {
        state.previewTo = world;
      }
    }),
    
    // Cancel current measurement (Escape)
    cancelMeasurement: () => set((state) => {
      state.previewFrom = null;
      state.previewTo = null;
      state.activeMode = 'idle';
    }),
    
    // Delete a specific segment
    deleteSegment: (id) => set((state) => {
      state.segments = state.segments.filter(s => s.id !== id);
    }),
    
    // Clear all measurements
    clearAllSegments: () => set((state) => {
      state.segments = [];
    }),
    
    // Settings
    setSnapMode: (mode) => set((state) => {
      state.snapMode = mode;
    }),
    
    setShowLabels: (show) => set((state) => {
      state.showLabels = show;
    }),
    
    setLabelUnit: (unit) => set((state) => {
      state.labelUnit = unit;
    }),
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectMeasureIsActive = (state: MeasureState) => state.isActive;
export const selectMeasureSegments = (state: MeasureState) => state.segments;
export const selectMeasurePreview = (state: MeasureState) => ({
  from: state.previewFrom,
  to: state.previewTo,
  isActive: state.activeMode === 'awaiting-second-point',
});
