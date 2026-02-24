/**
 * GcodePreviewPanel - G-code Preview Modal/Panel
 *
 * Displays generated G-code with syntax highlighting, line numbers,
 * and search functionality. Supports copy and download.
 *
 * @version 1.0.0 - Phase D2.2
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { GcodeBundle } from '../../../cnc/post/types';
import { extractGcodeText } from '../../../cnc/buildGcodeBundle';

// ============================================================================
// Types
// ============================================================================

export interface GcodePreviewPanelProps {
  /** G-code bundle to preview */
  bundle: GcodeBundle | null;
  /** Whether the panel is visible */
  visible: boolean;
  /** Callback when panel is closed */
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function GcodePreviewPanel({
  bundle,
  visible,
  onClose,
}: GcodePreviewPanelProps): React.ReactElement | null {
  // State
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [copied, setCopied] = useState(false);

  const codeRef = useRef<HTMLPreElement>(null);

  // Extract G-code text from bundle
  const gcodeText = useMemo(() => {
    if (!bundle) return '';
    return extractGcodeText(bundle) || '';
  }, [bundle]);

  // Split into lines
  const lines = useMemo(() => gcodeText.split('\n'), [gcodeText]);

  // Search matches
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const result: number[] = [];
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(query)) {
        result.push(idx);
      }
    });
    return result;
  }, [lines, searchQuery]);

  // Reset current match when search changes
  useEffect(() => {
    setCurrentMatch(0);
  }, [searchQuery]);

  // Scroll to current match
  useEffect(() => {
    if (matches.length > 0 && codeRef.current) {
      const lineNumber = matches[currentMatch];
      const lineElement = codeRef.current.querySelector(`[data-line="${lineNumber}"]`);
      lineElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatch, matches]);

  // Handle copy
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gcodeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  }, [gcodeText]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!bundle || bundle.files.length === 0) return;

    const file = bundle.files[0];
    const blob = new Blob([new Uint8Array(file.bytes)], { type: 'text/plain' });
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

  // Navigate matches
  const goToPrevMatch = useCallback(() => {
    setCurrentMatch((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
  }, [matches.length]);

  const goToNextMatch = useCallback(() => {
    setCurrentMatch((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
  }, [matches.length]);

  // Don't render if not visible
  if (!visible || !bundle) return null;

  const file = bundle.files[0];
  const filename = file?.path.split('/').pop() || 'program.nc';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 1000,
          height: '85vh',
          backgroundColor: '#0a0a15',
          borderRadius: 12,
          border: '1px solid #3a3a5a',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #3a3a5a',
            backgroundColor: '#1a1a2e',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
              {filename}
            </span>
            <span style={{ fontSize: 12, color: '#888' }}>
              {lines.length} lines | {Math.round(gcodeText.length / 1024)} KB
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #3a3a5a',
              borderRadius: 6,
              color: '#888',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderBottom: '1px solid #3a3a5a',
            backgroundColor: '#1a1a2e',
          }}
        >
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 10px',
                backgroundColor: '#0a0a15',
                border: '1px solid #3a3a5a',
                borderRadius: 4,
                color: '#fff',
                fontSize: 13,
                width: 200,
              }}
            />
            {matches.length > 0 && (
              <>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {currentMatch + 1} / {matches.length}
                </span>
                <button
                  onClick={goToPrevMatch}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#2a2a4a',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  &uarr;
                </button>
                <button
                  onClick={goToNextMatch}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#2a2a4a',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  &darr;
                </button>
              </>
            )}
          </div>

          {/* Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#888',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showLineNumbers}
                onChange={(e) => setShowLineNumbers(e.target.checked)}
                style={{ accentColor: '#8b5cf6' }}
              />
              Line numbers
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#888',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={wordWrap}
                onChange={(e) => setWordWrap(e.target.checked)}
                style={{ accentColor: '#8b5cf6' }}
              />
              Wrap
            </label>
            <button
              onClick={handleCopy}
              style={{
                padding: '6px 12px',
                backgroundColor: copied ? '#22c55e' : '#2a2a4a',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              style={{
                padding: '6px 12px',
                backgroundColor: '#8b5cf6',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Download
            </button>
          </div>
        </div>

        {/* Code view */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#0d0d18',
          }}
        >
          <pre
            ref={codeRef}
            style={{
              margin: 0,
              padding: 16,
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            }}
          >
            {lines.map((line, idx) => {
              const isMatch = matches.includes(idx);
              const isCurrentMatch = matches[currentMatch] === idx;

              return (
                <div
                  key={idx}
                  data-line={idx}
                  style={{
                    display: 'flex',
                    backgroundColor: isCurrentMatch
                      ? '#f59e0b30'
                      : isMatch
                      ? '#8b5cf610'
                      : 'transparent',
                    borderLeft: isCurrentMatch
                      ? '3px solid #f59e0b'
                      : 'none',
                    paddingLeft: isCurrentMatch ? 0 : 3,
                  }}
                >
                  {showLineNumbers && (
                    <span
                      style={{
                        width: 50,
                        flexShrink: 0,
                        paddingRight: 12,
                        textAlign: 'right',
                        color: '#4a4a6a',
                        userSelect: 'none',
                      }}
                    >
                      {idx + 1}
                    </span>
                  )}
                  <GcodeLine line={line} />
                </div>
              );
            })}
          </pre>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderTop: '1px solid #3a3a5a',
            backgroundColor: '#1a1a2e',
            fontSize: 11,
            color: '#888',
          }}
        >
          <div>
            Machine: {bundle.machineId} | Generated:{' '}
            {new Date(bundle.createdAt).toLocaleString()}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10 }}>
            SHA-256: {file?.sha256.slice(0, 24)}...
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// G-code Syntax Highlighting
// ============================================================================

interface GcodeLineProps {
  line: string;
}

function GcodeLine({ line }: GcodeLineProps): React.ReactElement {
  // Simple syntax highlighting for G-code
  const highlighted = useMemo(() => {
    // Comments (lines starting with ; or text in parentheses)
    if (line.trim().startsWith(';') || line.trim().startsWith('(')) {
      return <span style={{ color: '#6b7280' }}>{line}</span>;
    }

    // Highlight different parts
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    // Simple token-based highlighting
    const patterns: Array<{ regex: RegExp; color: string }> = [
      { regex: /^%/, color: '#8b5cf6' }, // Program delimiters
      { regex: /O\d+/, color: '#8b5cf6' }, // Program number
      { regex: /N\d+/, color: '#4a4a6a' }, // Line numbers
      { regex: /G\d+\.?\d*/, color: '#22c55e' }, // G-codes
      { regex: /M\d+/, color: '#f59e0b' }, // M-codes
      { regex: /T\d+/, color: '#ef4444' }, // Tool calls
      { regex: /S\d+/, color: '#06b6d4' }, // Spindle speed
      { regex: /F\d+\.?\d*/, color: '#f472b6' }, // Feed rate
      { regex: /[XYZRABCUVW]-?\d+\.?\d*/, color: '#60a5fa' }, // Coordinates
      { regex: /\([^)]*\)/, color: '#6b7280' }, // Comments in parens
    ];

    while (remaining.length > 0) {
      let matched = false;

      for (const { regex, color } of patterns) {
        const match = remaining.match(regex);
        if (match && match.index === 0) {
          parts.push(
            <span key={key++} style={{ color }}>
              {match[0]}
            </span>
          );
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // No pattern matched, take one character
        parts.push(
          <span key={key++} style={{ color: '#e5e5e5' }}>
            {remaining[0]}
          </span>
        );
        remaining = remaining.slice(1);
      }
    }

    return <>{parts}</>;
  }, [line]);

  return <span style={{ color: '#e5e5e5' }}>{highlighted}</span>;
}

export default GcodePreviewPanel;
