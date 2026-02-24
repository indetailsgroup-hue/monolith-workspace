/**
 * MachineSelector - CNC Machine Profile Selector
 * P1.1 Factory Ops UX
 *
 * Only enabled after verification passes.
 * Shows machine-specific info (tool count, runtime estimate).
 *
 * @version 0.11.0
 */

import React from "react";
import type { MachineType, JobDetailData } from "../types/job";

export interface MachineSelectorProps {
  job: JobDetailData;
  selectedMachine: MachineType | null;
  onSelect: (machine: MachineType) => void;
  disabled?: boolean;
}

const machineInfo: Record<
  MachineType,
  { name: string; icon: string; color: string }
> = {
  KDT: {
    name: "KDT",
    icon: "🔧",
    color: "#3b82f6", // blue
  },
  BIESSE: {
    name: "Biesse",
    icon: "🔩",
    color: "#8b5cf6", // purple
  },
  HOMAG: {
    name: "Homag",
    icon: "⚙️",
    color: "#22c55e", // green
  },
};

export function MachineSelector({
  job,
  selectedMachine,
  onSelect,
  disabled = false,
}: MachineSelectorProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {/* Header */}
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "#fff",
        }}
      >
        🏭 Select Machine
      </h3>

      {/* Disabled Warning */}
      {disabled && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#f59e0b20",
            border: "1px solid #f59e0b40",
            borderRadius: 6,
            fontSize: 12,
            color: "#f59e0b",
          }}
        >
          ⚠️ ต้อง Verify ก่อนเลือกเครื่อง
        </div>
      )}

      {/* Machine Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {job.machineSupport.map((machine) => (
          <MachineCard
            key={machine}
            machine={machine}
            toolCount={job.toolCount[machine]}
            runtime={job.estimatedRuntime[machine]}
            selected={selectedMachine === machine}
            onSelect={() => onSelect(machine)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Not Supported Warning */}
      {job.machineSupport.length === 0 && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#ef444420",
            border: "1px solid #ef444440",
            borderRadius: 8,
            fontSize: 13,
            color: "#ef4444",
            textAlign: "center",
          }}
        >
          ⚠️ Job นี้ไม่รองรับเครื่องในโรงงาน
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Machine Card
// ============================================================================

interface MachineCardProps {
  machine: MachineType;
  toolCount: number;
  runtime: number;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function MachineCard({
  machine,
  toolCount,
  runtime,
  selected,
  onSelect,
  disabled,
}: MachineCardProps): React.ReactElement {
  const info = machineInfo[machine];

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 16,
        backgroundColor: selected ? `${info.color}20` : "#0a0a15",
        border: `2px solid ${selected ? info.color : "#3a3a5a"}`,
        borderRadius: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 28 }}>{info.icon}</span>

      {/* Name */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: selected ? info.color : "#fff",
        }}
      >
        {info.name}
      </span>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          fontSize: 11,
          color: "#888",
        }}
      >
        <span>Tools: {toolCount}</span>
        <span>~{Math.round(runtime)} min</span>
      </div>

      {/* Selected indicator */}
      {selected && (
        <span
          style={{
            fontSize: 16,
            color: info.color,
          }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

export default MachineSelector;
