// src/pages/EtaxComplianceDashboard.tsx
// Main eTax Compliance Dashboard page
// Data: v_etax_compliance_dashboard, v_etax_full_health_summary, rpc_etax_org_risk_ranking

import React, { useState } from 'react'
import { useEtaxCompliance } from '@/hooks/useEtaxCompliance'
import { ComplianceSummaryCards } from '@/components/etax/ComplianceSummaryCards'
import { OrgRiskRankingTable } from '@/components/etax/OrgRiskRankingTable'

// ─── Per-org compliance detail table ─────────────────────────────────────────

function ComplianceDetailTable({ data, isLoading }: {
  data: ReturnType<typeof useEtaxCompliance>['compliance']
  isLoading: boolean
}) {
  const [search, setSearch] = useState('')
  const filtered = data.filter(r =>
    !search || r.org_name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Compliance Detail
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {data.length} orgs
          </span>
        </h3>
        <input
          type="text"
          placeholder="Search org…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-40 rounded-md border border-gray-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 text-left">Organisation</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-right">Submitted</th>
              <th className="px-4 py-2.5 text-right">Failed</th>
              <th className="px-4 py-2.5 text-right">Success %</th>
              <th className="px-4 py-2.5 text-right">Overdue+Pending</th>
              <th className="px-4 py-2.5 text-right">Failed 24h</th>
              <th className="px-4 py-2.5 text-right">Last Submission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-gray-400">
                      No data available.
                    </td>
                  </tr>
                  )
                : filtered.map(row => (
                  <tr key={row.org_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.org_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.total_submissions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{row.submitted_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{row.failed_count.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      row.success_rate >= 90 ? 'text-emerald-700' :
                      row.success_rate >= 70 ? 'text-amber-600'   : 'text-red-600'
                    }`}>
                      {row.success_rate.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${
                      row.overdue_with_pending_etax > 0 ? 'text-amber-600 font-semibold' : 'text-gray-500'
                    }`}>
                      {row.overdue_with_pending_etax}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${
                      row.failed_last_24h > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'
                    }`}>
                      {row.failed_last_24h}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {row.last_submission_at
                        ? new Date(row.last_submission_at).toLocaleDateString('th-TH')
                        : '—'
                      }
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Alert banner for critical orgs ──────────────────────────────────────────

function CriticalAlertBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span className="text-lg">⚠️</span>
      <div>
        <strong>{count} organisation{count > 1 ? 's' : ''}</strong> in CRITICAL tier —
        immediate review required.
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Risk Ranking', 'Compliance Detail'] as const
type Tab = typeof TABS[number]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EtaxComplianceDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const { compliance, healthSummary, riskRanking, isLoading, isRefreshing, error, lastRefreshed, refetch } =
    useEtaxCompliance(true)

  // Be defensive at this UI boundary: an RPC row can be null during a rolling
  // database upgrade, and one malformed row must not blank the whole dashboard.
  const validRiskRanking = riskRanking.filter(Boolean)
  const criticalCount = validRiskRanking.filter(r => r.risk_tier === 'CRITICAL').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">eTax Compliance Dashboard</h1>
            <p className="text-xs text-gray-500">
              Real-time e-Tax submission health · risk ranking · freshness monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-xs text-gray-400">
                Last updated: {lastRefreshed.toLocaleTimeString('th-TH')}
              </span>
            )}
            <button
              onClick={refetch}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {isRefreshing ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : '↻'} Refresh
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-3 flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab}
              {tab === 'Risk Ranking' && criticalCount > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
                  {criticalCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6" aria-busy={isLoading}>
        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Critical alert */}
        <CriticalAlertBanner count={criticalCount} />

        {/* KPI cards — always visible */}
        <ComplianceSummaryCards
          health={healthSummary}
          compliance={compliance}
          isLoading={isLoading}
        />

        {/* Tab panels */}
        {activeTab === 'Overview' && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Health summary detail card */}
            {healthSummary && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Full Health Summary</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Compliance Success Rate', `${healthSummary.compliance_success_rate?.toFixed(1)}%`],
                    ['Retry Exhaustion Rate', `${healthSummary.today_retry_exhaustion_rate_pct?.toFixed(1)}%`],
                    ['Overdue + Pending', String(healthSummary.overdue_with_pending_etax)],
                    ['Failed Last 24h', String(healthSummary.failed_last_24h)],
                    ['Compliance MV Rows', String(healthSummary.compliance_row_count ?? '—')],
                    ['Trend MV Rows', String(healthSummary.trend_row_count ?? '—')],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-gray-500">{label}</dt>
                      <dd className="font-semibold text-gray-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Top 5 risk orgs preview */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top 5 At-Risk Orgs</h3>
              {validRiskRanking.slice(0, 5).map(org => (
                <div key={org.org_id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">#{org.risk_rank}</span>
                    <span className="font-medium text-gray-900">{org.org_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-xs text-gray-500">{org.health_score.toFixed(0)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      org.risk_tier === 'CRITICAL' ? 'bg-red-100 text-red-700'
                      : org.risk_tier === 'WARNING'  ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                    }`}>{org.risk_tier}</span>
                  </div>
                </div>
              ))}
              {validRiskRanking.length === 0 && !isLoading && (
                <p className="text-xs text-gray-400">No risk data available.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Risk Ranking' && (
          <OrgRiskRankingTable data={validRiskRanking} isLoading={isLoading} />
        )}

        {activeTab === 'Compliance Detail' && (
          <ComplianceDetailTable data={compliance} isLoading={isLoading} />
        )}
      </main>
    </div>
  )
}
