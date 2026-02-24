/**
 * DashboardToolbar - Search + Sort controls
 * PR-P1.1-C.2 Dashboard Filters
 *
 * @version 0.12.0
 */

import React, { useState, useCallback } from "react";
import type { DashboardSort } from "../../state/factoryStore";
import { useDebouncedCallback } from "../../utils/debounce";

export interface DashboardToolbarProps {
  /** Current search query */
  query: string;
  /** Callback when query changes (debounced) */
  onQueryChange: (query: string) => void;
  /** Current sort option */
  sort: DashboardSort;
  /** Callback when sort changes */
  onSortChange: (sort: DashboardSort) => void;
  /** Callback for refresh */
  onRefresh?: () => void;
  /** Loading state */
  loading?: boolean;
}

const SORT_OPTIONS: { value: DashboardSort; label: string }[] = [
  { value: "UPDATED_DESC", label: "Newest First" },
  { value: "UPDATED_ASC", label: "Oldest First" },
];

export function DashboardToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  onRefresh,
  loading = false,
}: DashboardToolbarProps): React.ReactElement {
  // Local state for immediate input feedback
  const [localQuery, setLocalQuery] = useState(query);

  // Debounced callback for actual filtering (150ms)
  const debouncedChange = useDebouncedCallback((value: string) => {
    onQueryChange(value);
  }, 150);

  // Handle input change with immediate local update + debounced store update
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalQuery(value);
      debouncedChange(value);
    },
    [debouncedChange]
  );

  // Clear search
  const handleClear = useCallback(() => {
    setLocalQuery("");
    onQueryChange("");
  }, [onQueryChange]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Search Input */}
      <div
        style={{
          position: "relative",
          flex: "1 1 240px",
          minWidth: 200,
          maxWidth: 400,
        }}
      >
        <input
          type="text"
          placeholder="Search job ID / project..."
          value={localQuery}
          onChange={handleQueryChange}
          style={{
            width: "100%",
            padding: "10px 36px 10px 14px",
            backgroundColor: "#0a0a15",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
          }}
        />
        {/* Search Icon */}
        <span
          style={{
            position: "absolute",
            right: localQuery ? 32 : 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#666",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          {/* Search icon using Unicode */}
          &#128269;
        </span>
        {/* Clear Button */}
        {localQuery && (
          <button
            onClick={handleClear}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              padding: 4,
              backgroundColor: "transparent",
              border: "none",
              color: "#888",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Sort Dropdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor="dashboard-sort"
          style={{
            fontSize: 13,
            color: "#888",
          }}
        >
          Sort:
        </label>
        <select
          id="dashboard-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as DashboardSort)}
          style={{
            padding: "8px 12px",
            backgroundColor: "#0a0a15",
            border: "1px solid #3a3a5a",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Refresh Button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            backgroundColor: "#8b5cf6",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "all 0.15s ease",
          }}
        >
          <span
            style={{
              display: "inline-block",
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          >
            &#8635;
          </span>
          <span>{loading ? "Loading..." : "Refresh"}</span>
        </button>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default DashboardToolbar;
