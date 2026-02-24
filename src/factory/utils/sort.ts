/**
 * Sort Utility
 * PR-P1.1-C.2 Dashboard Filters
 *
 * @version 0.12.0
 */

export type SortDirection = "ASC" | "DESC";

/**
 * Sort jobs by updatedAt timestamp.
 * Jobs with missing/invalid updatedAt are pushed to the end.
 *
 * @param jobs - Array of jobs with updatedAt field
 * @param direction - Sort direction (ASC or DESC)
 * @returns New sorted array (does not mutate input)
 */
export function sortByUpdatedAt<T extends { updatedAt?: string }>(
  jobs: T[],
  direction: SortDirection = "DESC"
): T[] {
  return [...jobs].sort((a, b) => {
    const timeA = parseTimestamp(a.updatedAt);
    const timeB = parseTimestamp(b.updatedAt);

    // Push items with invalid timestamps to the end
    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;

    // Sort by direction
    return direction === "DESC" ? timeB - timeA : timeA - timeB;
  });
}

/**
 * Sort jobs by createdAt timestamp.
 * Jobs with missing/invalid createdAt are pushed to the end.
 */
export function sortByCreatedAt<T extends { createdAt?: string }>(
  jobs: T[],
  direction: SortDirection = "DESC"
): T[] {
  return [...jobs].sort((a, b) => {
    const timeA = parseTimestamp(a.createdAt);
    const timeB = parseTimestamp(b.createdAt);

    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;

    return direction === "DESC" ? timeB - timeA : timeA - timeB;
  });
}

/**
 * Sort jobs by jobId alphabetically.
 */
export function sortByJobId<T extends { jobId: string }>(
  jobs: T[],
  direction: SortDirection = "ASC"
): T[] {
  return [...jobs].sort((a, b) => {
    const compare = a.jobId.localeCompare(b.jobId);
    return direction === "ASC" ? compare : -compare;
  });
}

/**
 * Parse ISO timestamp string to milliseconds.
 * Returns null for invalid or missing timestamps.
 */
function parseTimestamp(timestamp: string | undefined): number | null {
  if (!timestamp) return null;

  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return null;

  return time;
}

/**
 * Generic multi-field sorter.
 * Sorts by multiple fields in order of priority.
 */
export function sortByFields<T>(
  items: T[],
  fields: Array<{
    key: keyof T;
    direction: SortDirection;
    type?: "string" | "number" | "date";
  }>
): T[] {
  return [...items].sort((a, b) => {
    for (const field of fields) {
      const valA = a[field.key];
      const valB = b[field.key];

      let compare = 0;

      if (field.type === "date") {
        const timeA = parseTimestamp(valA as string | undefined);
        const timeB = parseTimestamp(valB as string | undefined);

        if (timeA === null && timeB === null) continue;
        if (timeA === null) return 1;
        if (timeB === null) return -1;

        compare = timeA - timeB;
      } else if (field.type === "number") {
        compare = ((valA as number) ?? 0) - ((valB as number) ?? 0);
      } else {
        // string comparison
        compare = String(valA ?? "").localeCompare(String(valB ?? ""));
      }

      if (compare !== 0) {
        return field.direction === "ASC" ? compare : -compare;
      }
    }

    return 0;
  });
}
