/**
 * Export Configurator - Machine dialect and profile selection
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

import React, { useState, useEffect } from "react";
import type {
  ExportOptionsResponse,
  ExportDialect,
  ExportProfileId,
  ExportMode,
  ExportTarget,
  ExportRequest,
} from "./exportTypes";

// ============================================================================
// Types
// ============================================================================

interface ExportConfiguratorProps {
  /** Available export options from API */
  options: ExportOptionsResponse | null;
  /** Loading state for options */
  optionsLoading?: boolean;
  /** Whether export is allowed (verify PASS) */
  exportAllowed: boolean;
  /** Callback when configuration changes */
  onConfigChange?: (config: ExportRequest) => void;
  /** Initial configuration */
  initialConfig?: Partial<ExportRequest>;
}

// ============================================================================
// Component
// ============================================================================

export function ExportConfigurator({
  options,
  optionsLoading = false,
  exportAllowed,
  onConfigChange,
  initialConfig,
}: ExportConfiguratorProps) {
  // State
  const [selectedDialect, setSelectedDialect] = useState<ExportDialect>(
    initialConfig?.dialect || "KDT"
  );
  const [selectedProfileId, setSelectedProfileId] = useState<ExportProfileId>(
    initialConfig?.profileId || "kdt_mvp_v1"
  );
  const [selectedMode, setSelectedMode] = useState<ExportMode>(
    initialConfig?.mode || "PER_JOB"
  );
  const [selectedTarget, setSelectedTarget] = useState<ExportTarget>(
    initialConfig?.target || "BUNDLE"
  );
  const [includeManifest, setIncludeManifest] = useState(true);
  const [includePacket, setIncludePacket] = useState(false);

  // Get available profiles for selected dialect
  const dialectData = options?.dialects.find((d) => d.id === selectedDialect);
  const availableProfiles = dialectData?.profiles.filter((p) => p.enabled) || [];

  // Update profile when dialect changes
  useEffect(() => {
    if (availableProfiles.length > 0) {
      const currentProfileValid = availableProfiles.some(
        (p) => p.id === selectedProfileId
      );
      if (!currentProfileValid) {
        setSelectedProfileId(availableProfiles[0].id);
      }
    }
  }, [selectedDialect, availableProfiles, selectedProfileId]);

  // Notify parent of config changes
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({
        dialect: selectedDialect,
        profileId: selectedProfileId,
        mode: selectedMode,
        target: selectedTarget,
        include: {
          manifest: includeManifest,
          packet: includePacket,
        },
      });
    }
  }, [
    selectedDialect,
    selectedProfileId,
    selectedMode,
    selectedTarget,
    includeManifest,
    includePacket,
    onConfigChange,
  ]);

  // Loading state
  if (optionsLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading export options...</div>
      </div>
    );
  }

  // No options available
  if (!options) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Failed to load export options</div>
      </div>
    );
  }

  const isDisabled = !exportAllowed;

  return (
    <div style={styles.container}>
      {/* Machine Dialect Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Machine Dialect</div>
        <div style={styles.dialectGrid}>
          {options.dialects.map((dialect) => (
            <button
              key={dialect.id}
              style={{
                ...styles.dialectCard,
                ...(selectedDialect === dialect.id
                  ? styles.dialectCardSelected
                  : {}),
                ...(isDisabled ? styles.dialectCardDisabled : {}),
              }}
              onClick={() => !isDisabled && setSelectedDialect(dialect.id)}
              disabled={isDisabled}
            >
              <div style={styles.dialectIcon}>
                <MachineIcon dialect={dialect.id} />
              </div>
              <div style={styles.dialectName}>{dialect.name}</div>
              <div style={styles.dialectProfiles}>
                {dialect.profiles.filter((p) => p.enabled).length} profiles
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Profile Selection */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Machine Profile</div>
        <select
          style={{
            ...styles.select,
            ...(isDisabled ? styles.selectDisabled : {}),
          }}
          value={selectedProfileId}
          onChange={(e) =>
            setSelectedProfileId(e.target.value as ExportProfileId)
          }
          disabled={isDisabled}
        >
          {availableProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
              {profile.description ? ` - ${profile.description}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Export Mode */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Export Mode</div>
        <div style={styles.modeGrid}>
          {options.modes.map((mode) => (
            <button
              key={mode.id}
              style={{
                ...styles.modeButton,
                ...(selectedMode === mode.id ? styles.modeButtonSelected : {}),
                ...(isDisabled ? styles.modeButtonDisabled : {}),
              }}
              onClick={() => !isDisabled && setSelectedMode(mode.id)}
              disabled={isDisabled}
            >
              <div style={styles.modeName}>{mode.name}</div>
              <div style={styles.modeDescription}>{mode.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Output Target */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Output Format</div>
        <div style={styles.targetGrid}>
          {options.targets
            .filter((t) => t.enabled)
            .map((target) => (
              <button
                key={target.id}
                style={{
                  ...styles.targetButton,
                  ...(selectedTarget === target.id
                    ? styles.targetButtonSelected
                    : {}),
                  ...(isDisabled ? styles.targetButtonDisabled : {}),
                }}
                onClick={() => !isDisabled && setSelectedTarget(target.id)}
                disabled={isDisabled}
              >
                <TargetIcon target={target.id} />
                <span>{target.name}</span>
              </button>
            ))}
        </div>
      </div>

      {/* Include Options */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Include in Bundle</div>
        <div style={styles.checkboxGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeManifest}
              onChange={(e) => setIncludeManifest(e.target.checked)}
              disabled={isDisabled}
              style={styles.checkbox}
            />
            <span>Signed Manifest</span>
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includePacket}
              onChange={(e) => setIncludePacket(e.target.checked)}
              disabled={isDisabled}
              style={styles.checkbox}
            />
            <span>Packet JSON</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function MachineIcon({ dialect }: { dialect: ExportDialect }) {
  // Simple machine icons for each dialect
  const color =
    dialect === "KDT"
      ? "#22c55e"
      : dialect === "BIESSE"
      ? "#3b82f6"
      : "#f59e0b";

  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="14" />
      <line x1="10" y1="10" x2="10" y2="14" />
      <line x1="14" y1="10" x2="14" y2="14" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function TargetIcon({ target }: { target: ExportTarget }) {
  switch (target) {
    case "GCODE":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline
            points="14 2 14 8 20 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "DXF":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line
            x1="8"
            y1="8"
            x2="16"
            y2="16"
            stroke="white"
            strokeWidth="2"
          />
        </svg>
      );
    case "BUNDLE":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M12 10v6" stroke="white" strokeWidth="2" />
          <path d="M9 13h6" stroke="white" strokeWidth="2" />
        </svg>
      );
    case "MANIFEST":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    default:
      return null;
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  loading: {
    padding: "40px",
    textAlign: "center",
    color: "#9ca3af",
    fontSize: "14px",
  },
  error: {
    padding: "40px",
    textAlign: "center",
    color: "#ef4444",
    fontSize: "14px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  dialectGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
  },
  dialectCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "16px",
    background: "#1f2937",
    border: "2px solid #374151",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  dialectCardSelected: {
    borderColor: "#8b5cf6",
    background: "rgba(139, 92, 246, 0.1)",
  },
  dialectCardDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  dialectIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dialectName: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#f3f4f6",
  },
  dialectProfiles: {
    fontSize: "11px",
    color: "#9ca3af",
  },
  select: {
    padding: "10px 12px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "6px",
    color: "#f3f4f6",
    fontSize: "14px",
    cursor: "pointer",
    width: "100%",
  },
  selectDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },
  modeButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "4px",
    padding: "12px 16px",
    background: "#1f2937",
    border: "2px solid #374151",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textAlign: "left",
  },
  modeButtonSelected: {
    borderColor: "#8b5cf6",
    background: "rgba(139, 92, 246, 0.1)",
  },
  modeButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  modeName: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#f3f4f6",
  },
  modeDescription: {
    fontSize: "11px",
    color: "#9ca3af",
  },
  targetGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  targetButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    background: "#1f2937",
    border: "2px solid #374151",
    borderRadius: "6px",
    color: "#d1d5db",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  targetButtonSelected: {
    borderColor: "#8b5cf6",
    background: "rgba(139, 92, 246, 0.1)",
    color: "#a78bfa",
  },
  targetButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  checkboxGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#d1d5db",
    fontSize: "13px",
    cursor: "pointer",
  },
  checkbox: {
    width: "16px",
    height: "16px",
    accentColor: "#8b5cf6",
  },
};

export default ExportConfigurator;
