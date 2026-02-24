/**
 * RightInspector - Object Properties Panel
 *
 * Floating inspector panel on the right side of the 3D canvas.
 * Shows properties of selected cabinet/object:
 * - Transform (Position, Rotation)
 * - Dimensions (Width, Height, Depth)
 * - Quick actions
 *
 * @version 1.0.0
 */

import React from 'react';
import { GlassPanel, GlassPanelSection, GlassPanelDivider } from '../../components/ui/GlassPanel';
import { GhostInput, XYZInput } from '../../components/ui/GhostInput';
import { ToolButton, ToolButtonGroup } from '../../components/ui/ToolButton';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import type { Cabinet, CabinetDimensions } from '../../core/types/Cabinet';
import { RightInspectorSafetySection } from '../../gate/ui';

// ============================================
// ICONS
// ============================================

const MoveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
);

const RotateCWIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

// ============================================
// MAIN COMPONENT
// ============================================

export interface RightInspectorProps {
  /** Visible state */
  visible?: boolean;
  /** On close callback */
  onClose?: () => void;
}

// Extended cabinet type with scene properties
type SceneCabinet = Cabinet & {
  scenePosition?: [number, number, number];
  sceneRotation?: [number, number, number];
};

export function RightInspector({
  visible = true,
  onClose,
}: RightInspectorProps) {
  // Get active cabinet from store
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const cabinets = useCabinetStore((s) => s.cabinets) as SceneCabinet[];
  const updateCabinetPosition = useCabinetStore((s) => s.updateCabinetPosition);
  const setDimension = useCabinetStore((s) => s.setDimension);
  const rotateCabinet90 = useCabinetStore((s) => s.rotateCabinet90);
  const removeCabinet = useCabinetStore((s) => s.removeCabinet);
  const duplicateCabinet = useCabinetStore((s) => s.duplicateCabinet);
  const selectCabinet = useCabinetStore((s) => s.selectCabinet);

  const activeCabinet = cabinets.find((c) => c.id === activeCabinetId);

  if (!visible) return null;

  // No cabinet selected
  if (!activeCabinet) {
    return (
      <div className="inspector-panel">
        <GlassPanel title="Inspector" width={280}>
          <div className="text-center py-8">
            <div className="text-textc-muted text-xs">No object selected</div>
            <div className="text-textc-muted/60 text-[10px] mt-1">
              Click a cabinet to inspect
            </div>
          </div>
        </GlassPanel>
      </div>
    );
  }

  // Extract position
  const position = activeCabinet.scenePosition || [0, 0, 0];
  const rotation = activeCabinet.sceneRotation || [0, 0, 0];

  // Handlers
  const handlePositionChange = (newPos: [number, number, number]) => {
    updateCabinetPosition(activeCabinet.id, newPos);
  };

  const handleDimensionChange = (dim: keyof CabinetDimensions, value: number) => {
    // Ensure this cabinet is active before setting dimension
    if (activeCabinetId !== activeCabinet.id) {
      selectCabinet(activeCabinet.id);
    }
    setDimension(dim, value);
  };

  const handleRotate = (direction: 'cw' | 'ccw') => {
    rotateCabinet90?.(activeCabinet.id, direction);
  };

  const handleDuplicate = () => {
    duplicateCabinet?.(activeCabinet.id);
  };

  const handleDelete = () => {
    removeCabinet(activeCabinet.id);
  };

  // Cabinet type display
  const cabinetTypeLabel = activeCabinet.type?.replace(/-/g, ' ').toLowerCase() || 'cabinet';

  return (
    <div className="inspector-panel">
      <GlassPanel
        title="Inspector"
        width={280}
        collapsible
        headerActions={
          <button
            type="button"
            onClick={onClose}
            className="tool-btn w-5 h-5 flex items-center justify-center"
          >
            <svg className="w-3 h-3 text-textc-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        }
      >
        {/* Object Info */}
        <GlassPanelSection>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-textc-primary capitalize">
              {cabinetTypeLabel}
            </span>
            <span className="text-[9px] font-mono text-textc-muted">
              {activeCabinet.id.slice(0, 8)}
            </span>
          </div>
        </GlassPanelSection>

        <GlassPanelDivider />

        {/* Transform Section */}
        <GlassPanelSection title="Transform">
          {/* Position */}
          <div className="mb-3">
            <div className="text-[9px] text-textc-muted mb-1">Position</div>
            <XYZInput
              values={position as [number, number, number]}
              onChange={handlePositionChange}
              unit="mm"
              step={10}
            />
          </div>

          {/* Rotation */}
          <div>
            <div className="text-[9px] text-textc-muted mb-1">Rotation</div>
            <div className="flex items-center gap-2">
              <GhostInput
                label="Y"
                value={Math.round((rotation[1] * 180) / Math.PI)}
                onChange={() => {}}
                unit="mm"
                readOnly
                className="flex-1"
              />
              <ToolButtonGroup>
                <ToolButton
                  icon={<RotateCWIcon />}
                  tooltip="Rotate 90° CCW"
                  shortcut="Shift+R"
                  onClick={() => handleRotate('ccw')}
                  size="sm"
                />
                <ToolButton
                  icon={<RotateCWIcon />}
                  tooltip="Rotate 90° CW"
                  shortcut="R"
                  onClick={() => handleRotate('cw')}
                  size="sm"
                  className="scale-x-[-1]"
                />
              </ToolButtonGroup>
            </div>
          </div>
        </GlassPanelSection>

        <GlassPanelDivider />

        {/* Dimensions Section */}
        <GlassPanelSection title="Dimensions">
          <div className="space-y-1">
            <GhostInput
              label="Width"
              value={activeCabinet.dimensions.width}
              onChange={(v) => handleDimensionChange('width', v)}
              unit="mm"
              min={200}
              max={2400}
              step={10}
            />
            <GhostInput
              label="Height"
              value={activeCabinet.dimensions.height}
              onChange={(v) => handleDimensionChange('height', v)}
              unit="mm"
              min={200}
              max={2400}
              step={10}
            />
            <GhostInput
              label="Depth"
              value={activeCabinet.dimensions.depth}
              onChange={(v) => handleDimensionChange('depth', v)}
              unit="mm"
              min={200}
              max={800}
              step={10}
            />
          </div>
        </GlassPanelSection>

        <GlassPanelDivider />

        {/* Quick Actions */}
        <GlassPanelSection title="Actions">
          <div className="flex items-center gap-1">
            <ToolButton
              icon={<MoveIcon />}
              tooltip="Move"
              shortcut="G"
              size="md"
            />
            <ToolButton
              icon={<CopyIcon />}
              tooltip="Duplicate"
              shortcut="Ctrl+D"
              onClick={handleDuplicate}
              size="md"
            />
            <ToolButton
              icon={<LockIcon />}
              tooltip="Lock"
              size="md"
            />
            <div className="flex-1" />
            <ToolButton
              icon={<DeleteIcon />}
              tooltip="Delete"
              shortcut="Del"
              onClick={handleDelete}
              size="md"
              className="text-accent-red hover:bg-accent-red/20"
            />
          </div>
        </GlassPanelSection>

        {/* Safety Section - Gate findings for selected cabinet */}
        <RightInspectorSafetySection />
      </GlassPanel>
    </div>
  );
}

export default RightInspector;
