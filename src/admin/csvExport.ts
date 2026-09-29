/**
 * csvExport.ts — CSV export utility for SearchAnalyticsDashboard
 * Exports KPIs, top queries, and daily volume as a downloadable CSV
 * v16.7.0
 */

export interface SearchAnalyticsExportData {
  kpis: {
    totalSearches: number;
    uniqueUsers: number;
    avgResultsPerSearch: number;
    zeroResultRate: number;
  };
  topQueries: Array<{ query: string; count: number; avgResults: number }>;
  dailyVolume: Array<{ date: string; searches: number }>;
}

function escapeCsvValue(val: string | number): string {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRows(data: SearchAnalyticsExportData): string {
  const lines: string[] = [];

  // ─── Section 1: KPIs ──────────────────────────
  lines.push('=== Search Analytics KPIs ===');
  lines.push('Metric,Value');
  lines.push(`Total Searches,${data.kpis.totalSearches}`);
  lines.push(`Unique Users,${data.kpis.uniqueUsers}`);
  lines.push(`Avg Results per Search,${data.kpis.avgResultsPerSearch.toFixed(1)}`);
  lines.push(`Zero-Result Rate,${(data.kpis.zeroResultRate * 100).toFixed(1)}%`);
  lines.push('');

  // ─── Section 2: Top Queries ───────────────────
  lines.push('=== Top Queries ===');
  lines.push('Query,Count,Avg Results');
  for (const q of data.topQueries) {
    lines.push(`${escapeCsvValue(q.query)},${q.count},${q.avgResults}`);
  }
  lines.push('');

  // ─── Section 3: Daily Volume ──────────────────
  lines.push('=== Daily Search Volume ===');
  lines.push('Date,Searches');
  for (const d of data.dailyVolume) {
    lines.push(`${d.date},${d.searches}`);
  }

  return lines.join('\n');
}

/**
 * Trigger a CSV download in the browser
 */
export function downloadSearchAnalyticsCsv(
  data: SearchAnalyticsExportData,
  filename = 'search-analytics-export.csv'
): void {
  const csv = buildCsvRows(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build CSV string (for testing without DOM)
 */
export function buildSearchAnalyticsCsv(data: SearchAnalyticsExportData): string {
  return buildCsvRows(data);
}
