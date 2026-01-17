/**
 * Debounce Utility
 * PR-P1.1-C.2 Dashboard Filters
 *
 * @version 0.12.0
 */

import { useCallback, useRef, useEffect, useState } from "react";

/**
 * Creates a debounced version of a function.
 * The function will only be called after `delay` ms have passed
 * since the last invocation.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * React hook for debounced callback.
 * Returns a stable debounced function that won't change between renders.
 *
 * @example
 * const debouncedSearch = useDebouncedCallback((query: string) => {
 *   performSearch(query);
 * }, 150);
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update callback ref on each render
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delay);
    },
    [delay]
  ) as (...args: Args) => void;
}

/**
 * React hook for debounced value.
 * Returns a value that only updates after `delay` ms of no changes.
 *
 * @example
 * const [query, setQuery] = useState("");
 * const debouncedQuery = useDebouncedValue(query, 150);
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
