// src/components/etax/HealthScoreBadge.tsx
// Color-coded badge for eTax health scores and risk tiers

import React from 'react'

interface HealthScoreBadgeProps {
  score: number
  status?: 'healthy' | 'warning' | 'critical' | string
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const STATUS_COLOURS: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  healthy:  { bg: 'bg-emerald-100', text: 'text-emerald-800', ring: 'ring-emerald-400', label: 'Healthy'  },
  warning:  { bg: 'bg-amber-100',   text: 'text-amber-800',   ring: 'ring-amber-400',   label: 'Warning'  },
  critical: { bg: 'bg-red-100',     text: 'text-red-800',     ring: 'ring-red-400',     label: 'Critical' },
}

const TIER_COLOURS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  WARNING:  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  HEALTHY:  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
}

export function HealthScoreBadge({ score, status, size = 'md', showLabel = true }: HealthScoreBadgeProps) {
  const derived = status ?? (score >= 80 ? 'healthy' : score >= 50 ? 'warning' : 'critical')
  const colours = STATUS_COLOURS[derived] ?? STATUS_COLOURS.warning

  const sizeClasses = {
    sm:  'text-xs px-2 py-0.5',
    md:  'text-sm px-3 py-1',
    lg:  'text-base px-4 py-1.5 font-semibold',
  }[size]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${colours.bg} ${colours.text} ${colours.ring} ${sizeClasses}`}>
      <span className="font-bold tabular-nums">{score.toFixed(0)}</span>
      {showLabel && <span className="opacity-80">{colours.label}</span>}
    </span>
  )
}

interface RiskTierBadgeProps {
  tier: 'CRITICAL' | 'WARNING' | 'HEALTHY' | string
  isPriorityReview?: boolean
  size?: 'sm' | 'md'
}

export function RiskTierBadge({ tier, isPriorityReview = false, size = 'md' }: RiskTierBadgeProps) {
  const colours = TIER_COLOURS[tier] ?? TIER_COLOURS.WARNING
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${colours.bg} ${colours.text} ${sizeClass}`}>
      <span className={`h-2 w-2 rounded-full ${colours.dot}`} />
      {tier}
      {isPriorityReview && (
        <span className="ml-1 rounded bg-red-200 px-1 text-xs text-red-700 font-bold">!</span>
      )}
    </span>
  )
}

interface FreshnessBadgeProps {
  status: string
}

export function FreshnessBadge({ status }: FreshnessBadgeProps) {
  const map: Record<string, string> = {
    fresh:    'bg-emerald-100 text-emerald-700',
    stale:    'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }
  const cls = map[status?.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}
