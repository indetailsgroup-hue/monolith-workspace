/**
 * admin/SuperAdminDashboard.tsx — Platform-Wide Tenant Monitoring & Metrics
 *
 * Route: /admin
 * Access: SUPER_ADMIN only (platform operator, not org-level role)
 *
 * Features:
 * - Platform KPIs: total tenants, MRR, active users, job throughput
 * - Tenant list with search/filter/sort
 * - Health indicators per tenant (usage %, last active, status)
 * - Plan distribution breakdown
 * - Revenue metrics and growth
 * - Quick actions: suspend, upgrade, impersonate
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Organization, OrgPlan, OrgStatus } from '../tenant/types';

// ============================================================================
// Types
// ============================================================================

export interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  trialTenants: number;
  totalUsers: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  avgRevenuePerTenant: number;
  totalJobsThisMonth: number;
  avgJobsPerTenant: number;
  storageUsedGb: number;
  planDistribution: Record<OrgPlan, number>;
  growthRate: number; // % month-over-month
  churnRate: number;
  newTenantsThisMonth: number;
}

export interface TenantOverview {
  orgId: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  status: OrgStatus;
  memberCount: number;
  jobsThisMonth: number;
  storageUsedMb: number;
  mrr: number;
  lastActiveAt: string;
  createdAt: string;
  healthScore: number; // 0-100
  alerts: TenantAlert[];
}

export interface TenantAlert {
  type: 'usage_high' | 'payment_failed' | 'inactive' | 'approaching_limit' | 'grace_period';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SuperAdminUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

// ============================================================================
// Mock Data Helpers
// ============================================================================

function generateMockMetrics(): PlatformMetrics {
  return {
    totalTenants: 147,
    activeTenants: 128,
    suspendedTenants: 8,
    trialTenants: 11,
    totalUsers: 1842,
    monthlyRecurringRevenue: 458500,
    annualRecurringRevenue: 5502000,
    avgRevenuePerTenant: 3119,
    totalJobsThisMonth: 3456,
    avgJobsPerTenant: 23.5,
    storageUsedGb: 245.8,
    planDistribution: { FREE: 34, STARTER: 52, PROFESSIONAL: 48, ENTERPRISE: 13 },
    growthRate: 12.4,
    churnRate: 2.1,
    newTenantsThisMonth: 18,
  };
}

function generateMockTenants(): TenantOverview[] {
  const names = [
    'DAPH Decor', 'Siam Glass Works', 'Bangkok Aluminum', 'Chiang Mai Interiors',
    'Phuket Build Co', 'Korat Steel', 'Udon Manufacturing', 'Hat Yai Panels',
    'Nonthaburi Design', 'Rayong Fabrication', 'Khon Kaen Works', 'Lampang Craft',
  ];
  return names.map((name, i) => ({
    orgId: `org-${i + 1}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    plan: (['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as OrgPlan[])[i % 4],
    status: i === 7 ? 'SUSPENDED' : i === 10 ? 'TRIAL' : 'ACTIVE' as OrgStatus,
    memberCount: Math.floor(Math.random() * 25) + 3,
    jobsThisMonth: Math.floor(Math.random() * 80) + 5,
    storageUsedMb: Math.floor(Math.random() * 8000) + 200,
    mrr: [0, 1990, 4990, 14990][i % 4],
    lastActiveAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - Math.random() * 365 * 86400000).toISOString(),
    healthScore: Math.floor(Math.random() * 40) + 60,
    alerts: i === 0 ? [{ type: 'usage_high' as const, message: 'Storage at 92%', severity: 'warning' as const }] : [],
  }));
}

// ============================================================================
// Sub-Components
// ============================================================================

function MetricCard({ label, value, subtext, trend }: {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <div className="sa-metric-card">
      <div className="sa-metric-label">{label}</div>
      <div className="sa-metric-value">{value}</div>
      {trend && (
        <div className={`sa-metric-trend ${trend.positive ? 'positive' : 'negative'}`}>
          {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
      {subtext && <div className="sa-metric-subtext">{subtext}</div>}
    </div>
  );
}

function PlanDistributionChart({ distribution }: { distribution: Record<OrgPlan, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const colors: Record<OrgPlan, string> = {
    FREE: '#6b7280',
    STARTER: '#3b82f6',
    PROFESSIONAL: '#8b5cf6',
    ENTERPRISE: '#f59e0b',
  };

  return (
    <div className="sa-plan-distribution">
      <h3>📊 Plan Distribution</h3>
      <div className="sa-plan-bar">
        {(Object.entries(distribution) as [OrgPlan, number][]).map(([plan, count]) => (
          <div
            key={plan}
            className="sa-plan-segment"
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: colors[plan],
            }}
            title={`${plan}: ${count} tenants (${((count / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="sa-plan-legend">
        {(Object.entries(distribution) as [OrgPlan, number][]).map(([plan, count]) => (
          <span key={plan} className="sa-legend-item">
            <span className="sa-legend-dot" style={{ backgroundColor: colors[plan] }} />
            {plan}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

function TenantHealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <span className="sa-health-badge" style={{ color }}>
      {score >= 80 ? '●' : score >= 60 ? '◐' : '○'} {score}
    </span>
  );
}

function TenantStatusBadge({ status }: { status: OrgStatus }) {
  const colors: Record<OrgStatus, string> = {
    ACTIVE: '#10b981',
    SUSPENDED: '#ef4444',
    TRIAL: '#3b82f6',
    CANCELLED: '#6b7280',
  };
  return (
    <span className="sa-status-badge" style={{ backgroundColor: `${colors[status]}20`, color: colors[status] }}>
      {status}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface SuperAdminDashboardProps {
  /** Current super admin user */
  adminUser?: SuperAdminUser;
  /** Override tenants for testing */
  initialTenants?: TenantOverview[];
  /** Override metrics for testing */
  initialMetrics?: PlatformMetrics;
}

export function SuperAdminDashboard({ adminUser, initialTenants, initialMetrics }: SuperAdminDashboardProps) {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(initialMetrics || null);
  const [tenants, setTenants] = useState<TenantOverview[]>(initialTenants || []);
  const [loading, setLoading] = useState(!initialMetrics);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<OrgPlan | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<OrgStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'mrr' | 'health' | 'lastActive'>('mrr');
  const [selectedTenant, setSelectedTenant] = useState<TenantOverview | null>(null);

  // Simulate data fetch
  useEffect(() => {
    if (!initialMetrics) {
      const timer = setTimeout(() => {
        setMetrics(generateMockMetrics());
        setTenants(generateMockTenants());
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialMetrics]);

  // Access gate — only super admins
  if (adminUser && !adminUser.isSuperAdmin) {
    return (
      <div className="sa-access-denied">
        <h2>🚫 Super Admin Access Required</h2>
        <p>This dashboard is restricted to platform operators only.</p>
      </div>
    );
  }

  // Filtered + sorted tenants
  const filteredTenants = useMemo(() => {
    let result = [...tenants];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(q) || t.slug.includes(q) || t.orgId.includes(q));
    }
    if (filterPlan !== 'all') result = result.filter(t => t.plan === filterPlan);
    if (filterStatus !== 'all') result = result.filter(t => t.status === filterStatus);

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'mrr': return b.mrr - a.mrr;
        case 'health': return b.healthScore - a.healthScore;
        case 'lastActive': return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
        default: return 0;
      }
    });

    return result;
  }, [tenants, searchQuery, filterPlan, filterStatus, sortBy]);

  const handleSuspend = useCallback((orgId: string) => {
    setTenants(prev => prev.map(t => t.orgId === orgId ? { ...t, status: 'SUSPENDED' as OrgStatus } : t));
  }, []);

  const handleReactivate = useCallback((orgId: string) => {
    setTenants(prev => prev.map(t => t.orgId === orgId ? { ...t, status: 'ACTIVE' as OrgStatus } : t));
  }, []);

  if (loading) {
    return <div className="sa-loading">⏳ Loading platform metrics...</div>;
  }

  if (!metrics) return null;

  return (
    <div className="sa-dashboard" data-testid="super-admin-dashboard">
      {/* Header */}
      <header className="sa-header">
        <div>
          <h1>🏗️ MONOLITH — Super Admin</h1>
          <p className="sa-subtitle">Platform-wide tenant monitoring & metrics</p>
        </div>
        <div className="sa-admin-info">
          {adminUser && <span>👤 {adminUser.email}</span>}
          <span className="sa-badge-super">SUPER ADMIN</span>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="sa-kpi-grid">
        <MetricCard label="Total Tenants" value={metrics.totalTenants} trend={{ value: metrics.growthRate, positive: true }} />
        <MetricCard label="Active Tenants" value={metrics.activeTenants} subtext={`${metrics.suspendedTenants} suspended`} />
        <MetricCard label="MRR" value={`฿${metrics.monthlyRecurringRevenue.toLocaleString()}`} trend={{ value: metrics.growthRate, positive: true }} />
        <MetricCard label="ARR" value={`฿${metrics.annualRecurringRevenue.toLocaleString()}`} />
        <MetricCard label="Total Users" value={metrics.totalUsers.toLocaleString()} />
        <MetricCard label="Jobs This Month" value={metrics.totalJobsThisMonth.toLocaleString()} subtext={`avg ${metrics.avgJobsPerTenant}/tenant`} />
        <MetricCard label="Storage Used" value={`${metrics.storageUsedGb.toFixed(1)} GB`} />
        <MetricCard label="Churn Rate" value={`${metrics.churnRate}%`} trend={{ value: metrics.churnRate, positive: false }} />
        <MetricCard label="New This Month" value={metrics.newTenantsThisMonth} />
      </section>

      {/* Plan Distribution */}
      <PlanDistributionChart distribution={metrics.planDistribution} />

      {/* Tenant List */}
      <section className="sa-tenant-section">
        <h2>🏢 Tenant Directory ({filteredTenants.length})</h2>

        {/* Filters */}
        <div className="sa-filters">
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="sa-search-input"
          />
          <select value={filterPlan} onChange={e => setFilterPlan(e.target.value as OrgPlan | 'all')}>
            <option value="all">All Plans</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as OrgStatus | 'all')}>
            <option value="all">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TRIAL">Trial</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="mrr">Sort: Revenue</option>
            <option value="name">Sort: Name</option>
            <option value="health">Sort: Health</option>
            <option value="lastActive">Sort: Last Active</option>
          </select>
        </div>

        {/* Tenant Table */}
        <div className="sa-tenant-table">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Members</th>
                <th>Jobs/mo</th>
                <th>MRR</th>
                <th>Health</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map(tenant => (
                <tr key={tenant.orgId} className={tenant.alerts.length > 0 ? 'sa-row-alert' : ''}>
                  <td>
                    <strong>{tenant.name}</strong>
                    <br />
                    <small>{tenant.slug}</small>
                  </td>
                  <td><span className={`sa-plan-tag sa-plan-${tenant.plan.toLowerCase()}`}>{tenant.plan}</span></td>
                  <td><TenantStatusBadge status={tenant.status} /></td>
                  <td>{tenant.memberCount}</td>
                  <td>{tenant.jobsThisMonth}</td>
                  <td>฿{tenant.mrr.toLocaleString()}</td>
                  <td><TenantHealthBadge score={tenant.healthScore} /></td>
                  <td>{new Date(tenant.lastActiveAt).toLocaleDateString('th-TH')}</td>
                  <td>
                    <div className="sa-actions">
                      <button onClick={() => setSelectedTenant(tenant)} title="View Details">👁️</button>
                      {tenant.status === 'ACTIVE' ? (
                        <button onClick={() => handleSuspend(tenant.orgId)} title="Suspend">⏸️</button>
                      ) : (
                        <button onClick={() => handleReactivate(tenant.orgId)} title="Reactivate">▶️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <div className="sa-modal-overlay" onClick={() => setSelectedTenant(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{selectedTenant.name}</h3>
            <div className="sa-modal-grid">
              <div><strong>Org ID:</strong> {selectedTenant.orgId}</div>
              <div><strong>Plan:</strong> {selectedTenant.plan}</div>
              <div><strong>Status:</strong> {selectedTenant.status}</div>
              <div><strong>Members:</strong> {selectedTenant.memberCount}</div>
              <div><strong>Jobs/mo:</strong> {selectedTenant.jobsThisMonth}</div>
              <div><strong>Storage:</strong> {(selectedTenant.storageUsedMb / 1024).toFixed(1)} GB</div>
              <div><strong>MRR:</strong> ฿{selectedTenant.mrr.toLocaleString()}</div>
              <div><strong>Health:</strong> <TenantHealthBadge score={selectedTenant.healthScore} /></div>
              <div><strong>Created:</strong> {new Date(selectedTenant.createdAt).toLocaleDateString('th-TH')}</div>
            </div>
            {selectedTenant.alerts.length > 0 && (
              <div className="sa-modal-alerts">
                <h4>⚠️ Active Alerts</h4>
                {selectedTenant.alerts.map((alert, i) => (
                  <div key={i} className={`sa-alert sa-alert-${alert.severity}`}>
                    {alert.message}
                  </div>
                ))}
              </div>
            )}
            <button className="sa-modal-close" onClick={() => setSelectedTenant(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;
