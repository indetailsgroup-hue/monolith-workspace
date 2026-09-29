/**
 * SearchAnalyticsDashboard — Platform search usage analytics
 * Shows query patterns, performance metrics, and top searches
 * v16.6.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { fetchSearchAnalytics, SearchAnalyticsData } from './searchAnalytics';
import { downloadSearchAnalyticsCsv, type SearchAnalyticsExportData } from './csvExport';

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  color?: string;
}

function KpiCard({ label, value, icon, trend, color = 'blue' }: KpiCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };

  return (
    <div
      className={`p-4 rounded-lg border ${colorMap[color]} transition-all hover:shadow-sm`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {trend && <div className="text-xs mt-1 opacity-60">{trend}</div>}
    </div>
  );
}

// ─── Bar Chart (simple CSS-based) ────────────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number }[];
  title: string;
  maxBars?: number;
  color?: string;
}

function BarChart({ data, title, maxBars = 10, color = '#3b82f6' }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const displayData = data.slice(0, maxBars);

  return (
    <div className="bg-white rounded-lg border p-4" data-testid={`chart-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {displayData.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 truncate" title={item.label}>
              {item.label}
            </span>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600 w-10 text-right">
              {item.value}
            </span>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Sparkline (daily searches) ──────────────────────────────────────────────

interface SparklineProps {
  data: { date: string; count: number }[];
  title: string;
}

function Sparkline({ data, title }: SparklineProps) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const width = 400;
  const height = 80;
  const padding = 4;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (d.count / maxVal) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-white rounded-lg border p-4" data-testid="sparkline-daily">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {data.length > 1 ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
          <polyline
            points={points}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.map((d, i) => {
            const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
            const y = height - padding - (d.count / maxVal) * (height - padding * 2);
            return (
              <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" opacity="0.6">
                <title>{`${d.date}: ${d.count} searches`}</title>
              </circle>
            );
          })}
        </svg>
      ) : (
        <p className="text-xs text-gray-400 text-center py-6">Insufficient data for chart</p>
      )}
      {data.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{data[0]?.date}</span>
          <span>{data[data.length - 1]?.date}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export interface SearchAnalyticsDashboardProps {
  /** For testing: inject data directly */
  initialData?: SearchAnalyticsData;
  /** For testing: inject fetch function */
  fetchFn?: (days: number) => Promise<SearchAnalyticsData>;
}

export function SearchAnalyticsDashboard({
  initialData,
  fetchFn = fetchSearchAnalytics,
}: SearchAnalyticsDashboardProps) {
  const [data, setData] = useState<SearchAnalyticsData | null>(initialData || null);
  const [daysBack, setDaysBack] = useState(30);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [showExportPanel, setShowExportPanel] = useState(false);

  useEffect(() => {
    if (initialData) return;

    let cancelled = false;
    setLoading(true);

    fetchFn(daysBack)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [daysBack, fetchFn, initialData]);

  const topQueriesChart = useMemo(
    () => (data?.topQueries || []).map((q) => ({ label: q.query, value: q.count })),
    [data]
  );

  const entityTypeChart = useMemo(
    () => (data?.topEntityTypes || []).map((t) => ({ label: t.type, value: t.count })),
    [data]
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500" data-testid="analytics-loading">
        <span className="animate-pulse text-2xl">📊</span>
        <p className="mt-2 text-sm">Loading search analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg" data-testid="analytics-error">
        <p className="text-sm text-red-700">Failed to load analytics: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  // ─── CSV Export Handler ─────────────────────────────────────────────

  const handleCsvExport = () => {
    if (!data) return;

    // Filter daily volume by date range if specified
    let filteredDailyVolume = data.searchesPerDay;
    if (exportDateFrom || exportDateTo) {
      filteredDailyVolume = data.searchesPerDay.filter((d) => {
        if (exportDateFrom && d.date < exportDateFrom) return false;
        if (exportDateTo && d.date > exportDateTo) return false;
        return true;
      });
    }

    // Compute filtered KPIs based on date range
    const filteredTotal = exportDateFrom || exportDateTo
      ? filteredDailyVolume.reduce((sum, d) => sum + d.count, 0)
      : data.totalSearches;

    const exportData: SearchAnalyticsExportData = {
      kpis: {
        totalSearches: filteredTotal,
        uniqueUsers: data.uniqueUsers,
        avgResultsPerSearch: data.avgResultCount,
        zeroResultRate: data.zeroResultRate / 100, // Convert % to ratio
      },
      topQueries: data.topQueries.map((q) => ({
        query: q.query,
        count: q.count,
        avgResults: Math.round(data.avgResultCount),
      })),
      dailyVolume: filteredDailyVolume.map((d) => ({
        date: d.date,
        searches: d.count,
      })),
    };

    const dateRangeSuffix = exportDateFrom || exportDateTo
      ? `_${exportDateFrom || 'start'}_to_${exportDateTo || 'end'}`
      : `_last-${daysBack}d`;
    downloadSearchAnalyticsCsv(exportData, `search-analytics${dateRangeSuffix}.csv`);
  };

  return (
    <div className="space-y-6" data-testid="search-analytics-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🔍 Search Analytics</h2>
          <p className="text-xs text-gray-500">Platform-wide search usage and performance</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period buttons */}
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setDaysBack(days)}
                className={`px-3 py-1 rounded text-xs font-medium ${
                  daysBack === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                data-testid={`period-${days}d`}
              >
                {days}d
              </button>
            ))}
          </div>
          {/* Export button */}
          <button
            onClick={() => setShowExportPanel((v) => !v)}
            className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            data-testid="csv-export-toggle"
            aria-label="Export CSV"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Export Panel (date-range filtering) */}
      {showExportPanel && (
        <div
          className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-end gap-4 flex-wrap"
          data-testid="csv-export-panel"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={exportDateFrom}
              onChange={(e) => setExportDateFrom(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
              data-testid="export-date-from"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={exportDateTo}
              onChange={(e) => setExportDateTo(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
              data-testid="export-date-to"
            />
          </div>
          <button
            onClick={handleCsvExport}
            className="px-4 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
            data-testid="csv-export-download"
          >
            Download CSV
          </button>
          <button
            onClick={() => { setExportDateFrom(''); setExportDateTo(''); }}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300"
            data-testid="csv-export-clear-dates"
          >
            Clear Dates
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="kpi-grid">
        <KpiCard
          label="Total Searches"
          value={data.totalSearches.toLocaleString()}
          icon="🔎"
          color="blue"
        />
        <KpiCard
          label="Unique Users"
          value={data.uniqueUsers.toLocaleString()}
          icon="👥"
          color="purple"
        />
        <KpiCard
          label="Avg Response"
          value={`${data.avgQueryTimeMs}ms`}
          icon="⚡"
          color="green"
        />
        <KpiCard
          label="Avg Results"
          value={data.avgResultCount.toFixed(1)}
          icon="📄"
          color="amber"
        />
        <KpiCard
          label="Zero Results"
          value={`${data.zeroResultRate}%`}
          icon="❌"
          color={data.zeroResultRate > 30 ? 'red' : 'green'}
          trend={data.zeroResultRate > 30 ? 'High — content gaps?' : 'Healthy'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Sparkline data={data.searchesPerDay} title="Daily Search Volume" />
        <BarChart data={entityTypeChart} title="Searches by Entity Type" color="#8b5cf6" />
      </div>

      {/* Top Queries */}
      <BarChart data={topQueriesChart} title="Top Search Queries" maxBars={15} color="#3b82f6" />

      {/* Zero result insight */}
      {data.zeroResultRate > 20 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg" data-testid="zero-result-alert">
          <h4 className="text-sm font-medium text-amber-800">⚠️ High Zero-Result Rate</h4>
          <p className="text-xs text-amber-700 mt-1">
            {data.zeroResultRate}% of searches return no results. Consider reviewing top failing
            queries and improving data completeness or adding synonyms.
          </p>
        </div>
      )}
    </div>
  );
}

export default SearchAnalyticsDashboard;

// ─── Super-admin-guarded export (v16.8.0) ────────────────────────────────────
import withSuperAdminGuard from './withSuperAdminGuard';
export const GuardedSearchAnalyticsDashboard = withSuperAdminGuard(SearchAnalyticsDashboard);
