/**
 * SketchOverlay.tsx - Sketch Mode UI Components
 *
 * Provides UI overlays for sketch mode:
 * - SketchToolbar: Tool selection and actions
 * - SketchHUD: Status display and hints
 *
 * @version 1.0.0
 */

import React from 'react';
import {
  useSketchStore,
  useSketchEnabled,
  useSketchTool,
  useSketchTempPoints,
  useSketchEntities,
} from '../../core/sketch';
import { SKETCH_TOOLS, SketchTool } from '../../core/sketch/types';
import { useCPlane, useCPlaneKind } from '../../core/cplane';
import {
  Pencil,
  MousePointer2,
  Minus,
  Square,
  Circle,
  Check,
  X,
  Trash2,
  Grid3X3,
  Magnet,
  Layers,
  Scissors,
} from 'lucide-react';
import { generateFeatures, formatFeatureSummary } from '../../core/sketch/featureGenerator';
import {
  useFlatPartPreview,
  useIsPreviewMode,
  buildPreviewFromSketch,
  applyPreviewToActiveCabinet,
  hasPreviewToApply,
  getApplySummary,
} from '../../core/flatpart';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { fromPreviewToFlatPart } from '../../core/flatpart/fromPreview';
import { flatPartToDxfR12 } from '../../core/export/dxf/dxfR12';
import { saveDxfFile } from '../../core/export/saveClient';
import { Eye, EyeOff, Send, Download } from 'lucide-react';

// ============================================================================
// Tool Icons Map
// ============================================================================

const TOOL_ICONS: Record<SketchTool, React.ReactNode> = {
  select: <MousePointer2 size={16} />,
  line: <Minus size={16} />,
  rect: <Square size={16} />,
  arc: <span style={{ fontSize: 14 }}>◠</span>,
  circle: <Circle size={16} />,
  polyline: <span style={{ fontSize: 14 }}>⌇</span>,
};

// ============================================================================
// SketchToolbar Component
// ============================================================================

export function SketchToolbar() {
  const enabled = useSketchEnabled();
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const entities = useSketchEntities();
  const snapToGrid = useSketchStore((s) => s.snapToGrid);
  const snapToEndpoints = useSketchStore((s) => s.snapToEndpoints);
  const constructionMode = useSketchStore((s) => s.constructionMode);
  const selectedIds = useSketchStore((s) => s.selectedIds);

  const toggle = useSketchStore((s) => s.toggle);
  const setTool = useSketchStore((s) => s.setTool);
  const commit = useSketchStore((s) => s.commit);
  const clearTempPoints = useSketchStore((s) => s.clearTempPoints);
  const clearEntities = useSketchStore((s) => s.clearEntities);
  const deleteSelected = useSketchStore((s) => s.deleteSelected);
  const toggleSnapToGrid = useSketchStore((s) => s.toggleSnapToGrid);
  const toggleSnapToEndpoints = useSketchStore((s) => s.toggleSnapToEndpoints);
  const toggleConstructionMode = useSketchStore((s) => s.toggleConstructionMode);

  const cplaneKind = useCPlaneKind();

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Main Toggle Button */}
      <button
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: enabled ? 'rgba(139, 92, 246, 0.3)' : 'rgba(26, 26, 46, 0.9)',
          border: `1px solid ${enabled ? '#8b5cf6' : '#3a3a5a'}`,
          borderRadius: 8,
          color: enabled ? '#c4b5fd' : '#9ca3af',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          transition: 'all 0.15s ease',
        }}
      >
        <Pencil size={16} />
        <span>Sketch {enabled ? 'ON' : 'OFF'}</span>
        <kbd style={kbdStyle}>K</kbd>
      </button>

      {/* Tool Selection (only when enabled) */}
      {enabled && (
        <div
          style={{
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {/* CPlane indicator */}
          <div
            style={{
              fontSize: 10,
              color: '#6b7280',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ color: '#8b5cf6' }}>CPlane:</span>
            <span style={{ color: '#c4b5fd', fontFamily: 'monospace' }}>{cplaneKind}</span>
          </div>

          {/* Tool Buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['select', 'line', 'rect', 'arc', 'circle'] as SketchTool[]).map((t) => {
              const info = SKETCH_TOOLS[t];
              const isActive = tool === t;

              return (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  title={`${info.name} (${info.hotkey})`}
                  style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    border: `1px solid ${isActive ? '#8b5cf6' : 'transparent'}`,
                    borderRadius: 6,
                    color: isActive ? '#c4b5fd' : '#9ca3af',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {TOOL_ICONS[t]}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: '#3a3a5a', margin: '4px 0' }} />

          {/* Snap Options */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={toggleSnapToGrid}
              title="Snap to Grid"
              style={{
                width: 36,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: snapToGrid ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                border: `1px solid ${snapToGrid ? '#3b82f6' : 'transparent'}`,
                borderRadius: 4,
                color: snapToGrid ? '#93c5fd' : '#6b7280',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={toggleSnapToEndpoints}
              title="Snap to Endpoints"
              style={{
                width: 36,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: snapToEndpoints ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
                border: `1px solid ${snapToEndpoints ? '#22c55e' : 'transparent'}`,
                borderRadius: 4,
                color: snapToEndpoints ? '#86efac' : '#6b7280',
                cursor: 'pointer',
              }}
            >
              <Magnet size={14} />
            </button>
            <button
              onClick={toggleConstructionMode}
              title="Construction Mode"
              style={{
                flex: 1,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: constructionMode ? 'rgba(245, 158, 11, 0.3)' : 'transparent',
                border: `1px solid ${constructionMode ? '#f59e0b' : 'transparent'}`,
                borderRadius: 4,
                color: constructionMode ? '#fcd34d' : '#6b7280',
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              <span>Const</span>
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: '#3a3a5a', margin: '4px 0' }} />

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={commit}
              disabled={tempPoints.length < 2}
              title="Commit (Enter)"
              style={{
                flex: 1,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: tempPoints.length >= 2 ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                color: tempPoints.length >= 2 ? '#86efac' : '#4b5563',
                cursor: tempPoints.length >= 2 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Check size={14} />
              <span>Commit</span>
            </button>
            <button
              onClick={clearTempPoints}
              disabled={tempPoints.length === 0}
              title="Clear Points (Esc)"
              style={{
                flex: 1,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                color: tempPoints.length > 0 ? '#fca5a5' : '#4b5563',
                cursor: tempPoints.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <X size={14} />
              <span>Clear</span>
            </button>
          </div>

          {/* Delete / Clear All */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.length === 0}
              title="Delete Selected (Del)"
              style={{
                flex: 1,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                color: selectedIds.length > 0 ? '#fca5a5' : '#4b5563',
                cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
            <button
              onClick={clearEntities}
              disabled={entities.length === 0}
              title="Clear All"
              style={{
                flex: 1,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                color: entities.length > 0 ? '#fca5a5' : '#4b5563',
                cursor: entities.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <span>Clear All</span>
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: '#3a3a5a', margin: '4px 0' }} />

          {/* Generate Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#6b7280' }}>Generate Feature</div>
            <button
              onClick={() => {
                const features = generateFeatures(entities, { mode: 'outline' });
                const summary = formatFeatureSummary(features);
                console.log('[Sketch→Feature] Panel Outline:', summary, features);
                alert(`Generated: ${summary}`);
              }}
              disabled={entities.length === 0}
              title="Generate Panel Outline from sketch"
              style={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: entities.length > 0 ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                border: `1px solid ${entities.length > 0 ? '#8b5cf6' : 'transparent'}`,
                borderRadius: 4,
                color: entities.length > 0 ? '#c4b5fd' : '#4b5563',
                cursor: entities.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Layers size={14} />
              <span>Panel Outline</span>
            </button>
            <button
              onClick={() => {
                const features = generateFeatures(entities, { mode: 'cutout', cutoutDepth: 10 });
                const summary = formatFeatureSummary(features);
                console.log('[Sketch→Feature] Cutout:', summary, features);
                alert(`Generated: ${summary}`);
              }}
              disabled={entities.length === 0}
              title="Generate Cutout from sketch"
              style={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: entities.length > 0 ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                border: `1px solid ${entities.length > 0 ? '#f59e0b' : 'transparent'}`,
                borderRadius: 4,
                color: entities.length > 0 ? '#fcd34d' : '#4b5563',
                cursor: entities.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Scissors size={14} />
              <span>Cutout</span>
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: '#3a3a5a', margin: '4px 0' }} />

          {/* Preview & Apply */}
          <PreviewApplySection entities={entities} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Preview & Apply Section
// ============================================================================

interface PreviewApplySectionProps {
  entities: any[];
}

function PreviewApplySection({ entities }: PreviewApplySectionProps) {
  const isPreviewMode = useIsPreviewMode();
  const clearPreview = useFlatPartPreview((s) => s.clearPreview);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);

  const handlePreview = () => {
    if (entities.length === 0) return;

    // Generate features from sketch entities
    const features = generateFeatures(entities, { mode: 'outline' });
    console.log('[Preview] Generated features:', features);

    // Build preview from features
    const preview = buildPreviewFromSketch(features);
    console.log('[Preview] Built preview:', preview);

    // Update store
    const store = useFlatPartPreview.getState();
    if (preview.outline) {
      store.setOutline(preview.outline);
    }
    preview.cutouts.forEach((c) => store.addCutout(c));
    preview.paths.forEach((p) => store.addPath(p));

    store.setPreviewMode(true);
    console.log('[Preview] Preview mode activated');
  };

  const handleApply = () => {
    const result = applyPreviewToActiveCabinet();
    console.log('[Apply] Result:', result);

    if (result.success) {
      alert(`Applied ${result.appliedFeatures.length} feature(s) to cabinet`);
    } else {
      alert(`Failed: ${result.message}`);
    }
  };

  const handleClearPreview = () => {
    clearPreview();
    console.log('[Preview] Preview cleared');
  };

  const handleExportDxf = () => {
    const previewData = useFlatPartPreview.getState().preview;

    // Convert preview to FlatPart
    const result = fromPreviewToFlatPart(previewData, {
      name: 'sketch_part',
      thickness: 18,
      autoFixWinding: true,
    });

    if (!result.success || !result.flatPart) {
      alert(`Export failed: ${result.messages.join('\n')}`);
      return;
    }

    console.log('[DXF Export] FlatPart created:', result.flatPart);
    console.log('[DXF Export] Messages:', result.messages);

    // Generate DXF content
    const dxfContent = flatPartToDxfR12(result.flatPart, {
      includeSheet: true,
    });

    // Download file
    const filename = `sketch_part_${Date.now().toString(36)}.dxf`;
    saveDxfFile(filename, dxfContent);

    console.log('[DXF Export] File saved:', filename);
    alert(`DXF exported: ${filename}`);
  };

  const canPreview = entities.length > 0;
  const canApply = isPreviewMode && hasPreviewToApply() && !!activeCabinetId;
  const canExportDxf = isPreviewMode && hasPreviewToApply();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, color: '#6b7280' }}>Preview & Apply</div>

      {/* Preview Toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={handlePreview}
          disabled={!canPreview}
          title="Generate 2D preview on CPlane"
          style={{
            flex: 1,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: canPreview ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
            border: `1px solid ${canPreview ? '#22c55e' : 'transparent'}`,
            borderRadius: 4,
            color: canPreview ? '#86efac' : '#4b5563',
            cursor: canPreview ? 'pointer' : 'not-allowed',
            fontSize: 11,
          }}
        >
          <Eye size={14} />
          <span>Preview</span>
        </button>

        {isPreviewMode && (
          <button
            onClick={handleClearPreview}
            title="Clear preview"
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: 4,
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            <EyeOff size={14} />
          </button>
        )}
      </div>

      {/* Apply to Cabinet */}
      <button
        onClick={handleApply}
        disabled={!canApply}
        title={
          !activeCabinetId
            ? 'Select a cabinet first'
            : !isPreviewMode
            ? 'Generate preview first'
            : 'Apply preview to active cabinet'
        }
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: canApply ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
          border: `1px solid ${canApply ? '#3b82f6' : '#3a3a5a'}`,
          borderRadius: 4,
          color: canApply ? '#93c5fd' : '#4b5563',
          cursor: canApply ? 'pointer' : 'not-allowed',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <Send size={14} />
        <span>Apply to Cabinet</span>
      </button>

      {/* Export DXF */}
      <button
        onClick={handleExportDxf}
        disabled={!canExportDxf}
        title={!isPreviewMode ? 'Generate preview first' : 'Export as DXF R12 file'}
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          backgroundColor: canExportDxf ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
          border: `1px solid ${canExportDxf ? '#f59e0b' : 'transparent'}`,
          borderRadius: 4,
          color: canExportDxf ? '#fcd34d' : '#4b5563',
          cursor: canExportDxf ? 'pointer' : 'not-allowed',
          fontSize: 11,
        }}
      >
        <Download size={14} />
        <span>Export DXF</span>
      </button>

      {/* Status */}
      {isPreviewMode && (
        <div
          style={{
            fontSize: 9,
            color: '#6b7280',
            textAlign: 'center',
            padding: '2px 0',
          }}
        >
          {getApplySummary()}
        </div>
      )}

      {!activeCabinetId && (
        <div
          style={{
            fontSize: 9,
            color: '#f59e0b',
            textAlign: 'center',
            padding: '2px 0',
          }}
        >
          No cabinet selected
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SketchHUD Component
// ============================================================================

export function SketchHUD() {
  const enabled = useSketchEnabled();
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const entities = useSketchEntities();
  const cplaneKind = useCPlaneKind();

  if (!enabled) return null;

  const toolInfo = SKETCH_TOOLS[tool];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 16,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid #3a3a5a',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 11,
        color: '#9ca3af',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 180,
      }}
    >
      {/* Tool & Plane */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          Tool: <span style={{ color: '#c4b5fd' }}>{toolInfo.name}</span>
        </span>
        <span>
          Plane: <span style={{ color: '#8b5cf6' }}>{cplaneKind}</span>
        </span>
      </div>

      {/* Points & Entities Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          Points: <span style={{ color: '#fcd34d' }}>{tempPoints.length}</span>
        </span>
        <span>
          Entities: <span style={{ color: '#22c55e' }}>{entities.length}</span>
        </span>
      </div>

      {/* Hints */}
      <div
        style={{
          borderTop: '1px solid #3a3a5a',
          paddingTop: 4,
          marginTop: 2,
          color: '#6b7280',
          fontSize: 10,
        }}
      >
        {tool === 'select' && 'Click to select entities'}
        {tool === 'line' && `Click 2 points (${tempPoints.length}/2)`}
        {tool === 'rect' && `Click 2 corners (${tempPoints.length}/2)`}
        {tool === 'arc' && `Click 3 points: start, mid, end (${tempPoints.length}/3)`}
        {tool === 'circle' && `Click center, then radius point (${tempPoints.length}/2)`}
      </div>
    </div>
  );
}

// ============================================================================
// CPlane Selector
// ============================================================================

export function CPlaneSelector() {
  const plane = useCPlane((s) => s.plane);
  const setKind = useCPlane((s) => s.setKind);
  const toggleVisible = useCPlane((s) => s.toggleVisible);
  const visible = useCPlane((s) => s.visible);

  const planes = [
    { kind: 'XZ' as const, label: 'Floor (XZ)', hotkey: 'Shift+X' },
    { kind: 'XY' as const, label: 'Front (XY)', hotkey: 'Shift+Y' },
    { kind: 'YZ' as const, label: 'Side (YZ)', hotkey: 'Shift+Z' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 100,
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid #3a3a5a',
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#6b7280',
          marginBottom: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Construction Plane</span>
        <button
          onClick={toggleVisible}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: visible ? '#8b5cf6' : '#4b5563',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {planes.map((p) => (
        <button
          key={p.kind}
          onClick={() => setKind(p.kind)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            backgroundColor: plane.kind === p.kind ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
            border: `1px solid ${plane.kind === p.kind ? '#8b5cf6' : 'transparent'}`,
            borderRadius: 4,
            color: plane.kind === p.kind ? '#c4b5fd' : '#9ca3af',
            cursor: 'pointer',
            fontSize: 11,
            width: '100%',
          }}
        >
          <span>{p.label}</span>
          <kbd style={{ ...kbdStyle, fontSize: 8 }}>{p.hotkey}</kbd>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 5px',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: 3,
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#6b7280',
};

// ============================================================================
// Exports
// ============================================================================

export default SketchToolbar;
