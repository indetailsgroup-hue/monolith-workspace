// src/components/etax/ComplianceSummaryCards.tsx
// Top KPI cards for the eTax Compliance Dashboard

import React from 'react'
import type { FullHealthSummary, ComplianceDashboardRow } from '@/hooks/useEtaxCompliance'
import { HealthScoreBadge, FreshnessBadge } from './HealthScoreBadge'

interface ComplianceSummaryCardsProps {
  health: FullHealthSummary | null
  compliance: ComplianceDashboardRow[]
  isLoading: boolean
}

function StatCard({
  title, value, sub, accent = false, danger = false,
}: {
  title: string
  value: React.ReactNode
  sub?: string
  accent?: boolean
  danger?: boolean
}) {
  const border = danger ? 'border-red-300 bg-red-50' : accent ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${border}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return <div className="h-20 w-full animate-pulse rounded-xl bg-gray-100" />
}

export function ComplianceSummaryCards({ health, compliance, isLoading }: ComplianceSummaryCardsProps) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
        role="status"
        aria-label="Loading compliance summary"
      >
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
      </div>
    )
  }

  const totalOrgs      = compliance.length
  const totalSubs      = compliance.reduce((s, r) => s + r.total_submissions, 0)
  const totalFailed24h = compliance.reduce((s, r) => s + r.failed_last_24h,  0)
  const totalOverdue   = compliance.reduce((s, r) => s + r.overdue_with_pending_etax, 0)
  const avgSuccess     = totalOrgs > 0
    ? compliance.reduce((s, r) => s + r.success_rate, 0) / totalOrgs
    : 0

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard
        title="Health Score"
        value={health
          ? <HealthScoreBadge score={health.health_score} status={health.health_status} size="lg" />
          : <span className="text-gray-400">—</span>
        }
        sub={health ? `Status: ${health.health_status}` : undefined}
        accent
      />

      <StatCard
        title="Orgs Monitored"
        value={totalOrgs}
        sub="total organisations"
      />

      <StatCard
        title="Total Submissions"
        value={totalSubs.toLocaleString()}
        sub="all document types"
      />

      <StatCard
        title="Avg. Success Rate"
        value={`${avgSuccess.toFixed(1)}%`}
        sub="across all orgs"
        accent={avgSuccess >= 90}
        danger={avgSuccess < 70}
      />

      <StatCard
        title="Failed (24 h)"
        value={totalFailed24h}
        sub="recent failures"
        danger={totalFailed24h > 0}
      />

      <StatCard
        title="Overdue + Pending"
        value={totalOverdue}
        sub="invoices awaiting eTax"
        danger={totalOverdue > 0}
      />

      {health && (
        <div className="col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:col-span-3 lg:col-span-6">
          <span className="text-xs font-medium text-gray-500">MV Freshness:</span>
          <span className="text-xs text-gray-600">Compliance MV</span>
          <FreshnessBadge status={health.compliance_freshness_status} />
          <span className="mx-1 text-gray-300">|</span>
          <span className="text-xs text-gray-600">Health Trend MV</span>
          <FreshnessBadge status={health.trend_freshness_status} />
          {health.compliance_last_refreshed_at && (
            <span className="ml-auto text-xs text-gray-400">
              Refreshed: {new Date(health.compliance_last_refreshed_at).toLocaleString('th-TH')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
