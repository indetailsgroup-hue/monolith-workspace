/**
 * PacketIngestPanel - Drop zone UI for Factory Packet ingestion
 *
 * Features:
 * - Drag & drop ZIP upload
 * - File picker fallback
 * - Automatic verification on drop
 * - Verification result display
 *
 * @version 1.0.0 - Phase C: Factory Ingest & Verify
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileCheck, AlertTriangle, CheckCircle, XCircle, Loader2, File } from 'lucide-react';
import {
  verifyPacketFromFile,
  formatVerifyResult,
  type VerifyPacketResult,
} from '../packet/verifyPacket';
import { isValidZip } from '../packet/unzipPacket';
import { useFactoryStore } from '../state/factoryStore';

// ============================================
// TYPES
// ============================================

export interface PacketIngestPanelProps {
  /** Job ID to attach the verified packet to (optional) */
  jobId?: string;
  /** Callback when packet is verified */
  onVerified?: (result: VerifyPacketResult) => void;
  /** Callback when verification fails */
  onError?: (error: string) => void;
  /** Allow failed gate packets */
  allowFailedGate?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether to persist to store (default: true if jobId provided) */
  persistToStore?: boolean;
}

type IngestState = 'idle' | 'dragging' | 'verifying' | 'verified' | 'error';

// ============================================
// STYLES
// ============================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const dropZoneStyle = (state: IngestState): React.CSSProperties => ({
  border: `2px dashed ${
    state === 'dragging'
      ? '#8b5cf6'
      : state === 'error'
        ? '#ef4444'
        : state === 'verified'
          ? '#22c55e'
          : '#3a3a5a'
  }`,
  borderRadius: 12,
  padding: state === 'verifying' ? 32 : 40,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  cursor: state === 'verifying' ? 'wait' : 'pointer',
  transition: 'all 0.2s',
  background:
    state === 'dragging'
      ? 'rgba(139,92,246,0.1)'
      : state === 'error'
        ? 'rgba(239,68,68,0.05)'
        : state === 'verified'
          ? 'rgba(34,197,94,0.05)'
          : 'rgba(255,255,255,0.02)',
});

const iconContainerStyle = (state: IngestState): React.CSSProperties => ({
  width: 64,
  height: 64,
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background:
    state === 'verified'
      ? 'rgba(34,197,94,0.1)'
      : state === 'error'
        ? 'rgba(239,68,68,0.1)'
        : 'rgba(139,92,246,0.1)',
});

const resultCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 8,
  padding: 16,
  border: '1px solid rgba(255,255,255,0.1)',
};

const checkRowStyle = (status: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  color:
    status === 'PASS'
      ? '#22c55e'
      : status === 'FAIL'
        ? '#ef4444'
        : status === 'WARN'
          ? '#f59e0b'
          : 'rgba(255,255,255,0.5)',
});

// ============================================
// COMPONENT
// ============================================

export function PacketIngestPanel({
  jobId,
  onVerified,
  onError,
  allowFailedGate = false,
  compact = false,
  className = '',
  persistToStore,
}: PacketIngestPanelProps) {
  const [state, setState] = useState<IngestState>('idle');
  const [result, setResult] = useState<VerifyPacketResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store integration (D0)
  const setVerifiedPacket = useFactoryStore((s) => s.setVerifiedPacket);
  const shouldPersist = persistToStore ?? !!jobId;

  // Handle file selection
  const handleFile = useCallback(
    async (file: File) => {
      // Validate file type
      if (!file.name.endsWith('.zip')) {
        setErrorMessage('Please upload a .zip file');
        setState('error');
        onError?.('Invalid file type');
        return;
      }

      setFileName(file.name);
      setFileSize(file.size);
      setState('verifying');
      setErrorMessage(null);

      try {
        // Quick check if it's a valid ZIP
        const buffer = await file.arrayBuffer();
        if (!isValidZip(buffer)) {
          setErrorMessage('Invalid ZIP file format');
          setState('error');
          onError?.('Invalid ZIP format');
          return;
        }

        // Verify the packet
        const verifyResult = await verifyPacketFromFile(file, {
          allowFailedGate,
        });

        setResult(verifyResult);
        setState(verifyResult.valid ? 'verified' : 'error');

        // Persist to store if enabled (D0)
        if (shouldPersist && jobId) {
          setVerifiedPacket(
            jobId,
            file.name,
            verifyResult,
            verifyResult.packet || null,
            file.size
          );
        }

        if (verifyResult.valid) {
          onVerified?.(verifyResult);
        } else {
          const errors = verifyResult.checks
            .filter((c) => c.status === 'FAIL')
            .map((c) => c.message);
          setErrorMessage(errors.join('; '));
          onError?.(errors.join('; '));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setErrorMessage(message);
        setState('error');
        onError?.(message);
      }
    },
    [allowFailedGate, onVerified, onError, shouldPersist, jobId, setVerifiedPacket]
  );

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState('dragging');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState('idle');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      } else {
        setState('idle');
      }
    },
    [handleFile]
  );

  // Click to browse
  const handleClick = useCallback(() => {
    if (state !== 'verifying') {
      fileInputRef.current?.click();
    }
  }, [state]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // Reset
  const handleReset = useCallback(() => {
    setState('idle');
    setResult(null);
    setFileName(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Render check icon
  const renderCheckIcon = (status: string) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle size={16} />;
      case 'FAIL':
        return <XCircle size={16} />;
      case 'WARN':
        return <AlertTriangle size={16} />;
      default:
        return <File size={16} />;
    }
  };

  return (
    <div style={containerStyle} className={className}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* Drop Zone */}
      <div
        style={dropZoneStyle(state)}
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Icon */}
        <div style={iconContainerStyle(state)}>
          {state === 'verifying' ? (
            <Loader2 size={32} className="animate-spin" style={{ color: '#8b5cf6' }} />
          ) : state === 'verified' ? (
            <FileCheck size={32} style={{ color: '#22c55e' }} />
          ) : state === 'error' ? (
            <AlertTriangle size={32} style={{ color: '#ef4444' }} />
          ) : (
            <Upload size={32} style={{ color: '#8b5cf6' }} />
          )}
        </div>

        {/* Text */}
        <div style={{ textAlign: 'center' }}>
          {state === 'idle' && (
            <>
              <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>
                Drop Factory Packet here
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                or click to browse (.zip)
              </div>
            </>
          )}
          {state === 'dragging' && (
            <div style={{ color: '#8b5cf6', fontWeight: 500 }}>Drop to verify</div>
          )}
          {state === 'verifying' && (
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>
              Verifying {fileName}...
            </div>
          )}
          {state === 'verified' && (
            <>
              <div style={{ color: '#22c55e', fontWeight: 500, marginBottom: 4 }}>
                Packet Verified
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                {fileName}
              </div>
            </>
          )}
          {state === 'error' && (
            <>
              <div style={{ color: '#ef4444', fontWeight: 500, marginBottom: 4 }}>
                Verification Failed
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 13,
                  maxWidth: 300,
                }}
              >
                {errorMessage || 'Unknown error'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Verification Result */}
      {result && !compact && (
        <div style={resultCardStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 500, color: '#fff' }}>Verification Checks</div>
            <button
              onClick={handleReset}
              style={{
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>

          {/* Check List */}
          <div>
            {result.checks.map((check) => (
              <div key={check.id} style={checkRowStyle(check.status)}>
                {renderCheckIcon(check.status)}
                <span style={{ flex: 1, fontSize: 13 }}>{check.name}</span>
                <span
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={check.message}
                >
                  {check.message}
                </span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              gap: 16,
              fontSize: 12,
            }}
          >
            <span style={{ color: '#22c55e' }}>
              {result.summary.passed} passed
            </span>
            <span style={{ color: '#ef4444' }}>
              {result.summary.failed} failed
            </span>
            <span style={{ color: '#f59e0b' }}>
              {result.summary.warned} warned
            </span>
          </div>

          {/* Packet Info (if verified) */}
          {result.packet && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              <div>Job: {result.packet.manifest.jobId}</div>
              <div>Version: {result.packet.manifest.version}</div>
              <div>Files: {result.packet.manifest.files.length}</div>
              <div>
                Cut List Parts: {result.packet.cutList?.summary?.totalParts || 0}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PacketIngestPanel;
