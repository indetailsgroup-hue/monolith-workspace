// src/hooks/useEtaxCompliance.ts
// Data-fetching hook for the eTax Compliance Dashboard
// Targets: v_etax_compliance_dashboard, v_etax_full_health_summary,
//          rpc_etax_org_risk_ranking()

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/core/supabase'

// ─── Domain types ────────────────────────────────────────────────────────────

export interface ComplianceDashboardRow {
  org_id: string
  org_name: string
  total_submissions: number
  submitted_count: number
  failed_count: number
  success_rate: number
  overdue_with_pending_etax: number
  failed_last_24h: number
  last_submission_at: string | null
}

export interface FullHealthSummary {
  org_id: string
  org_name: string
  health_score: number
  health_status: 'healthy' | 'warning' | 'critical'
  compliance_success_rate: number
  today_retry_exhaustion_rate_pct: number
  overdue_with_pending_etax: number
  failed_last_24h: number
  compliance_freshness_status: string
  trend_freshness_status: string
  compliance_row_count: number
  trend_row_count: number
  compliance_last_refreshed_at: string | null
  trend_last_refreshed_at: string | null
}

export interface OrgRiskRanking {
  org_id: string
  org_name: string
  risk_rank: number
  risk_tier: 'CRITICAL' | 'WARNING' | 'HEALTHY'
  health_score: number
  health_status: string
  is_priority_review: boolean
  total_submissions: number
  success_rate: number
  failed_last_24h: number
  overdue_with_pending_etax: number
  last_submission_at: string | null
}

export interface EtaxComplianceState {
  compliance: ComplianceDashboardRow[]
  healthSummary: FullHealthSummary | null
  riskRanking: OrgRiskRanking[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastRefreshed: Date | null
}

// ─── Auto-refresh interval (ms) ──────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 60_000 // 1 minute

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEtaxCompliance(autoRefresh = true): EtaxComplianceState & { refetch: () => void } {
  const [state, setState] = useState<EtaxComplianceState>({
    compliance:    [],
    healthSummary: null,
    riskRanking:   [],
    isLoading:     true,
    isRefreshing:  false,
    error:         null,
    lastRefreshed: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  const fetchAll = useCallback(async (isBackground = false) => {
    if (!isMountedRef.current) return

    setState(prev => ({
      ...prev,
      isLoading:    !isBackground && prev.compliance.length === 0,
      isRefreshing: isBackground || prev.compliance.length > 0,
      error:        null,
    }))

    try {
      // Fetch all three sources in parallel
      const [complianceRes, healthRes, rankRes] = await Promise.all([
        supabase
          .from('v_etax_compliance_dashboard')
          .select('*')
          .order('success_rate', { ascending: true }),

        supabase
          .from('v_etax_full_health_summary')
          .select('*')
          .maybeSingle(),

        supabase.rpc('rpc_etax_org_risk_ranking'),
      ])

      if (!isMountedRef.current) return

      const errors = [complianceRes.error, healthRes.error, rankRes.error].filter(Boolean)
      if (errors.length > 0) {
        const msg = errors.map(e => e!.message).join('; ')
        setState(prev => ({ ...prev, error: msg, isLoading: false, isRefreshing: false }))
        return
      }

      setState({
        compliance:    (complianceRes.data ?? []) as ComplianceDashboardRow[],
        healthSummary: (healthRes.data ?? null)   as FullHealthSummary | null,
        riskRanking:   (rankRes.data   ?? [])     as OrgRiskRanking[],
        isLoading:     false,
        isRefreshing:  false,
        error:         null,
        lastRefreshed: new Date(),
      })
    } catch (err) {
      if (!isMountedRef.current) return
      setState(prev => ({
        ...prev,
        isLoading:    false,
        isRefreshing: false,
        error:        err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true
    void fetchAll(false)

    return () => {
      isMountedRef.current = false
    }
  }, [fetchAll])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    intervalRef.current = setInterval(() => void fetchAll(true), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, fetchAll])

  return { ...state, refetch: () => void fetchAll(true) }
}

// ─── Admin variant (uses admin RPC with p_critical_only filter) ───────────────

export function useEtaxComplianceAdmin(criticalOnly = false) {
  const [data, setData] = useState<OrgRiskRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const fetch = async () => {
      setIsLoading(true)
      const { data: rows, error: err } = await supabase.rpc(
        'rpc_etax_org_risk_ranking_admin',
        { p_critical_only: criticalOnly, p_limit: 200 },
      )
      if (!active) return
      if (err) {
        setError(err.message)
      } else {
        setData((rows ?? []) as OrgRiskRanking[])
      }
      setIsLoading(false)
    }

    void fetch()
    return () => { active = false }
  }, [criticalOnly])

  return { data, isLoading, error }
}
