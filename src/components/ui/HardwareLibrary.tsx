/**
 * HardwareLibrary - Comprehensive Hardware Configuration Library
 *
 * Organizes hardware presets by category:
 * - Connectors (Minifix, Dowels, Confirmat)
 * - Hinges (Blum, Hettich, Grass)
 * - Drawer Systems (Tandembox, ArciTech)
 * - Shelf Supports (5mm pins, brackets)
 * - Handles & Knobs
 * - Lighting
 *
 * Integrates with manufacturing hardware types and provides
 * configuration UI for each hardware category.
 *
 * v1.1: Added saved Minifix S200 configuration presets
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { MinifixConfigPanel, MinifixFullConfig, DEFAULT_MINIFIX_CONFIG, CAM_SPECS_BY_WOOD_THICKNESS } from './MinifixConfigPanel';
import { TargetJ10ConfigPanel, TargetJ10FullConfig, DEFAULT_TARGET_J10_CONFIG } from './TargetJ10ConfigPanel';
import {
  HardwareLibrary as HardwareLibraryType,
  HardwareKind,
  DEFAULT_CAM_SPEC,
} from '../../core/manufacturing/hardware/hardwareTypes';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { ChevronDown, ChevronUp, Settings, Package, X, Save, Trash2, Copy, Check, Edit2, RotateCcw } from 'lucide-react';

// ============================================
// SAVED MINIFIX CONFIG PRESET
// ============================================

export interface MinifixConfigPreset {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  woodThickness: number;
  config: MinifixFullConfig;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// ZOD VALIDATION SCHEMAS (G9: Persistence Safety)
// ============================================

const MinifixFullConfigSchema = z.object({
  minifixType: z.enum(['15', '12']),
  drillingDistanceB: z.union([z.literal(24), z.literal(34)]),
  woodThickness: z.number(),
  ballHeadDia: z.number(),
  ballHeadOffset: z.number(),
  neckShaftDia: z.number(),
  neckShaftLength: z.number(),
  neckShaftOffset: z.number(),
  sleeveDia: z.number(),
  sleeveLength: z.number(),
  sleeveOffset: z.number(),
  shaftDia: z.number(),
  shaftLength: z.number(),
  shaftOffset: z.number(),
  camDia: z.number(),
  camDepth: z.number(),
  camHeight: z.number(),
  camRimDia: z.number(),
  camRimHeight: z.number(),
  camOffset: z.number(),
  includeDowel: z.boolean(),
  dowelDia: z.number(),
  dowelLength: z.number(),
  dowelOffset: z.number(),
  flipVertical: z.boolean(),
  flipHorizontal: z.boolean(),
  rotationX: z.number(),
  rotationY: z.number(),
  rotationZ: z.number(),
  moveX: z.number(),
  moveY: z.number(),
  moveZ: z.number(),
  showDimensions: z.boolean(),
});

const MinifixConfigPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameTh: z.string(),
  description: z.string(),
  woodThickness: z.number(),
  config: MinifixFullConfigSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

const MinifixConfigPresetsArraySchema = z.array(MinifixConfigPresetSchema);

// LocalStorage keys for saved presets (moved before parseMinifixPresetsFromStorage)
const MINIFIX_PRESETS_STORAGE_KEY = 'minifix_saved_presets';
const MINIFIX_BUILTIN_OVERRIDES_KEY = 'minifix_builtin_overrides';

/**
 * Safely parse MinifixConfigPreset array from JSON string.
 * Includes migration logic for old presets missing new fields.
 * Returns empty array on invalid data (fail-safe for localStorage).
 * @throws Never - returns [] on any validation failure
 */
function parseMinifixPresetsFromStorage(jsonString: string): MinifixConfigPreset[] {
  try {
    const parsed = JSON.parse(jsonString);

    // First try to parse as-is
    const result = MinifixConfigPresetsArraySchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }

    // Migration: Try to fill missing fields with defaults
    if (Array.isArray(parsed)) {
      console.log('[G9] Migrating old MinifixConfigPresets to new schema...');
      const now = Date.now();
      const migrated = parsed.map((preset: unknown, index: number) => {
        if (typeof preset !== 'object' || preset === null) return null;
        const p = preset as Record<string, unknown>;
        const config = (p.config && typeof p.config === 'object')
          ? p.config as Record<string, unknown>
          : {};

        // Fill ALL missing config fields by spreading defaults first, then overlay existing
        const migratedConfig = {
          ...DEFAULT_MINIFIX_CONFIG,  // All defaults first
          ...config,                   // Then overlay existing values
        };

        // Fill missing top-level preset fields
        return {
          id: typeof p.id === 'string' ? p.id : `migrated-preset-${index}`,
          name: typeof p.name === 'string' ? p.name : `Preset ${index + 1}`,
          nameTh: typeof p.nameTh === 'string' ? p.nameTh : `พรีเซ็ต ${index + 1}`,
          description: typeof p.description === 'string' ? p.description : '',
          woodThickness: typeof p.woodThickness === 'number' ? p.woodThickness : 18,
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
          updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
          config: migratedConfig,
        };
      }).filter(Boolean);

      // Try parsing again with migrated data
      const migratedResult = MinifixConfigPresetsArraySchema.safeParse(migrated);
      if (migratedResult.success) {
        console.log('[G9] Migration successful, saving updated presets');
        // Save migrated presets back to localStorage
        localStorage.setItem(MINIFIX_PRESETS_STORAGE_KEY, JSON.stringify(migratedResult.data));
        return migratedResult.data;
      }

      console.error('[G9] Migration failed, clearing invalid presets:', migratedResult.error.message);
    }

    console.error('[G9] Invalid MinifixConfigPresets in localStorage:', result.error.message);
    return [];
  } catch (e) {
    console.error('[G9] Failed to parse MinifixConfigPresets JSON:', e);
    return [];
  }
}

// ============================================
// BUILT-IN PRESETS (Factory Defaults)
// ============================================


/**
 * Built-in presets for common wood thicknesses.
 * These are always available and cannot be deleted.
 * Values are based on Häfele Minifix S200 specifications.
 */
export const BUILTIN_MINIFIX_PRESETS: MinifixConfigPreset[] = [
  {
    id: 'builtin_minifix_16mm',
    name: 'Minifix S200 (16mm)',
    nameTh: 'Minifix S200 สำหรับไม้ 16 มม.',
    description: 'Standard config for 16mm panel thickness',
    woodThickness: 16,
    config: {
      minifixType: '15',
      drillingDistanceB: 24,  // Indetails standard
      woodThickness: 16,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 14.25mm (B = 3.25 + 6.5 + 14.25 = 24mm)
      sleeveDia: 10,
      sleeveLength: 14.25,
      sleeveOffset: 0,
      boltBoreDepth: 17.5,  // Häfele S200 bolt drilling depth
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 16mm wood)
      camDia: 15,
      camDepth: 12.5,  // Correct for 16mm wood
      camHeight: 8,     // dimA for 16mm
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform (default: no transformation)
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin_minifix_18mm',
    name: 'Minifix S200 (18mm)',
    nameTh: 'Minifix S200 สำหรับไม้ 18 มม.',
    description: 'Standard config for 18mm panel thickness',
    woodThickness: 18,
    config: {
      minifixType: '15',
      drillingDistanceB: 24,  // Indetails standard
      woodThickness: 18,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 14.25mm (B = 3.25 + 6.5 + 14.25 = 24mm)
      sleeveDia: 10,
      sleeveLength: 14.25,
      sleeveOffset: 0,
      boltBoreDepth: 17.5,  // Häfele S200 bolt drilling depth
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 18mm wood)
      camDia: 15,
      camDepth: 13.5,  // Correct for 18mm wood
      camHeight: 9,     // dimA for 18mm
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform (default: no transformation)
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin_minifix_19mm',
    name: 'Minifix S200 (19mm)',
    nameTh: 'Minifix S200 สำหรับไม้ 19 มม.',
    description: 'Standard config for 19mm panel thickness',
    woodThickness: 19,
    config: {
      minifixType: '15',
      drillingDistanceB: 24,  // Indetails standard
      woodThickness: 19,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 14.25mm (B = 3.25 + 6.5 + 14.25 = 24mm)
      sleeveDia: 10,
      sleeveLength: 14.25,
      sleeveOffset: 0,
      boltBoreDepth: 17.5,  // Häfele S200 bolt drilling depth
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 19mm wood)
      camDia: 15,
      camDepth: 14.0,  // Correct for 19mm wood
      camHeight: 9.5,   // dimA for 19mm
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform (default: no transformation)
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  // ============================================
  // B=34 PRESETS (Sleeve = 34 - 3.25 - 6.5 = 24.25mm)
  // ============================================
  {
    id: 'builtin_minifix_16mm_b34',
    name: 'Minifix S200 (16mm, B=34)',
    nameTh: 'Minifix S200 สำหรับไม้ 16 มม. (B=34)',
    description: 'Config for 16mm panel with B=34mm drilling distance',
    woodThickness: 16,
    config: {
      minifixType: '15',
      drillingDistanceB: 34,  // B=34mm
      woodThickness: 16,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 24.25mm (B = 3.25 + 6.5 + 24.25 = 34mm)
      sleeveDia: 10,
      sleeveLength: 24.25,
      sleeveOffset: 0,
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 16mm wood)
      camDia: 15,
      camDepth: 12.5,
      camHeight: 8,
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin_minifix_18mm_b34',
    name: 'Minifix S200 (18mm, B=34)',
    nameTh: 'Minifix S200 สำหรับไม้ 18 มม. (B=34)',
    description: 'Config for 18mm panel with B=34mm drilling distance',
    woodThickness: 18,
    config: {
      minifixType: '15',
      drillingDistanceB: 34,  // B=34mm
      woodThickness: 18,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 24.25mm (B = 3.25 + 6.5 + 24.25 = 34mm)
      sleeveDia: 10,
      sleeveLength: 24.25,
      sleeveOffset: 0,
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 18mm wood)
      camDia: 15,
      camDepth: 13.5,
      camHeight: 9,
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin_minifix_19mm_b34',
    name: 'Minifix S200 (19mm, B=34)',
    nameTh: 'Minifix S200 สำหรับไม้ 19 มม. (B=34)',
    description: 'Config for 19mm panel with B=34mm drilling distance',
    woodThickness: 19,
    config: {
      minifixType: '15',
      drillingDistanceB: 34,  // B=34mm
      woodThickness: 19,
      // Ball Head - Häfele S200: Ø6.5mm
      ballHeadDia: 6.5,
      ballHeadOffset: 0,
      // Neck Shaft - Ø6.5mm × 6.5mm
      neckShaftDia: 6.5,
      neckShaftLength: 6.5,
      neckShaftOffset: 0,
      // Sleeve - Ø10mm × 24.25mm (B = 3.25 + 6.5 + 24.25 = 34mm)
      sleeveDia: 10,
      sleeveLength: 24.25,
      sleeveOffset: 0,
      // Shaft
      shaftDia: 5,
      shaftLength: 11,
      shaftOffset: 0,
      // Cam (for 19mm wood)
      camDia: 15,
      camDepth: 14.0,
      camHeight: 9.5,
      camRimDia: 18,
      camRimHeight: 2,
      camOffset: 0,
      // Dowel
      includeDowel: false,
      dowelDia: 8,
      dowelLength: 30,
      dowelOffset: 32,
      // Transform
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      moveX: 0,
      moveY: 0,
      moveZ: 0,
      // Display Preferences
      showDimensions: true,
    },
    createdAt: 0,
    updatedAt: 0,
  },
];

// ============================================
// BUILTIN PRESET OVERRIDES (User Modifications)
// ============================================

/**
 * Load builtin preset overrides from localStorage.
 * These are user modifications to built-in presets that persist across sessions.
 */
function loadBuiltinOverrides(): Record<string, Partial<MinifixConfigPreset>> {
  try {
    const stored = localStorage.getItem(MINIFIX_BUILTIN_OVERRIDES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load builtin overrides:', e);
  }
  return {};
}

/**
 * Save builtin preset override to localStorage.
 * Called when user edits a built-in preset.
 */
function saveBuiltinOverride(presetId: string, override: Partial<MinifixConfigPreset>): void {
  try {
    const overrides = loadBuiltinOverrides();
    overrides[presetId] = override;
    localStorage.setItem(MINIFIX_BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
    console.log(`[HardwareLibrary] Saved builtin override for ${presetId}`);
  } catch (e) {
    console.error('Failed to save builtin override:', e);
  }
}

/**
 * Reset a builtin preset to factory defaults (remove override).
 */
export function resetBuiltinPreset(presetId: string): void {
  try {
    const overrides = loadBuiltinOverrides();
    delete overrides[presetId];
    localStorage.setItem(MINIFIX_BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
    console.log(`[HardwareLibrary] Reset builtin preset ${presetId} to factory defaults`);
  } catch (e) {
    console.error('Failed to reset builtin preset:', e);
  }
}

/**
 * Check if a builtin preset has been modified from factory defaults.
 */
export function isBuiltinPresetModified(presetId: string): boolean {
  const overrides = loadBuiltinOverrides();
  return presetId in overrides;
}

// Load saved presets from localStorage + built-in presets (with overrides applied)
export function loadSavedPresets(): MinifixConfigPreset[] {
  // Load builtin overrides first
  const overrides = loadBuiltinOverrides();

  // Start with built-in presets, applying any overrides
  const allPresets = BUILTIN_MINIFIX_PRESETS.map((preset) => {
    const override = overrides[preset.id];
    if (override) {
      // Merge override into builtin preset
      return {
        ...preset,
        ...override,
        config: { ...preset.config, ...(override.config || {}) },
        // Mark as modified for UI indication
        _isModified: true,
      } as MinifixConfigPreset & { _isModified?: boolean };
    }
    return preset;
  });

  // G9: Load user presets with Zod validation (no unsafe cast)
  const stored = localStorage.getItem(MINIFIX_PRESETS_STORAGE_KEY);
  if (stored) {
    const userPresets = parseMinifixPresetsFromStorage(stored);
    // Filter out any user presets that have builtin IDs (shouldn't happen, but safety)
    const filteredUserPresets = userPresets.filter(
      (p) => !p.id.startsWith('builtin_')
    );
    allPresets.push(...filteredUserPresets);
  }

  return allPresets;
}

// Save presets to localStorage
function savePresetsToStorage(presets: MinifixConfigPreset[]): void {
  try {
    localStorage.setItem(MINIFIX_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save Minifix presets:', e);
  }
}

// Generate unique ID
function generatePresetId(): string {
  return `minifix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// FULLSCREEN MODAL WRAPPER
// ============================================

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

function FullscreenModal({ isOpen, onClose, title, children }: FullscreenModalProps) {
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header area (not buttons)
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop - fully transparent to see 3D scene */}
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Modal Content - Draggable */}
      <div
        className="relative w-[95vw] h-[90vh] max-w-[1600px] bg-[#1a2535] rounded-xl shadow-2xl border border-[#3a4a5a] overflow-hidden flex flex-col"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header with close button - Draggable Handle */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-[#3a4a5a] bg-[#152030] select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔧</span>
            <div>
              <h2 className="text-sm font-semibold text-white">{title || 'Hardware Configuration'}</h2>
              <p className="text-[10px] text-gray-500">ตั้งค่าพารามิเตอร์ Hardware สำหรับ CNC Manufacturing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
            title="Close (Esc)"
          >
            <X size={18} className="text-gray-400 group-hover:text-white" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// HARDWARE CATEGORY DEFINITIONS
// ============================================

interface HardwareCategory {
  id: string;
  name: string;
  nameTh: string;
  icon: string;
  color: string;
  kinds: HardwareKind[];
}

const HARDWARE_CATEGORIES: HardwareCategory[] = [
  {
    id: 'connectors',
    name: 'Connectors',
    nameTh: 'ตัวยึด',
    icon: '🔩',
    color: 'purple',
    kinds: ['MINIFIX', 'DOWEL', 'CONFIRMAT'],
  },
  {
    id: 'hinges',
    name: 'Hinges',
    nameTh: 'บานพับ',
    icon: '🔗',
    color: 'blue',
    kinds: ['HINGE'],
  },
  {
    id: 'drawer',
    name: 'Drawer Systems',
    nameTh: 'รางลิ้นชัก',
    icon: '📥',
    color: 'green',
    kinds: ['SLIDE'],
  },
  {
    id: 'shelf',
    name: 'Shelf Supports',
    nameTh: 'หมุดชั้น',
    icon: '📍',
    color: 'amber',
    kinds: ['SHELF_PIN'],
  },
  {
    id: 'handles',
    name: 'Handles',
    nameTh: 'มือจับ',
    icon: '🚪',
    color: 'cyan',
    kinds: [],
  },
  {
    id: 'lighting',
    name: 'Lighting',
    nameTh: 'ไฟ',
    icon: '💡',
    color: 'yellow',
    kinds: [],
  },
];

// ============================================
// CONNECTOR PRESETS
// ============================================

interface ConnectorPreset {
  id: string;
  name: string;
  nameTh: string;
  brand: string;
  kind: 'MINIFIX' | 'TARGET_J' | 'DOWEL' | 'CONFIRMAT';
  specs: {
    diameter: number;
    depth?: number;
    length?: number;
    camDia?: number;
    camDepth?: number;
  };
  description: string;
  price: number;
}

const CONNECTOR_PRESETS: ConnectorPreset[] = [
  // Minifix
  {
    id: 'hafele-minifix-15',
    name: 'Minifix 15',
    nameTh: 'มินิฟิกซ์ 15',
    brand: 'Häfele',
    kind: 'MINIFIX',
    specs: { diameter: 15, depth: 13.5, camDia: 15, camDepth: 13.5 },
    description: 'Standard 15mm cam with S200 bolt (18mm wood default)',
    price: 25,
  },
  {
    id: 'hafele-minifix-12',
    name: 'Minifix 12',
    nameTh: 'มินิฟิกซ์ 12',
    brand: 'Häfele',
    kind: 'MINIFIX',
    specs: { diameter: 12, depth: 10, camDia: 12, camDepth: 10 },
    description: 'Compact 12mm cam for thin panels',
    price: 22,
  },
  {
    id: 'blum-minifix',
    name: 'Blum Minifix',
    nameTh: 'บลัม มินิฟิกซ์',
    brand: 'Blum',
    kind: 'MINIFIX',
    specs: { diameter: 15, depth: 13.5, camDia: 15, camDepth: 13.5 },
    description: 'Blum system connector',
    price: 28,
  },
  // Dowels
  {
    id: 'wood-dowel-8x30',
    name: 'Wood Dowel 8×30',
    nameTh: 'ดูเบลไม้ 8×30',
    brand: 'Generic',
    kind: 'DOWEL',
    specs: { diameter: 8, length: 30 },
    description: 'Standard alignment dowel',
    price: 2,
  },
  {
    id: 'wood-dowel-8x35',
    name: 'Wood Dowel 8×35',
    nameTh: 'ดูเบลไม้ 8×35',
    brand: 'Generic',
    kind: 'DOWEL',
    specs: { diameter: 8, length: 35 },
    description: 'Extended alignment dowel',
    price: 3,
  },
  // Confirmat
  {
    id: 'confirmat-7x50',
    name: 'Confirmat 7×50',
    nameTh: 'คอนเฟอร์แมท 7×50',
    brand: 'Generic',
    kind: 'CONFIRMAT',
    specs: { diameter: 7, length: 50 },
    description: 'Standard Confirmat screw',
    price: 5,
  },
  {
    id: 'confirmat-7x70',
    name: 'Confirmat 7×70',
    nameTh: 'คอนเฟอร์แมท 7×70',
    brand: 'Generic',
    kind: 'CONFIRMAT',
    specs: { diameter: 7, length: 70 },
    description: 'Long Confirmat for thick panels',
    price: 7,
  },
  // Target J (Italiana Ferramenta)
  {
    id: 'if-target-j10',
    name: 'Target J10',
    nameTh: 'ทาร์เก็ต เจ10',
    brand: 'Italiana Ferramenta',
    kind: 'TARGET_J',
    specs: { diameter: 10, depth: 13, camDia: 10, camDepth: 13 },
    description: 'Pinion connector with B=A-25 transform (18mm wood)',
    price: 35,
  },
  {
    id: 'if-target-j10-b34',
    name: 'Target J10 (B34)',
    nameTh: 'ทาร์เก็ต เจ10 (B34)',
    brand: 'Italiana Ferramenta',
    kind: 'TARGET_J',
    specs: { diameter: 10, depth: 13, camDia: 10, camDepth: 13 },
    description: 'Target J10 with 34mm distance B',
    price: 35,
  },
];

// ============================================
// HINGE PRESETS
// ============================================

interface HingePreset {
  id: string;
  name: string;
  nameTh: string;
  brand: string;
  openingAngle: number;
  softClose: boolean;
  overlay: 'full' | 'half' | 'inset';
  cupDia: number;
  cupDepth: number;
  price: number;
}

const HINGE_PRESETS: HingePreset[] = [
  {
    id: 'blum-clip-110',
    name: 'Clip-Top 110°',
    nameTh: 'บลัม คลิปท็อป 110°',
    brand: 'Blum',
    openingAngle: 110,
    softClose: true,
    overlay: 'full',
    cupDia: 35,
    cupDepth: 12.5,
    price: 180,
  },
  {
    id: 'blum-clip-155',
    name: 'Clip-Top 155°',
    nameTh: 'บลัม คลิปท็อป 155°',
    brand: 'Blum',
    openingAngle: 155,
    softClose: true,
    overlay: 'full',
    cupDia: 35,
    cupDepth: 12.5,
    price: 250,
  },
  {
    id: 'blum-clip-170',
    name: 'Clip-Top 170°',
    nameTh: 'บลัม คลิปท็อป 170°',
    brand: 'Blum',
    openingAngle: 170,
    softClose: true,
    overlay: 'full',
    cupDia: 35,
    cupDepth: 12.5,
    price: 280,
  },
  {
    id: 'hettich-sensys-110',
    name: 'Sensys 110°',
    nameTh: 'เฮ็ททิช เซนซีส 110°',
    brand: 'Hettich',
    openingAngle: 110,
    softClose: true,
    overlay: 'full',
    cupDia: 35,
    cupDepth: 12.5,
    price: 165,
  },
  {
    id: 'grass-tiomos-110',
    name: 'Tiomos 110°',
    nameTh: 'แกรส ทิโอโมส 110°',
    brand: 'Grass',
    openingAngle: 110,
    softClose: true,
    overlay: 'full',
    cupDia: 35,
    cupDepth: 12.5,
    price: 155,
  },
];

// ============================================
// COLLAPSIBLE SECTION COMPONENT
// ============================================

interface SectionProps {
  title: string;
  titleTh: string;
  icon: string;
  color: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: number;
}

function Section({ title, titleTh, icon, color, isOpen, onToggle, children, badge }: SectionProps) {
  const colorClasses: Record<string, string> = {
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/20 border-green-500/30 text-green-400',
    amber: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
    yellow: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
  };

  const bgColor = colorClasses[color] || colorClasses.purple;

  return (
    <div className="border border-[#333] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded flex items-center justify-center border ${bgColor}`}>
            <span className="text-sm">{icon}</span>
          </div>
          <div className="text-left">
            <div className="text-xs font-medium text-white">{title}</div>
            <div className="text-[9px] text-gray-500">{titleTh}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge !== undefined && badge > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] bg-green-500/20 text-green-400 rounded">
              {badge} selected
            </span>
          )}
          {isOpen ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </div>
      </button>
      {isOpen && <div className="p-2 border-t border-[#333] bg-surface-2/30">{children}</div>}
    </div>
  );
}

// ============================================
// PRESET CARD COMPONENT
// ============================================

interface PresetCardProps {
  name: string;
  nameTh: string;
  brand: string;
  specs: string;
  price: number;
  isSelected: boolean;
  onSelect: () => void;
  onConfigure?: () => void;
}

function PresetCard({ name, nameTh, brand, specs, price, isSelected, onSelect, onConfigure }: PresetCardProps) {
  return (
    <div
      className={`p-2 rounded-lg border cursor-pointer transition-all ${isSelected
        ? 'bg-green-500/10 border-green-500/30'
        : 'bg-surface-2 border-[#333] hover:border-gray-500'
        }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium text-white truncate">{name}</div>
          <div className="text-[9px] text-gray-500 truncate">{nameTh}</div>
          <div className="text-[8px] text-gray-600 mt-0.5">{brand}</div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className="text-[9px] text-green-400">฿{price}</div>
          {onConfigure && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
              className="mt-0.5 p-0.5 hover:bg-white/10 rounded"
              title="Configure"
            >
              <Settings size={10} className="text-gray-500 hover:text-white" />
            </button>
          )}
        </div>
      </div>
      <div className="text-[8px] text-gray-500 mt-1">{specs}</div>
    </div>
  );
}

// ============================================
// SAVED PRESET CARD COMPONENT
// ============================================

interface SavedPresetCardProps {
  preset: MinifixConfigPreset & { _isModified?: boolean };
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
  onResetToFactory?: () => void;
}

function SavedPresetCard({ preset, isSelected, onSelect, onEdit, onDelete, onApply, onResetToFactory }: SavedPresetCardProps) {
  const isBuiltin = preset.id.startsWith('builtin_');
  const isModified = (preset as any)._isModified || isBuiltinPresetModified(preset.id);

  return (
    <div
      className={`p-2 rounded-lg border cursor-pointer transition-all ${isSelected
        ? 'bg-cyan-500/10 border-cyan-500/30'
        : 'bg-surface-2 border-[#333] hover:border-cyan-500/50'
        }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {/* Icon: Factory (builtin) vs User saved */}
            <span className="text-[10px]">{isBuiltin ? '🏭' : '💾'}</span>
            <span className="text-[10px] font-medium text-cyan-300 truncate">{preset.name}</span>
            {/* Modified indicator for builtin presets */}
            {isBuiltin && isModified && (
              <span className="text-[8px] text-amber-400 ml-1" title="Modified from factory default">●</span>
            )}
          </div>
          <div className="text-[9px] text-gray-500 truncate">{preset.nameTh}</div>
          <div className="text-[8px] text-gray-600 mt-0.5">Wood: {preset.woodThickness}mm</div>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-2">
          <div className="flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onApply(); }}
              className="p-0.5 hover:bg-cyan-500/20 rounded"
              title="Apply Config"
            >
              <Check size={10} className="text-cyan-400" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-0.5 hover:bg-white/10 rounded"
              title="Edit"
            >
              <Edit2 size={10} className="text-gray-500 hover:text-white" />
            </button>
            {/* For builtin presets: show Reset if modified, hide Delete */}
            {isBuiltin ? (
              isModified && onResetToFactory && (
                <button
                  onClick={(e) => { e.stopPropagation(); onResetToFactory(); }}
                  className="p-0.5 hover:bg-amber-500/20 rounded"
                  title="Reset to Factory Default"
                >
                  <RotateCcw size={10} className="text-amber-400 hover:text-amber-300" />
                </button>
              )
            ) : (
              /* For user presets: show Delete button */
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-0.5 hover:bg-red-500/20 rounded"
                title="Delete"
              >
                <Trash2 size={10} className="text-gray-500 hover:text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="text-[8px] text-gray-500 mt-1">
        Cam: Ø{preset.config.camDia}×{preset.config.camDepth} | Bore: Ø8×34
      </div>
      {preset.description && (
        <div className="text-[8px] text-gray-600 mt-0.5 italic truncate">{preset.description}</div>
      )}
    </div>
  );
}

// ============================================
// CONNECTORS SECTION CONTENT
// ============================================

interface ConnectorsSectionProps {
  onOpenMinifixConfig: (editingPreset?: MinifixConfigPreset) => void;
  onOpenTargetJ10Config: () => void;
  selectedConnectors: string[];
  onSelectConnector: (id: string) => void;
  savedMinifixPresets: MinifixConfigPreset[];
  onDeleteSavedPreset: (id: string) => void;
  onApplySavedPreset: (preset: MinifixConfigPreset) => void;
  onResetPresetToFactory: (id: string) => void;
}

function ConnectorsSection({
  onOpenMinifixConfig,
  onOpenTargetJ10Config,
  selectedConnectors,
  onSelectConnector,
  savedMinifixPresets,
  onDeleteSavedPreset,
  onApplySavedPreset,
  onResetPresetToFactory,
}: ConnectorsSectionProps) {
  const minifixPresets = CONNECTOR_PRESETS.filter((p) => p.kind === 'MINIFIX');
  const targetJPresets = CONNECTOR_PRESETS.filter((p) => p.kind === 'TARGET_J');
  const dowelPresets = CONNECTOR_PRESETS.filter((p) => p.kind === 'DOWEL');
  const confirmatPresets = CONNECTOR_PRESETS.filter((p) => p.kind === 'CONFIRMAT');

  return (
    <div className="space-y-3">
      {/* Saved Minifix Presets */}
      {savedMinifixPresets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-cyan-400 font-medium">💾 Saved S200 Configurations</span>
            <span className="text-[8px] text-gray-500">{savedMinifixPresets.length} saved</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {savedMinifixPresets.map((preset) => (
              <SavedPresetCard
                key={preset.id}
                preset={preset}
                isSelected={selectedConnectors.includes(preset.id)}
                onSelect={() => onSelectConnector(preset.id)}
                onEdit={() => onOpenMinifixConfig(preset)}
                onDelete={() => onDeleteSavedPreset(preset.id)}
                onApply={() => onApplySavedPreset(preset)}
                onResetToFactory={() => onResetPresetToFactory(preset.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Minifix */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-purple-400 font-medium">Minifix Cam Connectors</span>
          <button
            onClick={() => onOpenMinifixConfig()}
            className="text-[9px] text-gray-500 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            <Settings size={10} />
            Configure S200
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {minifixPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              name={preset.name}
              nameTh={preset.nameTh}
              brand={preset.brand}
              specs={`Cam: ${preset.specs.camDia}mm × ${preset.specs.camDepth}mm`}
              price={preset.price}
              isSelected={selectedConnectors.includes(preset.id)}
              onSelect={() => onSelectConnector(preset.id)}
              onConfigure={preset.kind === 'MINIFIX' ? () => onOpenMinifixConfig() : undefined}
            />
          ))}
        </div>
      </div>

      {/* Target J */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-emerald-400 font-medium">Target J Connectors</span>
          <button
            onClick={() => onOpenTargetJ10Config()}
            className="text-[9px] text-gray-500 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            <Settings size={10} />
            Configure J10
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {targetJPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              name={preset.name}
              nameTh={preset.nameTh}
              brand={preset.brand}
              specs={`Pinion: ${preset.specs.camDia}mm × ${preset.specs.camDepth}mm`}
              price={preset.price}
              isSelected={selectedConnectors.includes(preset.id)}
              onSelect={() => onSelectConnector(preset.id)}
              onConfigure={() => onOpenTargetJ10Config()}
            />
          ))}
        </div>
      </div>

      {/* Dowels */}
      <div>
        <span className="text-[10px] text-amber-400 font-medium">Alignment Dowels</span>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          {dowelPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              name={preset.name}
              nameTh={preset.nameTh}
              brand={preset.brand}
              specs={`${preset.specs.diameter}mm × ${preset.specs.length}mm`}
              price={preset.price}
              isSelected={selectedConnectors.includes(preset.id)}
              onSelect={() => onSelectConnector(preset.id)}
            />
          ))}
        </div>
      </div>

      {/* Confirmat */}
      <div>
        <span className="text-[10px] text-blue-400 font-medium">Confirmat Screws</span>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          {confirmatPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              name={preset.name}
              nameTh={preset.nameTh}
              brand={preset.brand}
              specs={`${preset.specs.diameter}mm × ${preset.specs.length}mm`}
              price={preset.price}
              isSelected={selectedConnectors.includes(preset.id)}
              onSelect={() => onSelectConnector(preset.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// HINGES SECTION CONTENT
// ============================================

interface HingesSectionProps {
  selectedHinges: string[];
  onSelectHinge: (id: string) => void;
}

function HingesSection({ selectedHinges, onSelectHinge }: HingesSectionProps) {
  return (
    <div className="space-y-1.5">
      {HINGE_PRESETS.map((preset) => (
        <PresetCard
          key={preset.id}
          name={preset.name}
          nameTh={preset.nameTh}
          brand={preset.brand}
          specs={`${preset.openingAngle}° | Cup: ${preset.cupDia}mm | ${preset.softClose ? 'Soft Close' : 'Standard'}`}
          price={preset.price}
          isSelected={selectedHinges.includes(preset.id)}
          onSelect={() => onSelectHinge(preset.id)}
        />
      ))}
    </div>
  );
}

// ============================================
// MAIN HARDWARE LIBRARY COMPONENT
// ============================================

interface HardwareLibraryProps {
  onSelectionChange?: (selection: {
    connectors: string[];
    hinges: string[];
    drawers: string[];
    shelfSupports: string[];
    handles: string[];
    lighting: string[];
  }) => void;
}

export function HardwareLibraryPanel({ onSelectionChange }: HardwareLibraryProps) {
  const [openSections, setOpenSections] = useState<string[]>(['connectors']);
  const [showMinifixConfig, setShowMinifixConfig] = useState(false);
  const [showTargetJ10Config, setShowTargetJ10Config] = useState(false);
  const [currentTargetJ10Config, setCurrentTargetJ10Config] = useState<TargetJ10FullConfig>(DEFAULT_TARGET_J10_CONFIG);
  const [editingPreset, setEditingPreset] = useState<MinifixConfigPreset | null>(null);

  // Cabinet store for hardware config persistence
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const updateHardware = useCabinetStore((s) => s.updateHardware);
  // Get cabinet's minifixConfig for initialConfig when reopening modal
  const cabinetMinifixConfig = useCabinetStore((s) => {
    const cabinet = s.cabinets.find((c) => c.id === s.activeCabinetId);
    return cabinet?.hardware?.minifixConfig as MinifixFullConfig | undefined;
  });

  // Drill map store for regeneration when config changes
  const regenerateDrillMap = useDrillMapStore((s) => s.regenerateDrillMap);

  // Selection state
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(['hafele-minifix-15', 'wood-dowel-8x30']);
  const [selectedHinges, setSelectedHinges] = useState<string[]>(['blum-clip-110']);
  const [selectedDrawers, setSelectedDrawers] = useState<string[]>([]);
  const [selectedShelfSupports, setSelectedShelfSupports] = useState<string[]>([]);
  const [selectedHandles, setSelectedHandles] = useState<string[]>([]);
  const [selectedLighting, setSelectedLighting] = useState<string[]>([]);

  // Saved Minifix presets state
  const [savedMinifixPresets, setSavedMinifixPresets] = useState<MinifixConfigPreset[]>([]);
  const [currentMinifixConfig, setCurrentMinifixConfig] = useState<MinifixFullConfig>(DEFAULT_MINIFIX_CONFIG);
  const [currentWoodThickness, setCurrentWoodThickness] = useState<number>(18);

  // Load saved presets from localStorage on mount
  useEffect(() => {
    const presets = loadSavedPresets();
    setSavedMinifixPresets(presets);
  }, []);

  const toggleSection = (id: string) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleConnector = (id: string) => {
    setSelectedConnectors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleHinge = (id: string) => {
    setSelectedHinges((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  // Minifix config change handler
  // CRITICAL: Must persist to cabinet store so edits survive modal close/reopen
  const handleMinifixConfigChange = useCallback((config: MinifixFullConfig) => {
    console.log('[HardwareLibrary] Minifix config changed:', config);
    setCurrentMinifixConfig(config);

    // PERSIST to cabinet store so the config survives modal close/reopen
    if (activeCabinetId) {
      updateHardware(activeCabinetId, {
        minifixConfig: config,
      });
      console.log('[HardwareLibrary] ✅ Persisted config to cabinet store');
    }
  }, [activeCabinetId, updateHardware]);

  // Save current config as a preset
  const handleSavePreset = useCallback((name: string, nameTh: string, description: string) => {
    const now = Date.now();

    if (editingPreset) {
      // Check if this is a builtin preset
      const isBuiltin = editingPreset.id.startsWith('builtin_');

      if (isBuiltin) {
        // Save as override for builtin preset (persists to localStorage)
        const override: Partial<MinifixConfigPreset> = {
          name,
          nameTh,
          description,
          config: currentMinifixConfig,
          woodThickness: currentWoodThickness,
          updatedAt: now,
        };
        saveBuiltinOverride(editingPreset.id, override);

        // Update state to reflect changes
        const updatedPresets = savedMinifixPresets.map((p) =>
          p.id === editingPreset.id
            ? { ...p, ...override }
            : p
        );
        setSavedMinifixPresets(updatedPresets);
        console.log(`[HardwareLibrary] ✅ Updated builtin preset: ${editingPreset.id}`);
      } else {
        // Update existing user preset (original behavior)
        const updatedPresets = savedMinifixPresets.map((p) =>
          p.id === editingPreset.id
            ? { ...p, name, nameTh, description, config: currentMinifixConfig, woodThickness: currentWoodThickness, updatedAt: now }
            : p
        );
        setSavedMinifixPresets(updatedPresets);
        savePresetsToStorage(updatedPresets);
      }
    } else {
      // Create new preset
      const newPreset: MinifixConfigPreset = {
        id: generatePresetId(),
        name,
        nameTh,
        description,
        woodThickness: currentWoodThickness,
        config: currentMinifixConfig,
        createdAt: now,
        updatedAt: now,
      };
      const updatedPresets = [...savedMinifixPresets, newPreset];
      setSavedMinifixPresets(updatedPresets);
      savePresetsToStorage(updatedPresets);
    }

    setEditingPreset(null);
  }, [editingPreset, savedMinifixPresets, currentMinifixConfig, currentWoodThickness]);

  // Delete a saved preset
  const handleDeletePreset = useCallback((id: string) => {
    const updatedPresets = savedMinifixPresets.filter((p) => p.id !== id);
    setSavedMinifixPresets(updatedPresets);
    savePresetsToStorage(updatedPresets);
  }, [savedMinifixPresets]);

  // Reset a builtin preset to factory defaults
  const handleResetPreset = useCallback((id: string) => {
    if (!id.startsWith('builtin_')) {
      console.warn('[HardwareLibrary] Cannot reset non-builtin preset:', id);
      return;
    }
    // Remove override from localStorage
    resetBuiltinPreset(id);
    // Reload all presets (builtin + user) to refresh UI
    setSavedMinifixPresets(loadSavedPresets());
    console.log(`[HardwareLibrary] ✅ Reset preset ${id} to factory defaults`);
  }, []);

  // Apply a saved preset
  const handleApplyPreset = useCallback((preset: MinifixConfigPreset) => {
    setCurrentMinifixConfig(preset.config);
    setCurrentWoodThickness(preset.woodThickness);
    console.log('Applied preset:', preset.name, preset.config);

    // CRITICAL: Also store config on the cabinet for drill map generation
    // This ensures generateMinifixDrillMap can read the config from cabinet.hardware.minifixConfig
    if (activeCabinetId) {
      updateHardware(activeCabinetId, {
        minifixConfig: preset.config,
        minifixPresetId: preset.id,
      });
      console.log('[HardwareLibrary] Stored minifix config on cabinet:', activeCabinetId);

      // CRITICAL: Regenerate drill map with new config so 3D visualization updates
      // Without this, the cached drill map would still show old values
      setTimeout(() => {
        regenerateDrillMap();
        console.log('[HardwareLibrary] ✅ Triggered drill map regeneration');
      }, 50); // Small delay to ensure cabinet store is updated first
    }
  }, [activeCabinetId, updateHardware, regenerateDrillMap]);

  // Open config modal for editing a preset
  const handleOpenMinifixConfig = useCallback((preset?: MinifixConfigPreset) => {
    if (preset) {
      setEditingPreset(preset);
      setCurrentMinifixConfig(preset.config);
      setCurrentWoodThickness(preset.woodThickness);
    } else {
      setEditingPreset(null);
    }
    setShowMinifixConfig(true);
  }, []);

  // Save preset form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetNameTh, setPresetNameTh] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  // Initialize form when editing a preset
  useEffect(() => {
    if (editingPreset && showMinifixConfig) {
      setPresetName(editingPreset.name);
      setPresetNameTh(editingPreset.nameTh);
      setPresetDescription(editingPreset.description);
    } else if (!editingPreset && showMinifixConfig) {
      setPresetName('');
      setPresetNameTh('');
      setPresetDescription('');
    }
  }, [editingPreset, showMinifixConfig]);

  const handleSaveClick = () => {
    if (!presetName.trim()) {
      setShowSaveForm(true);
      return;
    }
    handleSavePreset(presetName, presetNameTh, presetDescription);
    setShowSaveForm(false);
    setShowMinifixConfig(false);
    setPresetName('');
    setPresetNameTh('');
    setPresetDescription('');
  };

  const handleCancelSaveForm = () => {
    setShowSaveForm(false);
    if (!editingPreset) {
      setPresetName('');
      setPresetNameTh('');
      setPresetDescription('');
    }
  };

  return (
    <>
      {/* Fullscreen Minifix Config Modal */}
      <FullscreenModal
        isOpen={showMinifixConfig}
        onClose={() => {
          setShowMinifixConfig(false);
          setShowSaveForm(false);
          setEditingPreset(null);
        }}
        title={editingPreset ? `Edit: ${editingPreset.name}` : "Minifix S200 Configuration"}
      >
        <div className="flex flex-col h-full">
          {/* Save Preset Form - appears above main content when open */}
          {showSaveForm && (
            <div className="px-4 py-3 border-b border-[#3a4a5a] bg-[#1a2535]">
              <div className="flex items-start gap-4">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Preset Name (EN) *</label>
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g., Kitchen Cabinet 18mm"
                      className="w-full px-2 py-1.5 text-xs bg-[#0d1520] border border-[#3a4a5a] rounded focus:border-cyan-500 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Preset Name (TH)</label>
                    <input
                      type="text"
                      value={presetNameTh}
                      onChange={(e) => setPresetNameTh(e.target.value)}
                      placeholder="e.g., ตู้ครัว 18 มม."
                      className="w-full px-2 py-1.5 text-xs bg-[#0d1520] border border-[#3a4a5a] rounded focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={presetDescription}
                      onChange={(e) => setPresetDescription(e.target.value)}
                      placeholder="e.g., Standard kitchen config"
                      className="w-full px-2 py-1.5 text-xs bg-[#0d1520] border border-[#3a4a5a] rounded focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleCancelSaveForm}
                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3a4a5a] rounded hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveClick}
                    disabled={!presetName.trim()}
                    className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Save size={12} />
                    {editingPreset ? 'Update Preset' : 'Save Preset'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Config Panel */}
          <div className="flex-1 overflow-hidden">
            <MinifixConfigPanel
              showBackButton={false}
              onClose={() => {
                setShowMinifixConfig(false);
                setShowSaveForm(false);
                setEditingPreset(null);
              }}
              onConfigChange={handleMinifixConfigChange}
              showPreview={true}
              // Priority: editingPreset.config > cabinetMinifixConfig > default
              // This ensures edits persist when reopening the modal
              initialConfig={editingPreset?.config || cabinetMinifixConfig}
              initialWoodThickness={editingPreset?.woodThickness}
              onWoodThicknessChange={setCurrentWoodThickness}
            />
          </div>

          {/* Bottom Action Bar */}
          <div className="px-4 py-2 border-t border-[#3a4a5a] bg-[#152030] flex items-center justify-between">
            <div className="text-[10px] text-gray-500">
              {editingPreset ? (
                <span className="text-cyan-400">Editing: {editingPreset.name}</span>
              ) : (
                <span>Configure and save as preset for reuse</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowMinifixConfig(false);
                  setShowSaveForm(false);
                  setEditingPreset(null);
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3a4a5a] rounded hover:bg-white/5"
              >
                Close
              </button>
              {!showSaveForm && (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center gap-1"
                >
                  <Save size={12} />
                  {editingPreset ? 'Update Preset' : 'Save as Preset'}
                </button>
              )}
            </div>
          </div>
        </div>
      </FullscreenModal>

      {/* Fullscreen Target J10 Config Modal */}
      <FullscreenModal
        isOpen={showTargetJ10Config}
        onClose={() => setShowTargetJ10Config(false)}
        title="Target J10 Configuration"
      >
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-hidden">
            <TargetJ10ConfigPanel
              onClose={() => setShowTargetJ10Config(false)}
              onConfigChange={setCurrentTargetJ10Config}
              initialConfig={currentTargetJ10Config}
            />
          </div>
          <div className="px-4 py-2 border-t border-[#3a4a5a] bg-[#152030] flex items-center justify-end">
            <button
              onClick={() => setShowTargetJ10Config(false)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3a4a5a] rounded hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      </FullscreenModal>

      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-green-400" />
            <span className="text-xs font-medium text-white">Hardware Library</span>
          </div>
          <span className="text-[9px] text-gray-500">
            {selectedConnectors.length + selectedHinges.length} items selected
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Connectors */}
          <Section
            title="Connectors"
            titleTh="ตัวยึด"
            icon="🔩"
            color="purple"
            isOpen={openSections.includes('connectors')}
            onToggle={() => toggleSection('connectors')}
            badge={selectedConnectors.length}
          >
            <ConnectorsSection
              onOpenMinifixConfig={handleOpenMinifixConfig}
              onOpenTargetJ10Config={() => setShowTargetJ10Config(true)}
              selectedConnectors={selectedConnectors}
              onSelectConnector={toggleConnector}
              savedMinifixPresets={savedMinifixPresets}
              onDeleteSavedPreset={handleDeletePreset}
              onApplySavedPreset={handleApplyPreset}
              onResetPresetToFactory={handleResetPreset}
            />
          </Section>

          {/* Hinges */}
          <Section
            title="Hinges"
            titleTh="บานพับ"
            icon="🔗"
            color="blue"
            isOpen={openSections.includes('hinges')}
            onToggle={() => toggleSection('hinges')}
            badge={selectedHinges.length}
          >
            <HingesSection selectedHinges={selectedHinges} onSelectHinge={toggleHinge} />
          </Section>

          {/* Drawer Systems */}
          <Section
            title="Drawer Systems"
            titleTh="รางลิ้นชัก"
            icon="📥"
            color="green"
            isOpen={openSections.includes('drawer')}
            onToggle={() => toggleSection('drawer')}
            badge={selectedDrawers.length}
          >
            <div className="text-[10px] text-gray-500 text-center py-4">
              Coming soon: Tandembox, ArciTech, Legrabox
            </div>
          </Section>

          {/* Shelf Supports */}
          <Section
            title="Shelf Supports"
            titleTh="หมุดชั้น"
            icon="📍"
            color="amber"
            isOpen={openSections.includes('shelf')}
            onToggle={() => toggleSection('shelf')}
            badge={selectedShelfSupports.length}
          >
            <div className="text-[10px] text-gray-500 text-center py-4">
              Coming soon: 5mm pins, brackets, invisible supports
            </div>
          </Section>

          {/* Handles */}
          <Section
            title="Handles & Knobs"
            titleTh="มือจับ"
            icon="🚪"
            color="cyan"
            isOpen={openSections.includes('handles')}
            onToggle={() => toggleSection('handles')}
            badge={selectedHandles.length}
          >
            <div className="text-[10px] text-gray-500 text-center py-4">
              Coming soon: Bar handles, knobs, profiles
            </div>
          </Section>

          {/* Lighting */}
          <Section
            title="Lighting"
            titleTh="ไฟ LED"
            icon="💡"
            color="yellow"
            isOpen={openSections.includes('lighting')}
            onToggle={() => toggleSection('lighting')}
            badge={selectedLighting.length}
          >
            <div className="text-[10px] text-gray-500 text-center py-4">
              Coming soon: LED strips, spots, sensors
            </div>
          </Section>
        </div>

        {/* Summary */}
        <div className="p-2 border-t border-[#333] bg-surface-2/50">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Selected Hardware</span>
            <span className="text-green-400">
              {selectedConnectors.length + selectedHinges.length} items
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {selectedConnectors.map((id) => {
              const preset = CONNECTOR_PRESETS.find((p) => p.id === id);
              return (
                <span
                  key={id}
                  className="px-1.5 py-0.5 text-[8px] bg-purple-500/20 text-purple-300 rounded"
                >
                  {preset?.name || id}
                </span>
              );
            })}
            {selectedHinges.map((id) => {
              const preset = HINGE_PRESETS.find((p) => p.id === id);
              return (
                <span
                  key={id}
                  className="px-1.5 py-0.5 text-[8px] bg-blue-500/20 text-blue-300 rounded"
                >
                  {preset?.name || id}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export default HardwareLibraryPanel;
