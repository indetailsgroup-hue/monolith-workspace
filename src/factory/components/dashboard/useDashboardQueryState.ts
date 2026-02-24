/**
 * useDashboardQueryState - URL query string sync for dashboard state
 * PR-P1.1-C.2 Dashboard Filters
 *
 * Persists dashboard filters to URL for shareable links.
 * Format: ?q=search&status=SIGNED,VERIFIED&sort=UPDATED_DESC
 *
 * @version 0.12.0
 */

import { useEffect, useCallback, useRef } from "react";
import type { JobStatus } from "../../types/job";
import type { DashboardSort } from "../../state/factoryStore";

// ============================================================================
// Types
// ============================================================================

export interface DashboardQueryState {
  query: string;
  statusFilters: JobStatus[];
  sort: DashboardSort;
}

// Valid values for type safety
const VALID_STATUSES: JobStatus[] = ["SIGNED", "VERIFIED", "BLOCKED", "IN_PRODUCTION", "ARCHIVED"];
const VALID_SORTS: DashboardSort[] = ["UPDATED_DESC", "UPDATED_ASC"];

// ============================================================================
// Parse URL Query String
// ============================================================================

export function parseQueryString(): DashboardQueryState {
  if (typeof window === "undefined") {
    return getDefaultState();
  }

  const params = new URLSearchParams(window.location.search);

  // Parse search query
  const query = params.get("q") || "";

  // Parse status filters
  const statusParam = params.get("status");
  const statusFilters: JobStatus[] = [];
  if (statusParam) {
    const statuses = statusParam.split(",");
    for (const s of statuses) {
      if (VALID_STATUSES.includes(s as JobStatus)) {
        statusFilters.push(s as JobStatus);
      }
    }
  }

  // Parse sort
  const sortParam = params.get("sort");
  const sort: DashboardSort =
    sortParam && VALID_SORTS.includes(sortParam as DashboardSort)
      ? (sortParam as DashboardSort)
      : "UPDATED_DESC";

  return { query, statusFilters, sort };
}

// ============================================================================
// Build URL Query String
// ============================================================================

export function buildQueryString(state: DashboardQueryState): string {
  const params = new URLSearchParams();

  if (state.query) {
    params.set("q", state.query);
  }

  if (state.statusFilters.length > 0) {
    params.set("status", state.statusFilters.join(","));
  }

  if (state.sort !== "UPDATED_DESC") {
    params.set("sort", state.sort);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

// ============================================================================
// Default State
// ============================================================================

function getDefaultState(): DashboardQueryState {
  return {
    query: "",
    statusFilters: [],
    sort: "UPDATED_DESC",
  };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseDashboardQueryStateOptions {
  /** Callback when initial state is parsed from URL */
  onInitialState?: (state: DashboardQueryState) => void;
}

export interface UseDashboardQueryStateReturn {
  /** Update URL with current state */
  updateUrl: (state: DashboardQueryState) => void;
  /** Get current state from URL */
  getUrlState: () => DashboardQueryState;
}

/**
 * Hook for syncing dashboard state with URL query string.
 *
 * @example
 * const { updateUrl } = useDashboardQueryState({
 *   onInitialState: (state) => {
 *     setDashboardQuery(state.query);
 *     setDashboardStatusFilters(state.statusFilters);
 *     setDashboardSort(state.sort);
 *   },
 * });
 *
 * // Update URL when state changes
 * useEffect(() => {
 *   updateUrl({ query, statusFilters, sort });
 * }, [query, statusFilters, sort, updateUrl]);
 */
export function useDashboardQueryState(
  options: UseDashboardQueryStateOptions = {}
): UseDashboardQueryStateReturn {
  const { onInitialState } = options;
  const initializedRef = useRef(false);

  // Parse initial state from URL on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialState = parseQueryString();
    onInitialState?.(initialState);
  }, [onInitialState]);

  // Update URL with new state (using replaceState to avoid history pollution)
  const updateUrl = useCallback((state: DashboardQueryState) => {
    if (typeof window === "undefined") return;

    const queryString = buildQueryString(state);
    const newUrl = window.location.pathname + queryString;

    // Only update if URL actually changed
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", newUrl);
    }
  }, []);

  // Get current state from URL
  const getUrlState = useCallback(() => {
    return parseQueryString();
  }, []);

  return { updateUrl, getUrlState };
}

export default useDashboardQueryState;
