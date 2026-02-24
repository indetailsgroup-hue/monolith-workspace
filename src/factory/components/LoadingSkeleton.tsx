/**
 * LoadingSkeleton - Animated skeleton loading components
 * PR-P1.1-C.1 Factory Dashboard Integration
 *
 * Provides skeleton placeholders for various content types.
 *
 * @version 0.12.0
 */

import React from "react";

// ============================================================================
// Base Skeleton
// ============================================================================

export interface SkeletonProps {
  /** Width of the skeleton */
  width?: number | string;
  /** Height of the skeleton */
  height?: number | string;
  /** Border radius */
  borderRadius?: number;
  /** Custom style overrides */
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonProps): React.ReactElement {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "#3a3a5a",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    >
      <style>
        {`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
          }
        `}
      </style>
    </div>
  );
}

// ============================================================================
// Text Skeleton
// ============================================================================

export interface TextSkeletonProps {
  /** Number of lines */
  lines?: number;
  /** Width of the last line (percentage) */
  lastLineWidth?: number;
  /** Line height */
  lineHeight?: number;
  /** Gap between lines */
  gap?: number;
}

export function TextSkeleton({
  lines = 3,
  lastLineWidth = 60,
  lineHeight = 16,
  gap = 8,
}: TextSkeletonProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? `${lastLineWidth}%` : "100%"}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Job Card Skeleton
// ============================================================================

export function JobCardSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: 16,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
      }}
    >
      {/* Job Info */}
      <div style={{ flex: 1 }}>
        {/* Title Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Skeleton width={120} height={20} />
          <Skeleton width={80} height={24} borderRadius={12} />
          <Skeleton width={60} height={20} borderRadius={10} />
        </div>

        {/* Details Row */}
        <div style={{ display: "flex", gap: 16 }}>
          <Skeleton width={100} height={14} />
          <Skeleton width={80} height={14} />
          <Skeleton width={70} height={14} />
          <Skeleton width={60} height={14} />
        </div>
      </div>

      {/* Updated */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Skeleton width={50} height={12} />
        <Skeleton width={40} height={12} />
      </div>

      {/* Action */}
      <Skeleton width={90} height={36} borderRadius={8} />
    </div>
  );
}

// ============================================================================
// Job List Skeleton
// ============================================================================

export interface JobListSkeletonProps {
  /** Number of job cards to show */
  count?: number;
}

export function JobListSkeleton({ count = 5 }: JobListSkeletonProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ============================================================================
// Dashboard Header Skeleton
// ============================================================================

export function DashboardHeaderSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        borderBottom: "1px solid #3a3a5a",
        backgroundColor: "#1a1a2e",
      }}
    >
      {/* Title Row */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Skeleton width={200} height={28} />
        <Skeleton width={100} height={36} borderRadius={8} />
      </div>

      {/* Filters Row */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width={80} height={32} borderRadius={6} />
          ))}
        </div>
        <Skeleton width={300} height={40} borderRadius={8} />
      </div>
    </div>
  );
}

// ============================================================================
// Job Detail Skeleton
// ============================================================================

export function JobDetailSkeleton(): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: 20,
          borderBottom: "1px solid #3a3a5a",
          backgroundColor: "#1a1a2e",
        }}
      >
        <Skeleton width={80} height={36} borderRadius={8} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Skeleton width={140} height={24} />
            <Skeleton width={80} height={24} borderRadius={12} />
          </div>
          <Skeleton width={200} height={14} />
        </div>
        <Skeleton width={180} height={40} borderRadius={8} />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "0 20px",
          borderBottom: "1px solid #3a3a5a",
          backgroundColor: "#1a1a2e",
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            width={100}
            height={44}
            style={{ borderRadius: 0 }}
          />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <InfoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Info Card Skeleton
// ============================================================================

export function InfoCardSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
      }}
    >
      <Skeleton width={120} height={14} style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton width={80} height={14} />
            <Skeleton width={100} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Verify Console Skeleton
// ============================================================================

export function VerifyConsoleSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <Skeleton width={150} height={20} />
        <Skeleton width={100} height={32} borderRadius={6} />
      </div>

      {/* Checks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width={200} height={16} />
          </div>
        ))}
      </div>

      {/* Log Area */}
      <div style={{ marginTop: 20 }}>
        <Skeleton width="100%" height={150} borderRadius={8} />
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard Page Skeleton
// ============================================================================

export function DashboardPageSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0a0a15",
      }}
    >
      <DashboardHeaderSkeleton />
      <div style={{ flex: 1, padding: 20 }}>
        <JobListSkeleton count={5} />
      </div>
    </div>
  );
}

export default Skeleton;
