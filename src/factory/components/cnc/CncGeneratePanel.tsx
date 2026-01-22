/**
 * CncGeneratePanel - G-code Generation UI Component
 *
 * Allows operators to select a machine and generate G-code from verified packets.
 * Shows validation status, operation preview, and generation progress.
 *
 * @version 1.3.0 - Phase D6-E.2: Tool Health UI
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { FactoryPacket } from '../../packet/types';
import type { GcodeBundle } from '../../../cnc/post/types';
import type {
  CncMachineOption,
  CncValidationIssue,
  CncGenerationStatus,
  WorkpieceConfig,
} from '../../types/cnc';
import {
  generateGcodeForJob,
  getAvailableMachines,
  getDefaultMachineId,
  getGenerationValidation,
  generateAndDownloadCncBundle,
} from '../../cnc/generateGcodeForJob';
import { isCncSuccess } from '../../types/cnc';
import { WorkpieceConfigPanel } from './WorkpieceConfigPanel';
import {
  ToolHealthStrip,
  ToolHealthBadge,
  ToolHealthModal,
} from '../tooling';
import type { ToolHealth } from '../../tooling';

// ============================================================================
// Types
// ============================================================================

export interface CncGeneratePanelProps {
  /** Job ID for G-code generation */
  jobId: string;
  /** Verified factory packet (required for generation) */
  packet: FactoryPacket | null;
  /** Callback when generation completes successfully */
  onGenerateComplete?: (bundle: GcodeBundle) => void;
  /** Callback when preview is requested */
  onPreviewRequest?: (bundle: GcodeBundle) => void;
}

// ============================================================================
// Component
// ============================================================================

export function CncGeneratePanel({
  jobId,
  packet,
  onGenerateComplete,
  onPreviewRequest,
}: CncGeneratePanelProps): React.ReactElement {
  // State
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [status, setStatus] = useState<CncGenerationStatus>('IDLE');
  const [bundle, setBundle] = useState<GcodeBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeComments, setIncludeComments] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(false);
  const [workpieceConfig, setWorkpieceConfig] = useState<WorkpieceConfig>({
    panels: new Map(),
    applyTransforms: false,
  });
  const [showWorkpieceConfig, setShowWorkpieceConfig] = useState(false);

  // D6-E.2: Tool health modal state
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const handleToolClick = useCallback((tool: ToolHealth) => {
    setSelectedToolId(tool.toolId);
  }, []);
  const handleCloseToolModal = useCallback(() => {
    setSelectedToolId(null);
  }, []);

  // Get available machines
  const machines = useMemo(() => getAvailableMachines(packet), [packet]);

  // Get validation status for selected machine
  const validation = useMemo(() => {
    if (!selectedMachineId) return null;
    return getGenerationValidation(packet, selectedMachineId);
  }, [packet, selectedMachineId]);

  // Auto-select default machine
  useEffect(() => {
    if (!selectedMachineId && packet) {
      const defaultId = getDefaultMachineId(packet);
      if (defaultId) {
        setSelectedMachineId(defaultId);
      }
    }
  }, [packet, selectedMachineId]);

  // Handle machine selection
  const handleMachineSelect = useCallback((machineId: string) => {
    setSelectedMachineId(machineId);
    setBundle(null);
    setError(null);
  }, []);

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!selectedMachineId || !packet) return;

    setStatus('GENERATING');
    setError(null);
    setBundle(null);

    const response = await generateGcodeForJob(packet, {
      jobId,
      machineId: selectedMachineId,
      includeComments,
      lineNumbers,
      workpieceConfig: workpieceConfig.applyTransforms ? workpieceConfig : undefined,
    });

    if (isCncSuccess(response)) {
      setBundle(response.bundle);
      setStatus('DONE');
      onGenerateComplete?.(response.bundle);
    } else {
      setError(response.message);
      setStatus('ERROR');
    }
  }, [jobId, packet, selectedMachineId, includeComments, lineNumbers, workpieceConfig, onGenerateComplete]);

  // Get panels from packet for workpiece config
  const drillMapPanels = useMemo(() => {
    return packet?.drillMap?.panels ?? [];
  }, [packet]);

  // Handle preview
  const handlePreview = useCallback(() => {
    if (bundle) {
      onPreviewRequest?.(bundle);
    }
  }, [bundle, onPreviewRequest]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!bundle || bundle.files.length === 0) return;

    const file = bundle.files[0];
    const blob = new Blob([file.bytes], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const filename = file.path.split('/').pop() || 'program.nc';

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bundle]);

  // Render
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 20,
        backgroundColor: '#1a1a2e',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          G-code Generation
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* D6-E.2: Tool Health Strip */}
          <ToolHealthStrip
            maxTools={3}
            showAllTools={false}
            onToolClick={handleToolClick}
            size="sm"
          />
          {bundle && (
            <span
              style={{
                padding: '4px 8px',
                backgroundColor: '#22c55e20',
                color: '#22c55e',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Ready
            </span>
          )}
        </div>
      </div>

      {/* No packet warning */}
      {!packet && (
        <div
          style={{
            padding: 16,
            backgroundColor: '#f59e0b20',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            color: '#f59e0b',
            fontSize: 13,
          }}
        >
          No verified packet available. Please ingest and verify a factory packet first.
        </div>
      )}

      {/* Machine selector */}
      {packet && (
        <MachineSelector
          machines={machines}
          selectedId={selectedMachineId}
          onSelect={handleMachineSelect}
          disabled={status === 'GENERATING'}
        />
      )}

      {/* Validation status */}
      {validation && selectedMachineId && (
        <ValidationStatus validation={validation} />
      )}

      {/* Generation options */}
      {selectedMachineId && validation?.canGenerate && (
        <GenerationOptions
          includeComments={includeComments}
          lineNumbers={lineNumbers}
          onIncludeCommentsChange={setIncludeComments}
          onLineNumbersChange={setLineNumbers}
          disabled={status === 'GENERATING'}
        />
      )}

      {/* Workpiece config toggle */}
      {selectedMachineId && validation?.canGenerate && drillMapPanels.length > 0 && (
        <button
          onClick={() => setShowWorkpieceConfig(!showWorkpieceConfig)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: '#2a2a4a',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            color: '#ccc',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <span>Workpiece Configuration</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {workpieceConfig.applyTransforms && (
              <span
                style={{
                  padding: '2px 6px',
                  backgroundColor: '#8b5cf620',
                  color: '#8b5cf6',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                Active
              </span>
            )}
            <span
              style={{
                transform: showWorkpieceConfig ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              ▼
            </span>
          </span>
        </button>
      )}

      {/* Workpiece config panel (collapsible) */}
      {showWorkpieceConfig && selectedMachineId && validation?.canGenerate && (
        <WorkpieceConfigPanel
          panels={drillMapPanels}
          config={workpieceConfig}
          onChange={setWorkpieceConfig}
          disabled={status === 'GENERATING'}
        />
      )}

      {/* Generate button with tool health badge */}
      {selectedMachineId && validation?.canGenerate && !bundle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={status === 'GENERATING'}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 20px',
              backgroundColor: status === 'GENERATING' ? '#3a3a5a' : '#8b5cf6',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: status === 'GENERATING' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'GENERATING' ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>...</span>
                Generating G-code...
              </>
            ) : (
              <>Generate G-code</>
            )}
          </button>
          {/* D6-E.2: Tool Health Badge - warning only, doesn't block */}
          <ToolHealthBadge
            onClick={() => setSelectedToolId('__list__')}
            size="md"
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: 12,
            backgroundColor: '#ef444420',
            border: '1px solid #ef4444',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Success result */}
      {bundle && selectedMachineId && (
        <GenerationResult
          bundle={bundle}
          packet={packet}
          jobId={jobId}
          machineId={selectedMachineId}
          includeComments={includeComments}
          lineNumbers={lineNumbers}
          onPreview={handlePreview}
          onDownload={handleDownload}
        />
      )}

      {/* D6-E.2: Tool Health Modal */}
      {selectedToolId && selectedToolId !== '__list__' && (
        <ToolHealthModal
          toolId={selectedToolId}
          isOpen={true}
          onClose={handleCloseToolModal}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface MachineSelectorProps {
  machines: CncMachineOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

function MachineSelector({
  machines,
  selectedId,
  onSelect,
  disabled,
}: MachineSelectorProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Target Machine
      </label>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {machines.map((machine) => (
          <button
            key={machine.id}
            onClick={() => onSelect(machine.id)}
            disabled={!machine.available || disabled}
            style={{
              padding: '10px 16px',
              backgroundColor:
                selectedId === machine.id
                  ? '#8b5cf620'
                  : machine.available
                  ? '#2a2a4a'
                  : '#1a1a2e',
              border:
                selectedId === machine.id
                  ? '2px solid #8b5cf6'
                  : '1px solid #3a3a5a',
              borderRadius: 8,
              color: machine.available ? '#fff' : '#666',
              fontSize: 13,
              fontWeight: selectedId === machine.id ? 600 : 400,
              cursor: machine.available && !disabled ? 'pointer' : 'not-allowed',
              opacity: machine.available ? 1 : 0.5,
            }}
          >
            <div style={{ fontWeight: 600 }}>{machine.name}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {machine.dialect}
            </div>
            {machine.unavailableReason && (
              <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                {machine.unavailableReason}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ValidationStatusProps {
  validation: {
    canGenerate: boolean;
    issues: CncValidationIssue[];
    operationCount: number;
    estimatedTime: number;
  };
}

function ValidationStatus({ validation }: ValidationStatusProps): React.ReactElement {
  const errors = validation.issues.filter((i) => i.severity === 'ERROR');
  const warnings = validation.issues.filter((i) => i.severity === 'WARNING');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: validation.canGenerate ? '#22c55e10' : '#ef444410',
        border: `1px solid ${validation.canGenerate ? '#22c55e40' : '#ef444440'}`,
        borderRadius: 8,
      }}
    >
      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: validation.canGenerate ? '#22c55e' : '#ef4444',
            fontWeight: 500,
          }}
        >
          {validation.canGenerate ? 'Ready to generate' : 'Cannot generate'}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888' }}>
          <span>{validation.operationCount} operations</span>
          <span>~{Math.round(validation.estimatedTime / 60)} min</span>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {errors.slice(0, 3).map((issue, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 12,
                color: '#ef4444',
              }}
            >
              {issue.message}
            </div>
          ))}
          {errors.length > 3 && (
            <div style={{ fontSize: 11, color: '#888' }}>
              +{errors.length - 3} more errors
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && validation.canGenerate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {warnings.slice(0, 2).map((issue, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 12,
                color: '#f59e0b',
              }}
            >
              {issue.message}
            </div>
          ))}
          {warnings.length > 2 && (
            <div style={{ fontSize: 11, color: '#888' }}>
              +{warnings.length - 2} more warnings
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GenerationOptionsProps {
  includeComments: boolean;
  lineNumbers: boolean;
  onIncludeCommentsChange: (value: boolean) => void;
  onLineNumbersChange: (value: boolean) => void;
  disabled: boolean;
}

function GenerationOptions({
  includeComments,
  lineNumbers,
  onIncludeCommentsChange,
  onLineNumbersChange,
  disabled,
}: GenerationOptionsProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: 12,
        backgroundColor: '#2a2a4a',
        borderRadius: 8,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#ccc',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={includeComments}
          onChange={(e) => onIncludeCommentsChange(e.target.checked)}
          disabled={disabled}
          style={{ accentColor: '#8b5cf6' }}
        />
        Include comments
      </label>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#ccc',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={lineNumbers}
          onChange={(e) => onLineNumbersChange(e.target.checked)}
          disabled={disabled}
          style={{ accentColor: '#8b5cf6' }}
        />
        Line numbers
      </label>
    </div>
  );
}

interface GenerationResultProps {
  bundle: GcodeBundle;
  packet: FactoryPacket | null;
  jobId: string;
  machineId: string;
  includeComments: boolean;
  lineNumbers: boolean;
  onPreview: () => void;
  onDownload: () => void;
}

function GenerationResult({
  bundle,
  packet,
  jobId,
  machineId,
  includeComments,
  lineNumbers,
  onPreview,
  onDownload,
}: GenerationResultProps): React.ReactElement {
  const [bundleStatus, setBundleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [bundleError, setBundleError] = useState<string | null>(null);

  const file = bundle.files[0];
  const filename = file?.path.split('/').pop() || 'program.nc';
  const sizeKb = file ? Math.round(file.bytes.length / 1024) : 0;

  // Handle download bundle ZIP
  const handleDownloadBundle = useCallback(async () => {
    if (!packet) return;

    setBundleStatus('loading');
    setBundleError(null);

    const result = await generateAndDownloadCncBundle(packet, {
      jobId,
      machineId,
      includeComments,
      lineNumbers,
    });

    if (result.ok) {
      setBundleStatus('idle');
    } else {
      setBundleStatus('error');
      setBundleError(result.message);
    }
  }, [packet, jobId, machineId, includeComments, lineNumbers]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        backgroundColor: '#22c55e15',
        border: '1px solid #22c55e',
        borderRadius: 8,
      }}
    >
      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
            G-code Generated
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {filename} ({sizeKb} KB)
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {bundle.stats.lineCount} lines, {bundle.stats.toolChanges} tool changes
        </div>
      </div>

      {/* Hash display */}
      <div
        style={{
          padding: 8,
          backgroundColor: '#0a0a15',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#888',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        SHA-256: {file?.sha256.slice(0, 32)}...
      </div>

      {/* Warnings */}
      {bundle.warnings.length > 0 && (
        <div
          style={{
            padding: 8,
            backgroundColor: '#f59e0b10',
            borderRadius: 4,
            fontSize: 12,
            color: '#f59e0b',
          }}
        >
          {bundle.warnings.length} warning(s) during generation
        </div>
      )}

      {/* Bundle error */}
      {bundleError && (
        <div
          style={{
            padding: 8,
            backgroundColor: '#ef444410',
            borderRadius: 4,
            fontSize: 12,
            color: '#ef4444',
          }}
        >
          Bundle error: {bundleError}
        </div>
      )}

      {/* Actions - Row 1: Preview + Download NC */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onPreview}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: '#2a2a4a',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Preview
        </button>
        <button
          onClick={onDownload}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: '#22c55e',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Download .nc
        </button>
      </div>

      {/* Actions - Row 2: Download Bundle ZIP */}
      <button
        onClick={handleDownloadBundle}
        disabled={bundleStatus === 'loading'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          backgroundColor: bundleStatus === 'loading' ? '#3a3a5a' : '#8b5cf6',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: bundleStatus === 'loading' ? 'not-allowed' : 'pointer',
        }}
      >
        {bundleStatus === 'loading' ? (
          'Creating Bundle...'
        ) : (
          <>Download CNC Bundle ZIP</>
        )}
      </button>

      {/* Bundle info tooltip */}
      <div
        style={{
          fontSize: 11,
          color: '#666',
          textAlign: 'center',
        }}
      >
        Bundle includes manifest, checksums, and operation graph for factory verification
      </div>
    </div>
  );
}

export default CncGeneratePanel;
