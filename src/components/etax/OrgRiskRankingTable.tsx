// src/components/etax/OrgRiskRankingTable.tsx
// Full risk-ranking table for the eTax Compliance Dashboard
// Data source: rpc_etax_org_risk_ranking()

import React, { useState } from 'react'
import type { OrgRiskRanking } from '@/hooks/useEtaxCompliance'
import { RiskTierBadge, HealthScoreBadge } from './HealthScoreBadge'

interface OrgRiskRankingTableProps {
  data: OrgRiskRanking[]
  isLoading: boolean
}

type SortKey = 'risk_rank' | 'health_score' | 'success_rate' | 'failed_last_24h' | 'total_submissions'
type SortDir = 'asc' | 'desc'

const TIER_ORDER = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 }

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        </td>
      ))}
    </tr>
  )
}

export function OrgRiskRankingTable({ data, isLoading }: OrgRiskRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('risk_rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterTier, setFilterTier] = useState<string>('ALL')
  const [search, setSearch] = useState('')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = data
    .filter(row => filterTier === 'ALL' || row.risk_tier === filterTier)
    .filter(row => !search || row.org_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'risk_rank') {
        const tierDiff = (TIER_ORDER[a.risk_tier] ?? 9) - (TIER_ORDER[b.risk_tier] ?? 9)
        if (tierDiff !== 0) return tierDiff * dir
        return (a.risk_rank - b.risk_rank) * dir
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
    })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const criticalCount = data.filter(r => r.risk_tier === 'CRITICAL').length
  const warningCount  = data.filter(r => r.risk_tier === 'WARNING').length
  const healthyCount  = data.filter(r => r.risk_tier === 'HEALTHY').length

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
        <h3 className="flex-1 text-sm font-semibold text-gray-900">
          Organisation Risk Ranking
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {data.length} orgs
          </span>
        </h3>

        {/* Tier filter chips */}
        <div className="flex gap-1">
          {(['ALL', 'CRITICAL', 'WARNING', 'HEALTHY'] as const).map(tier => {
            const count = tier === 'ALL' ? data.length : tier === 'CRITICAL' ? criticalCount : tier === 'WARNING' ? warningCount : healthyCount
            const active = filterTier === tier
            return (
              <button
                key={tier}
                onClick={() => setFilterTier(tier)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tier} {count > 0 && <span className="opacity-80">({count})</span>}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search org…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-40 rounded-md border border-gray-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="cursor-pointer px-4 py-2.5 text-left hover:text-gray-700" onClick={() => handleSort('risk_rank')}>
                Rank <SortIcon col="risk_rank" />
              </th>
              <th className="px-4 py-2.5 text-left">Organisation</th>
              <th className="px-4 py-2.5 text-left">Risk Tier</th>
              <th className="cursor-pointer px-4 py-2.5 text-right hover:text-gray-700" onClick={() => handleSort('health_score')}>
                Health Score <SortIcon col="health_score" />
              </th>
              <th className="cursor-pointer px-4 py-2.5 text-right hover:text-gray-700" onClick={() => handleSort('success_rate')}>
                Success % <SortIcon col="success_rate" />
              </th>
              <th className="cursor-pointer px-4 py-2.5 text-right hover:text-gray-700" onClick={() => handleSort('failed_last_24h')}>
                Failed 24h <SortIcon col="failed_last_24h" />
              </th>
              <th className="cursor-pointer px-4 py-2.5 text-right hover:text-gray-700" onClick={() => handleSort('total_submissions')}>
                Total Subs <SortIcon col="total_submissions" />
              </th>
              <th className="px-4 py-2.5 text-right">Last Submission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                      No organisations match the current filter.
                    </td>
                  </tr>
                  )
                : filtered.map(row => (
                  <tr
                    key={row.org_id}
                    className={`transition hover:bg-gray-50 ${
                      row.risk_tier === 'CRITICAL' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">
                      #{row.risk_rank}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{row.org_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <RiskTierBadge
                        tier={row.risk_tier}
                        isPriorityReview={row.is_priority_review}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <HealthScoreBadge
                        score={row.health_score}
                        status={row.health_status as any}
                        size="sm"
                        showLabel={false}
                      />
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${
                      row.success_rate < 70 ? 'text-red-600 font-semibold' : 'text-gray-700'
                    }`}>
                      {row.success_rate.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${
                      row.failed_last_24h > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'
                    }`}>
                      {row.failed_last_24h}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {row.total_submissions.toLocaleString()}
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

      {!isLoading && filtered.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          Showing {filtered.length} of {data.length} organisations
        </div>
      )}
    </div>
  )
}
