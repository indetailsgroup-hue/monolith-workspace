/**
 * ExportViewerPanel.tsx - Export Viewer UI Component
 *
 * Displays export artifacts with:
 * - Export metadata (ID, kind, timestamp)
 * - File list with download buttons
 * - Bundle verification
 * - Download all functionality
 */

import React, { useEffect } from 'react';
import type { ExportViewerState } from './exportViewerStore';

// ============================================
// TYPES
// ============================================

interface ExportViewerPanelProps {
  /** Store hook from createExportViewerStore */
  useStore: () => ExportViewerState;
}

// ============================================
// STYLES
// ============================================

const styles = {
  container: {
    padding: 16,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'baseline',
    flexWrap: 'wrap' as const,
  },
  title: {
    fontWeight: 900,
    fontSize: 18,
  },
  subtitle: {
    opacity: 0.8,
    marginTop: 4,
  },
  hashLine: {
    opacity: 0.75,
    marginTop: 2,
    fontSize: 12,
  },
  mono: {
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  button: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  buttonPrimary: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderColor: 'rgba(34,197,94,0.4)',
  },
  messageBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)',
    fontSize: 13,
  },
  errorBox: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  successBox: {
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  divider: {
    margin: '12px 0',
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  filesTitle: {
    fontWeight: 900,
    marginBottom: 8,
  },
  filesGrid: {
    display: 'grid',
    gap: 8,
  },
  fileCard: {
    padding: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  fileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'baseline',
  },
  fileName: {
    fontWeight: 700,
    fontSize: 13,
  },
  fileMeta: {
    opacity: 0.8,
    marginTop: 6,
    fontSize: 11,
  },
  fileHash: {
    opacity: 0.75,
    marginTop: 4,
    fontSize: 11,
  },
  noExport: {
    opacity: 0.8,
    fontStyle: 'italic',
  },
} as const;

// ============================================
// COMPONENT
// ============================================

export function ExportViewerPanel(props: ExportViewerPanelProps) {
  const st = props.useStore();

  // Load latest export on mount
  useEffect(() => {
    st.loadLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exp = st.exportRec;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Export Viewer</div>
          <div style={styles.subtitle}>
            {exp ? (
              <>
                Latest: <b>{exp.exportId}</b> | Kind: <b>{exp.kind}</b> | At:{' '}
                {exp.createdIso}
              </>
            ) : (
              <>No export loaded</>
            )}
          </div>
          <div style={styles.hashLine}>
            Head:{' '}
            <span style={styles.mono}>
              {(st.headHash ?? '').slice(0, 16)}...
            </span>
            {exp?.proof?.bundleHashHex && (
              <>
                {' '}
                | BundleHash:{' '}
                <span style={styles.mono}>
                  {String(exp.proof.bundleHashHex).slice(0, 16)}...
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={{
              ...styles.button,
              ...(st.loading ? styles.buttonDisabled : {}),
            }}
            disabled={st.loading}
            onClick={() => st.loadLatest()}
          >
            Refresh
          </button>
          <button
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              ...(st.loading || !exp ? styles.buttonDisabled : {}),
            }}
            disabled={st.loading || !exp}
            onClick={() => st.downloadAllSequential()}
          >
            Download All
          </button>
          <button
            style={{
              ...styles.button,
              ...(st.verify.running || !exp ? styles.buttonDisabled : {}),
            }}
            disabled={st.verify.running || !exp}
            onClick={() => st.verifyBundle()}
          >
            {st.verify.running ? 'Verifying...' : 'Verify Bundle'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {st.error && (
        <div style={{ ...styles.messageBox, ...styles.errorBox }}>
          Error: {st.error}
        </div>
      )}

      {/* Verification Result */}
      {st.verify.result && (
        <div
          style={{
            ...styles.messageBox,
            ...(st.verify.result.ok ? styles.successBox : styles.errorBox),
          }}
        >
          Verify: {st.verify.result.ok ? 'OK' : 'FAILED'} -{' '}
          {st.verify.result.message}
        </div>
      )}

      <hr style={styles.divider} />

      {/* Files List */}
      {!exp ? (
        <div style={styles.noExport}>No export record found on this job.</div>
      ) : (
        <>
          <div style={styles.filesTitle}>
            Files ({exp.artifacts?.length ?? 0})
          </div>
          <div style={styles.filesGrid}>
            {(exp.artifacts ?? [])
              .slice()
              .sort((a, b) => (a.path > b.path ? 1 : -1))
              .map((a) => (
                <div key={a.artifactId} style={styles.fileCard}>
                  <div style={styles.fileHeader}>
                    <div style={styles.fileName}>{a.path}</div>
                    <button
                      style={{
                        ...styles.button,
                        ...(st.loading ? styles.buttonDisabled : {}),
                      }}
                      disabled={st.loading}
                      onClick={() =>
                        st.downloadOne(a.artifactId, a.path.split('/').pop())
                      }
                    >
                      Download
                    </button>
                  </div>

                  <div style={styles.fileMeta}>
                    ArtifactId:{' '}
                    <span style={styles.mono}>{a.artifactId}</span> | Bytes:{' '}
                    {a.bytes} | MIME: {a.mime}
                  </div>
                  <div style={styles.fileHash}>
                    SHA256:{' '}
                    <span style={styles.mono}>
                      {String(a.sha256Hex).slice(0, 24)}...
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
