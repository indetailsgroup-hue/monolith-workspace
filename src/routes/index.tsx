/**
 * routes/index.tsx - React Router v6 Route Configuration
 *
 * Priority 3: Full routing for MONOLITH
 *
 * ROUTE MAP:
 * /                            - Designer workspace (default)
 * /projects                    - Project list / hub
 * /projects/:projectId         - Project home (swimlane hub)
 * /projects/:projectId/design  - Designer workspace for project
 * /projects/:projectId/validation - Factory validation (server-authoritative)
 * /validation                  - Redirect to /projects/current/validation
 * /release                     - Release wizard
 * /packet/:id                  - View released packet
 * /jobs                         - Job Board (DESIGNER, FACTORY, ADMIN)
 * /jobs/new                     - Create Job wizard (DESIGNER, ADMIN)
 * /jobs/:jobId                  - Job detail (DESIGNER, FACTORY, ADMIN)
 * /quotations                   - Quotation list (FINANCE, ADMIN)
 * /factory                     - Factory dashboard (FACTORY role)
 * /factory/jobs/:jobId         - Factory job detail (FACTORY role)
 * /finance                     - Finance screen (FINANCE role)
 * /etax                        - eTax Compliance Dashboard (OWNER, ADMIN, FINANCE)
 * /accounting                  - Accounting Management UI (OWNER, ADMIN, FINANCE)
 * /modules                     - v17.5/v18 Business Modules Hub
 * /people                      - People Directory
 * /people/:employeeId/ai-readiness - Super Employee Tracker
 * /training                    - Training Tracker
 * /culture/metrics             - Culture Metrics Dashboard
 * /ai/costs                    - AI Cost Estimation
 * /ai/scheduler                - AI Production Scheduler
 * /structure/org-chart         - Interactive OrgChart
 * /structure/role-network      - Role Network View
 * /quality/anomalies           - QC Anomaly Detection
 * /ai/quotation-drafts         - AI Quotation Draft
 * /culture/leadership-actions  - Leadership Action Tracker
 * /safety                      - Redirect to /diagnostics/safety
 * /diagnostics/safety          - Safety diagnostics (local-only, not authoritative)
 *
 * @version 0.13.0
 */

import { useMemo, useEffect, useState, useCallback, Suspense, lazy, type ComponentType } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { isPitchMode, withSearchParams } from '../core/ui/pitch';
import { useJobStore } from '../jobs/jobStore';
import { useQuotationStore } from '../quotation/quotationStore';

// ============================================================================
// T018 + O3 + O4: Route-level Lazy Loading
// Lazy load heavy route components to reduce initial bundle size
// ============================================================================

// Designer Workspace - contains Canvas + three.js
const DesignerWorkspace = lazy(() => import('../App'));

// O3: Safety diagnostics page
const SafetyGatePage = lazy(() =>
  import('../components/pages/SafetyGatePage').then(m => ({ default: m.SafetyGatePage }))
);

// O4: Factory dashboard app
const FactoryApp = lazy(() =>
  import('../factory/FactoryApp').then(m => ({ default: m.FactoryApp }))
);

// v15: Job lifecycle pages
const JobBoardPage = lazy(() =>
  import('../jobs/JobBoard').then(m => ({ default: m.JobBoard }))
);
const CreateJobWizardPage = lazy(() =>
  import('../jobs/CreateJobWizard').then(m => ({ default: m.CreateJobWizard }))
);
const JobDetailPageComponent = lazy(() =>
  import('../jobs/JobDetailPage').then(m => ({ default: m.JobDetailPage }))
);
const JobsLayoutComponent = lazy(() =>
  import('../jobs/JobsLayout').then(m => ({ default: m.JobsLayout }))
);
const JobAnalyticsDashboardComponent = lazy(() =>
  import('../jobs/JobAnalyticsDashboard').then(m => ({ default: m.JobAnalyticsDashboard }))
);
const DndKanbanBoardComponent = lazy(() =>
  import('../jobs/DndKanbanBoard').then(m => ({ default: m.DndKanbanBoard }))
);

// v16: Tenant onboarding
const TenantOnboardingPage = lazy(() =>
  import('../tenant/TenantOnboarding').then(m => ({ default: m.TenantOnboarding }))
);

// v16.1: Settings & Billing
const OrgSettingsPageComponent = lazy(() =>
  import('../tenant/OrgSettingsPage').then(m => ({ default: m.OrgSettingsPage }))
);
const BillingPageComponent = lazy(() =>
  import('../tenant/BillingPage').then(m => ({ default: m.BillingPage }))
);
const AuditLogViewerComponent = lazy(() =>
  import('../tenant/AuditLogViewer').then(m => ({ default: m.AuditLogViewer }))
);
const UsageDashboardComponent = lazy(() =>
  import('../tenant/UsageDashboard').then(m => ({ default: m.UsageDashboard }))
);

// v16.4: Super Admin Dashboard
const SuperAdminDashboardComponent = lazy(() =>
  import('../admin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard }))
);

// v16.4: Notification Preferences
const NotificationPreferencesComponent = lazy(() =>
  import('../notifications/NotificationPreferencesPage').then(m => ({ default: m.NotificationPreferencesPage }))
);

// v15: Quotation builder
const QuotationBuilderPage = lazy(() =>
  import('../quotation/QuotationBuilder').then(m => ({ default: m.QuotationBuilder }))
);

// S18 L7 Slice 4: Finance dashboard (built by lane L4 as src/pages/FinanceDashboard).
// import.meta.glob with literal patterns is statically analyzed by Vite, so the
// module is code-split into the production bundle the moment L4's file lands —
// a bundler-invisible variable import would 404 at runtime in a production
// build and silently show FinanceComingSoon forever. While the file is absent
// the glob record is empty and the route renders FinanceComingSoon; when it
// lands, a rebuild picks it up with no manual integration step.
const financeDashboardModules = import.meta.glob<{
  FinanceDashboard?: ComponentType;
  default?: ComponentType;
}>(['../pages/FinanceDashboard.tsx', '../pages/FinanceDashboard/index.tsx']);
const loadFinanceDashboard = Object.values(financeDashboardModules)[0];
const FinanceDashboard = lazy(() =>
  loadFinanceDashboard
    ? loadFinanceDashboard().then((m) => ({
        default: m.FinanceDashboard ?? m.default ?? FinanceComingSoon,
      }))
    : Promise.resolve({ default: FinanceComingSoon })
);

// release/15.0.0: eTax Compliance Dashboard (src/pages/EtaxComplianceDashboard.tsx)
const EtaxComplianceDashboard = lazy(() =>
  import('../pages/EtaxComplianceDashboard').then((m) => ({
    default: m.default,
  }))
);

// release/15.0.0: Accounting Management UI (src/pages/AccountingManagement.tsx)
const AccountingManagement = lazy(() =>
  import('../pages/AccountingManagement').then((m) => ({
    default: m.default,
  }))
);

/**
 * T018 + O1: Loading fallback for workspace routes
 * CAD-grade "silent luxury" design with Monolith theme tokens
 * Supports both dark and light themes via CSS variables
 */
function WorkspaceLoadingFallback() {
  return (
    <div className="w-screen h-screen bg-surface-0 text-textc-primary flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border border-textc-primary/10" />
          <div className="absolute inset-0 rounded-full border-2 border-textc-primary/20 border-t-textc-primary/70 animate-spin" />
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-medium text-textc-primary/80 tracking-wide">
            Loading Workspace…
          </div>
          <div className="text-xs text-textc-secondary font-mono">
            Initializing 3D engine & materials
          </div>
        </div>

        {/* Subtle progress bar */}
        <div className="w-64 h-1 rounded-full bg-textc-primary/10 overflow-hidden">
          <div className="h-full w-1/2 bg-textc-primary/35 rounded-full animate-pulse" />
        </div>

        {/* Hint row */}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-textc-muted">
          <span className="px-2 py-1 rounded-md bg-textc-primary/5 border border-textc-primary/10 font-mono">
            Tip
          </span>
          <span>
            Use <span className="text-textc-secondary font-mono">F</span> for Command Palette
            {' '}•{' '}
            <span className="text-textc-secondary font-mono">D</span> toggles dimensions
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * O3/O4: Simple loading fallback for non-workspace lazy routes
 * Theme-aware using CSS variable tokens
 */
function PageLoadingFallback({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="w-screen h-screen bg-surface-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border border-textc-primary/10" />
          <div className="absolute inset-0 rounded-full border-2 border-textc-primary/20 border-t-textc-primary/60 animate-spin" />
        </div>
        <div className="text-sm text-textc-secondary">{message}</div>
      </div>
    </div>
  );
}

import { ValidationScreen } from '../pages/ValidationScreen';
import { SignIn } from '../pages/SignIn';
import { JobDetail } from '../factory/pages/JobDetail';
import { RequireRole } from '../core/auth/guards';
import { hasRole, type Role } from '../core/auth/roles';
import { useCabinetStore } from '../core/store/useCabinetStore';
import { useProjectStore } from '../core/store/useProjectStore';
import { useSpecStore } from '../core/store/useSpecStore';
import { useVerifyStatusStore } from '../core/store/useVerifyStatusStore';
import { VerifyVerdictPill } from '../components/ui/VerifyVerdictPill';
import { RoleGateDialog } from '../components/ui/RoleGateDialog';
import {
  AiCostsRoute,
  AiQuotationDraftsRoute,
  AiSchedulerRoute,
  BusinessModulesHome,
  CultureMetricsRoute,
  LeadershipActionsRoute,
  OrgChartRoute,
  PeopleDirectoryRoute,
  QcAnomaliesRoute,
  RoleNetworkRoute,
  SuperEmployeeRoute,
  TrainingTrackerRoute,
} from './BusinessModuleRoutes';

// ============================================================================
// Types
// ============================================================================

type SwimlaneStatus = 'pending' | 'in_progress' | 'complete' | 'blocked';

interface SwimlaneStep {
  id: string;
  label: string;
  labelThai: string;
  status: SwimlaneStatus;
  route?: string;
  icon: string;
}

// ============================================================================
// Swimlane Hub - Project Home Page
// ============================================================================

interface SwimlaneStepComponentProps {
  step: SwimlaneStep;
  projectId: string;
  onRoleGatedClick?: (route: string, requiredRoles: Role[]) => void;
}

function SwimlaneStepComponent({ step, projectId, onRoleGatedClick }: SwimlaneStepComponentProps) {
  const navigate = useNavigate();

  const getStatusColor = () => {
    switch (step.status) {
      case 'complete': return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#86efac' };
      case 'in_progress': return { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', text: '#93c5fd' };
      case 'blocked': return { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#fca5a5' };
      default: return { bg: 'rgba(107, 114, 128, 0.1)', border: '#374151', text: '#9ca3af' };
    }
  };

  const colors = getStatusColor();
  const isClickable = step.route && step.status !== 'blocked';

  const handleClick = () => {
    if (isClickable && step.route) {
      const fullRoute = step.route.replace(':projectId', projectId);

      // Check if this is a factory route that requires role check
      if (step.id === 'export' && onRoleGatedClick) {
        const requiredRoles: Role[] = ['FACTORY', 'ADMIN'];
        if (!hasRole(requiredRoles)) {
          onRoleGatedClick(fullRoute, requiredRoles);
          return;
        }
      }

      navigate(fullRoute);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '16px 20px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: step.status === 'pending' ? 0.6 : 1,
        transition: 'all 0.2s ease',
        minWidth: '120px',
      }}
    >
      <span style={{ fontSize: '24px' }}>{step.icon}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{step.label}</span>
      <span style={{ fontSize: '11px', color: '#6b7280' }}>{step.labelThai}</span>
      <span style={{
        fontSize: '10px',
        padding: '2px 8px',
        borderRadius: '999px',
        background: colors.border,
        color: 'white',
        fontWeight: 500,
        textTransform: 'uppercase',
      }}>
        {step.status.replace('_', ' ')}
      </span>
    </div>
  );
}

function SwimlaneConnector({ status }: { status: SwimlaneStatus }) {
  const color = status === 'complete' ? '#22c55e' : '#374151';
  return (
    <div style={{
      width: '40px',
      height: '2px',
      background: color,
      margin: '0 4px',
      borderRadius: '1px',
    }} />
  );
}

function ProjectHomePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const cabinet = useCabinetStore((s) => s.cabinet);
  const specState = useSpecStore((s) => s.specState);

  const effectiveProjectId = projectId || 'current';
  const jobId = effectiveProjectId;

  // Pitch mode: clean demo UI with narrative, hide tech noise
  const pitch = isPitchMode(location.search);

  // Role gate dialog state
  const [roleGateDialogOpen, setRoleGateDialogOpen] = useState(false);
  const [roleGateTarget, setRoleGateTarget] = useState<{
    route: string;
    requiredRoles: Role[];
  } | null>(null);

  // Handler for role-gated navigation attempts
  const handleRoleGatedClick = useCallback((route: string, requiredRoles: Role[]) => {
    setRoleGateTarget({ route, requiredRoles });
    setRoleGateDialogOpen(true);
  }, []);

  // Close dialog
  const closeRoleGateDialog = useCallback(() => {
    setRoleGateDialogOpen(false);
    setRoleGateTarget(null);
  }, []);

  // Copy link to clipboard - separate Project and Factory links
  const copyProjectLink = useCallback(async () => {
    const url = `${window.location.origin}/projects/${effectiveProjectId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [effectiveProjectId]);

  const copyFactoryLink = useCallback(async () => {
    const url = `${window.location.origin}/factory/jobs/${jobId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [jobId]);

  // Relative time helper
  const getRelativeTime = useCallback((ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
  }, []);

  // Server verify status (cached, TTL 60s)
  const verifyEntry = useVerifyStatusStore((s) => s.byJobId[jobId]);
  const ensureStatus = useVerifyStatusStore((s) => s.ensureStatus);
  const refreshStatus = useVerifyStatusStore((s) => s.refreshStatus);

  // Check if current user can access factory routes
  const canAccessFactory = hasRole(['FACTORY', 'ADMIN']);

  // Auto-fetch verify status on mount (with TTL cache)
  useEffect(() => {
    ensureStatus(jobId, { maxAgeMs: 60_000 }).catch(() => {});
  }, [jobId, ensureStatus]);

  // Derive verdict from server (PASS-only policy)
  const verdict = verifyEntry?.status?.verdict;
  const isLoading = verifyEntry?.loading;
  const verifyError = verifyEntry?.error;
  const lastCheckedMs = verifyEntry?.status?.fetchedAtMs;
  // FS-B1-02: the server verify is a storage-integrity check — its verdict is
  // STORAGE_HASH_MATCH (legacy PASS accepted during rollout). Either unlocks
  // export of the STORED packet; neither claims full packet verification.
  const gateComplete = verdict === 'PASS' || verdict === 'STORAGE_HASH_MATCH';
  const isStatusKnown = verdict !== undefined && !isLoading;

  // Derive swimlane status from server verify result
  // Gate authority = server verify (Factory Check). Export unlocks only on a
  // clean storage verdict.
  const swimlaneSteps = useMemo<SwimlaneStep[]>(() => {
    const designComplete = specState !== 'DRAFT';

    // Factory Check step status based on server verdict
    const factoryCheckStatus: SwimlaneStatus = !designComplete
      ? 'pending'
      : gateComplete
        ? 'complete'
        : verdict === 'FAIL' || verdict === 'PASS_WITH_WARN'
          ? 'blocked'
          : 'in_progress'; // UNKNOWN or loading

    return [
      {
        id: 'design',
        label: 'Design',
        labelThai: 'ออกแบบ',
        status: designComplete ? 'complete' : 'in_progress',
        route: '/projects/:projectId/design',
        icon: '✏️',
      },
      {
        id: 'factory_check',
        label: 'Factory Check',
        labelThai: 'ตรวจสอบ / อนุมัติ',
        status: factoryCheckStatus,
        route: '/projects/:projectId/validation',
        icon: '🛡️',
      },
      {
        id: 'export',
        label: 'Export',
        labelThai: 'ส่งออก',
        // Block export when status unknown (not yet verified) or gate not passed
        status: !isStatusKnown ? 'blocked' : (!gateComplete ? 'pending' : 'in_progress'),
        route: '/factory/jobs/:projectId', // Direct to Factory JobDetail
        icon: '📦',
      },
    ];
  }, [specState, verdict, gateComplete, isStatusKnown]);

  const projectName = cabinet?.name || 'Untitled Project';

  // Determine verdict display for pill
  const verdictDisplay = isLoading
    ? 'LOADING'
    : verdict ?? 'UNKNOWN';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: 'white',
      padding: '32px',
    }}>
      {/* Header - Pitch mode shows clean version */}
      {pitch ? (
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700 }}>{projectName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <VerifyVerdictPill verdict={verdictDisplay} />
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}>
          <div>
            <Link to="/" style={{ color: '#6b7280', fontSize: '12px', textDecoration: 'none' }}>
              ← Back to Workspace
            </Link>
            <h1 style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px' }}>{projectName}</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
              Project ID: {effectiveProjectId} • Job ID: {jobId} • Spec: {specState}
            </p>
          </div>
          {/* Server Verify Status */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <VerifyVerdictPill verdict={verdictDisplay} />
              <button
                onClick={() => refreshStatus(jobId)}
                disabled={isLoading}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #374151',
                  background: isLoading ? '#1f2937' : '#111',
                  color: isLoading ? '#6b7280' : '#9ca3af',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? 'Checking...' : '↻ Refresh'}
              </button>
              <div style={{
                padding: '8px 16px',
                background: specState === 'RELEASED' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                border: `1px solid ${specState === 'RELEASED' ? '#22c55e' : '#3b82f6'}`,
                borderRadius: '8px',
              }}>
                <span style={{ color: specState === 'RELEASED' ? '#86efac' : '#93c5fd', fontWeight: 600, fontSize: '13px' }}>
                  {specState}
                </span>
              </div>
            </div>
            {/* Error or Last Checked Info */}
            {verifyError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#ef4444', fontSize: '12px' }}>
                  Error: {verifyError.slice(0, 50)}{verifyError.length > 50 ? '...' : ''}
                </span>
                <button
                  onClick={() => refreshStatus(jobId)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #ef4444',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : lastCheckedMs ? (
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                Last checked: {getRelativeTime(lastCheckedMs)}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Pitch Mode: Narrative Header */}
      {pitch && (
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          borderRadius: '16px',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          background: 'rgba(139, 92, 246, 0.05)',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#c4b5fd' }}>
            Design → Factory Check → Export
          </div>
          <div style={{
            marginTop: '8px',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.7)',
            lineHeight: 1.6,
          }}>
            Gate authority is <b style={{ color: '#a78bfa' }}>server verification</b>.
            Export unlocks only on <b style={{ color: '#86efac' }}>PASS</b>.
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate(withSearchParams(`/projects/${effectiveProjectId}/validation`, location.search))}
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#c4b5fd',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
            >
              🛡️ Run Factory Check
            </button>
            {canAccessFactory && (
              <button
                onClick={() => navigate(`/factory/jobs/${effectiveProjectId}`)}
                style={{
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#86efac',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                }}
              >
                📦 Open Export (Factory Ops)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Swimlane */}
      <div style={{
        background: '#111',
        border: '1px solid #222',
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '32px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#9ca3af', marginBottom: '24px' }}>
          Project Workflow
        </h2>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          {swimlaneSteps.map((step, idx) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
              <SwimlaneStepComponent
                step={step}
                projectId={effectiveProjectId}
                onRoleGatedClick={handleRoleGatedClick}
              />
              {idx < swimlaneSteps.length - 1 && (
                <SwimlaneConnector status={step.status} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions - Hidden in pitch mode (CTAs are in narrative header) */}
      {!pitch && (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        <Link to={`/projects/${effectiveProjectId}/design`} style={{
          padding: '20px',
          background: '#111',
          border: '1px solid #222',
          borderRadius: '12px',
          textDecoration: 'none',
          color: 'white',
          transition: 'all 0.2s ease',
        }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✏️</div>
          <div style={{ fontWeight: 600 }}>Continue Design</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Open the 3D designer workspace
          </div>
        </Link>
        <Link to={`/projects/${effectiveProjectId}/validation`} style={{
          padding: '20px',
          background: '#111',
          border: '1px solid #222',
          borderRadius: '12px',
          textDecoration: 'none',
          color: 'white',
          transition: 'all 0.2s ease',
        }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>🛡️</div>
          <div style={{ fontWeight: 600 }}>Factory Check</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Server-authoritative gate verification
          </div>
        </Link>
        {/* Export to Factory - Role-gated */}
        {canAccessFactory ? (
          <Link to={`/factory/jobs/${effectiveProjectId}`} style={{
            padding: '20px',
            background: '#111',
            border: '1px solid #222',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'white',
            transition: 'all 0.2s ease',
          }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>📦</div>
            <div style={{ fontWeight: 600 }}>Export to Factory</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Generate CAM files for production
            </div>
          </Link>
        ) : (
          <div
            onClick={() => handleRoleGatedClick(
              `/factory/jobs/${effectiveProjectId}`,
              ['FACTORY', 'ADMIN']
            )}
            style={{
              padding: '20px',
              background: '#111',
              border: '1px solid #222',
              borderRadius: '12px',
              cursor: 'pointer',
              color: 'white',
              transition: 'all 0.2s ease',
              opacity: 0.7,
            }}
          >
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>📦</div>
            <div style={{ fontWeight: 600 }}>Export to Factory</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Requires Factory role
            </div>
          </div>
        )}
        {/* Copy Project Link */}
        <div
          onClick={copyProjectLink}
          style={{
            padding: '20px',
            background: '#111',
            border: '1px solid #222',
            borderRadius: '12px',
            cursor: 'pointer',
            color: 'white',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>🔗</div>
          <div style={{ fontWeight: 600 }}>Copy Project Link</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Share with designers
          </div>
        </div>
        {/* Copy Factory Link */}
        <div
          onClick={copyFactoryLink}
          style={{
            padding: '20px',
            background: '#111',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            cursor: 'pointer',
            color: 'white',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>🏭</div>
          <div style={{ fontWeight: 600 }}>Copy Factory Link</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Share with factory team
          </div>
        </div>
      </div>
      )}

      {/* Role Gate Dialog */}
      <RoleGateDialog
        isOpen={roleGateDialogOpen}
        onClose={closeRoleGateDialog}
        requiredRoles={roleGateTarget?.requiredRoles ?? ['FACTORY', 'ADMIN']}
        title="Factory Access Required"
        description="Export to Factory requires Factory or Admin role. Share this project link with your Factory team."
        shareableUrl={`${window.location.origin}/projects/${effectiveProjectId}`}
      />
    </div>
  );
}

// ============================================================================
// Project Validation Page Wrapper
// ============================================================================

function ProjectValidationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Use projectId as jobId for validation
  const jobId = projectId || 'current';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: 'white',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            style={{
              padding: '8px 16px',
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ← Back to Project
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 600 }}>Factory Validation</h1>
        </div>
        <div style={{
          padding: '6px 12px',
          background: '#1f2937',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#6b7280',
          fontFamily: 'monospace',
        }}>
          Project: {projectId}
        </div>
      </div>

      {/* Validation Screen */}
      <ValidationScreen jobId={jobId} />
    </div>
  );
}

// ============================================================================
// Factory Job Detail Page Wrapper (URL-based routing)
// ============================================================================

// ============================================================================
// Job Detail Page Wrapper (v15.2)
// ============================================================================

function JobDetailPageWrapper() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  if (!jobId) {
    return <Navigate to="/jobs" replace />;
  }

  return (
    <Suspense fallback={<PageLoadingFallback message="Loading Job Detail…" />}>
      <JobDetailPageComponent jobId={jobId} onNavigate={(path) => navigate(path)} />
    </Suspense>
  );
}

function CreateJobWizardRoute() {
  const navigate = useNavigate();

  return (
    <CreateJobWizardPage
      onComplete={(job) => navigate(`/jobs/${job.jobId}`)}
      onCancel={() => navigate('/jobs')}
    />
  );
}

function QuotationRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const jobId = search.get('jobId');
  const quotationId = search.get('id');
  const job = useJobStore((state) =>
    jobId ? state.jobs.find((candidate) => candidate.jobId === jobId) : undefined,
  );
  const linkQuotation = useJobStore((state) => state.linkQuotation);
  const linkInvoice = useJobStore((state) => state.linkInvoice);
  const quotation = useQuotationStore((state) =>
    quotationId ? state.quotations.find((candidate) => candidate.quotationId === quotationId) : undefined,
  );
  const invoice = useQuotationStore((state) =>
    quotationId ? state.invoices.find((candidate) => candidate.quotationId === quotationId) : undefined,
  );
  const approveQuotation = useQuotationStore((state) => state.approveQuotation);

  if (quotationId) {
    if (!quotation) {
      return (
        <div data-testid="quotation-not-found" style={{ padding: '24px', color: '#f3f4f6' }}>
          ไม่พบใบเสนอราคาที่ต้องการ
        </div>
      );
    }

    return (
      <div data-testid="quotation-detail" style={{ maxWidth: '720px', margin: '0 auto', padding: '24px', color: '#f3f4f6' }}>
        <h2>{quotation.quotationCode}</h2>
        <p>{quotation.customerName}</p>
        <p data-testid={`quotation-status-${quotation.status}`}>สถานะ: {quotation.status}</p>
        <p>ยอดสุทธิ: ฿{quotation.total.toLocaleString('th-TH')}</p>
        {quotation.status !== 'APPROVED' && (
          <button
            type="button"
            data-testid="btn-approve-quotation"
            onClick={() => {
              const result = approveQuotation(quotation.quotationId, 'finance-user');
              if (result.success && result.invoice && quotation.jobId) {
                linkInvoice(quotation.jobId, result.invoice.invoiceId);
              }
            }}
          >
            อนุมัติใบเสนอราคา
          </button>
        )}
        {invoice && (
          <div data-testid="auto-invoice-created">
            สร้างใบแจ้งหนี้ {invoice.invoiceCode} แล้ว — ยอดรวม
            <span data-testid="invoice-total"> ฿{invoice.total.toLocaleString('th-TH')}</span>
          </div>
        )}
      </div>
    );
  }

  if (!jobId) {
    return (
      <div style={{ padding: '24px', color: '#f3f4f6', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h2>Quotation Management</h2>
        <p style={{ color: '#9ca3af' }}>Select a job from the Job Board to create a quotation.</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div data-testid="quotation-job-not-found" style={{ padding: '24px', color: '#f3f4f6' }}>
        ไม่พบงานที่ต้องการสร้างใบเสนอราคา
      </div>
    );
  }

  return (
    <QuotationBuilderPage
      job={job}
      onComplete={(quotationId) => {
        linkQuotation(job.jobId, quotationId);
        navigate(`/quotations?id=${quotationId}`);
      }}
      onCancel={() => navigate(`/jobs/${job.jobId}`)}
    />
  );
}

function FactoryJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  if (!jobId) {
    return <Navigate to="/factory" replace />;
  }

  return (
    <JobDetail
      jobId={jobId}
      onBack={() => navigate('/factory')}
    />
  );
}

// ============================================================================
// Project List Page
// ============================================================================

function ProjectListPage() {
  const cabinet = useCabinetStore((s) => s.cabinet);
  const navigate = useNavigate();

  // Cache-only verify status (no fetch from list - saves verifier calls)
  const verifyCache = useVerifyStatusStore((s) => s.byJobId);

  // S18 L7 Slice 3: real saved projects from useProjectStore (G9-validated
  // localStorage list), not a mock. Falls back to the live cabinet as
  // "current" when nothing has been saved yet.
  const savedProjects = useProjectStore((s) => s.savedProjects);
  const loadProjectsList = useProjectStore((s) => s.loadProjectsList);

  useEffect(() => {
    loadProjectsList();
  }, [loadProjectsList]);

  const projects = savedProjects.length > 0
    ? savedProjects.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: new Date(p.updatedAt).toISOString(),
      }))
    : [
        {
          id: 'current',
          name: cabinet?.name || 'Current Project',
          updatedAt: new Date().toISOString(),
        },
      ];

  // Get cached verdict for a project (returns UNKNOWN if not cached)
  const getCachedVerdict = (projectId: string) => {
    const entry = verifyCache[projectId];
    if (entry?.loading) return 'LOADING';
    if (entry?.status?.verdict) return entry.status.verdict;
    return 'UNKNOWN';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: 'white',
      padding: '32px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700 }}>Projects</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
              Manage your cabinet design projects
            </p>
          </div>
          <Link to="/" style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: '14px',
          }}>
            + New Project
          </Link>
        </div>

        {/* Project Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              style={{
                padding: '20px',
                background: '#111',
                border: '1px solid #222',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: '100%',
                height: '120px',
                background: '#1a1a1a',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#374151',
                fontSize: '32px',
              }}>
                📦
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3 style={{ fontWeight: 600 }}>{project.name}</h3>
                <VerifyVerdictPill verdict={getCachedVerdict(project.id)} size="sm" />
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Updated: {new Date(project.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ValidationPage removed - /validation now redirects to /projects/current/validation

function ReleasePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Release Wizard</h1>
      <p className="text-gray-400">DRAFT → FROZEN → RELEASED workflow - Coming soon</p>
      <a href="/" className="text-green-400 hover:underline mt-4 inline-block">
        ← Back to Designer
      </a>
    </div>
  );
}

function PacketViewerPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Packet Viewer</h1>
      <p className="text-gray-400">View released spec packet - Coming soon</p>
      <a href="/" className="text-green-400 hover:underline mt-4 inline-block">
        ← Back to Designer
      </a>
    </div>
  );
}

// FactoryDashboardPage removed - /factory now mounts FactoryApp directly

// S18 L7 Slice 4: shown while L4's FinanceDashboard module is not merged yet
function FinanceComingSoon() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Finance</h1>
      <p className="text-gray-400">Cost breakdowns and invoicing - Coming soon</p>
      <a href="/" className="text-green-400 hover:underline mt-4 inline-block">
        ← Back to Designer
      </a>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-700 mb-4">404</h1>
        <p className="text-gray-400 mb-6">Page not found</p>
        <a href="/" className="px-4 py-2 bg-green-500 text-black rounded-lg hover:bg-green-400 transition-colors">
          Go to Designer
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Router Configuration
// ============================================================================

function ProjectDesignPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const selectedId = useProjectStore((state) => state.metadata?.id);
  const [resolved, setResolved] = useState<{ requestedId?: string; loadedId?: string } | null>(null);

  useEffect(() => {
    const store = useProjectStore.getState();
    const loaded = !!projectId && store.loadProject(projectId === 'current' ? undefined : projectId);
    setResolved({ requestedId: projectId, loadedId: loaded ? useProjectStore.getState().metadata?.id : undefined });
  }, [projectId]);

  // A new URL must resolve before the previous designer can render under it.
  if (!resolved || resolved.requestedId !== projectId) return <WorkspaceLoadingFallback />;
  if (projectId === 'current' && resolved.loadedId) {
    return <Navigate to={`/projects/${encodeURIComponent(resolved.loadedId)}/design`} replace />;
  }
  if (!resolved.loadedId || selectedId !== resolved.loadedId) {
    const changed = !!resolved.loadedId;
    return (
      <div className="min-h-screen bg-surface-0 text-textc-primary flex items-center justify-center p-8">
        <div role="alert" className="max-w-lg space-y-4">
          <h1 className="text-xl font-semibold">{changed ? 'Project changed / โครงการเปลี่ยน' : 'Project unavailable / ไม่สามารถเปิดโครงการได้'}</h1>
          <p>{changed
            ? 'Open the selected project to continue. / เปิดโครงการที่เลือกเพื่อทำงานต่อ'
            : 'This project could not be loaded from this browser. / ไม่สามารถโหลดโครงการนี้จากเบราว์เซอร์นี้ได้'}</p>
          {changed && selectedId && (
            <Link className="block underline" to={`/projects/${encodeURIComponent(selectedId)}/design`}>
              Open selected project / เปิดโครงการที่เลือก
            </Link>
          )}
          <Link className="block underline" to="/projects">Back to projects / กลับไปที่โครงการ</Link>
        </div>
      </div>
    );
  }
  return <Suspense fallback={<WorkspaceLoadingFallback />}><DesignerWorkspace key={resolved.loadedId} /></Suspense>;
}

export const router = createBrowserRouter([
  // Designer Workspace (default) - T018: Lazy loaded
  {
    path: '/',
    element: (
      <Suspense fallback={<WorkspaceLoadingFallback />}>
        <DesignerWorkspace />
      </Suspense>
    ),
  },
  // S18 L7 Slice 1: sign-in page (email + password via Supabase)
  {
    path: '/login',
    element: <SignIn />,
  },
  // Project List
  {
    path: '/projects',
    element: <ProjectListPage />,
  },
  // Project Home (Swimlane Hub)
  {
    path: '/projects/:projectId',
    element: <ProjectHomePage />,
  },
  // Project Designer - T018: Lazy loaded
  {
    path: '/projects/:projectId/design',
    element: <ProjectDesignPage />,
  },
  // Project Validation
  {
    path: '/projects/:projectId/validation',
    element: <ProjectValidationPage />,
  },
  // Legacy project route (redirect)
  {
    path: '/project',
    element: <Navigate to="/projects" replace />,
  },
  // Legacy validation route - redirect to server-authoritative validation
  {
    path: '/validation',
    element: <Navigate to="/projects/current/validation" replace />,
  },
  // Release wizard
  {
    path: '/release',
    element: <ReleasePage />,
  },
  // Packet viewer
  {
    path: '/packet/:id',
    element: <PacketViewerPage />,
  },
  // ── Job Lifecycle Routes (v15.4) — wrapped with JobsLayout for toasts ───
  // Job Board — accessible to DESIGNER, FACTORY, ADMIN
  {
    path: '/jobs',
    element: (
      <RequireRole allow={['DESIGNER', 'FACTORY', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Job Board…" />}>
          <JobsLayoutComponent>
            <JobBoardPage />
          </JobsLayoutComponent>
        </Suspense>
      </RequireRole>
    ),
  },
  // Create Job Wizard — only DESIGNER and ADMIN can create jobs
  {
    path: '/jobs/new',
    element: (
      <RequireRole allow={['DESIGNER', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Job Wizard…" />}>
          <JobsLayoutComponent>
            <CreateJobWizardRoute />
          </JobsLayoutComponent>
        </Suspense>
      </RequireRole>
    ),
  },
  // Job Detail — accessible to DESIGNER, FACTORY, ADMIN
  {
    path: '/jobs/:jobId',
    element: (
      <RequireRole allow={['DESIGNER', 'FACTORY', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Job Detail…" />}>
          <JobsLayoutComponent>
            <JobDetailPageWrapper />
          </JobsLayoutComponent>
        </Suspense>
      </RequireRole>
    ),
  },
  // Job Analytics Dashboard — ADMIN and FINANCE
  {
    path: '/jobs/analytics',
    element: (
      <RequireRole allow={['ADMIN', 'FINANCE']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Analytics…" />}>
          <JobsLayoutComponent>
            <JobAnalyticsDashboardComponent />
          </JobsLayoutComponent>
        </Suspense>
      </RequireRole>
    ),
  },
  // Drag-and-Drop Kanban Board — FACTORY and ADMIN
  {
    path: '/jobs/kanban',
    element: (
      <RequireRole allow={['DESIGNER', 'FACTORY', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Kanban…" />}>
          <JobsLayoutComponent>
            <DndKanbanBoardComponent />
          </JobsLayoutComponent>
        </Suspense>
      </RequireRole>
    ),
  },
  // v16: Tenant Onboarding — self-service org registration
  {
    path: '/onboarding',
    element: (
      <Suspense fallback={<PageLoadingFallback message="Loading Onboarding…" />}>
        <TenantOnboardingPage
          userId="pending"
          userEmail="pending@monolith.app"
          userDisplayName="New User"
          onComplete={() => { window.location.href = '/jobs'; }}
        />
      </Suspense>
    ),
  },
  // v16.1: Org Settings — ADMIN and OWNER
  {
    path: '/settings',
    element: (
      <RequireRole allow={['ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Settings…" />}>
          <OrgSettingsPageComponent />
        </Suspense>
      </RequireRole>
    ),
  },
  // v16.1: Billing — OWNER only
  {
    path: '/settings/billing',
    element: (
      <RequireRole allow={['ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Billing…" />}>
          <BillingPageComponent />
        </Suspense>
      </RequireRole>
    ),
  },
  // v16.2: Audit Log — OWNER/ADMIN only
  {
    path: '/settings/audit-log',
    element: (
      <RequireRole allow={['ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Audit Log…" />}>
          <AuditLogViewerComponent />
        </Suspense>
      </RequireRole>
    ),
  },
  // v16.2: Usage Dashboard — OWNER/ADMIN only
  {
    path: '/settings/usage',
    element: (
      <RequireRole allow={['ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Usage…" />}>
          <UsageDashboardComponent />
        </Suspense>
      </RequireRole>
    ),
  },
  // Quotation management — FINANCE and ADMIN only
  {
    path: '/quotations',
    element: (
      <RequireRole allow={['FINANCE', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Quotations…" />}>
          <QuotationRoute />
        </Suspense>
      </RequireRole>
    ),
  },
  // Factory dashboard (role-protected) - O4: Lazy loaded
  // S18 L7 Slice 3: no silent bounce — default RoleGateDialog fallback explains
  // which roles unlock the page.
  {
    path: '/factory',
    element: (
      <RequireRole allow={['FACTORY', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Factory…" />}>
          <FactoryApp useMockApi={false} />
        </Suspense>
      </RequireRole>
    ),
  },
  // Factory job detail (role-protected, URL-based)
  {
    path: '/factory/jobs/:jobId',
    element: (
      <RequireRole allow={['FACTORY', 'ADMIN']}>
        <FactoryJobDetailPage />
      </RequireRole>
    ),
  },
  // Finance page (role-protected) - S18 L7 Slice 4: lazy FinanceDashboard (L4)
  {
    path: '/finance',
    element: (
      <RequireRole allow={['FINANCE', 'ADMIN']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Finance…" />}>
          <FinanceDashboard />
        </Suspense>
      </RequireRole>
    ),
  },
  // release/15.0.0: eTax Compliance Dashboard (OWNER, ADMIN, FINANCE)
  {
    path: '/etax',
    element: (
      <RequireRole allow={['ADMIN', 'FINANCE']}>
        <Suspense fallback={<PageLoadingFallback message="Loading eTax Dashboard…" />}>
          <EtaxComplianceDashboard />
        </Suspense>
      </RequireRole>
    ),
  },
  // release/15.0.0: Accounting Management UI (OWNER, ADMIN, FINANCE)
  {
    path: '/accounting',
    element: (
      <RequireRole allow={['ADMIN', 'FINANCE']}>
        <Suspense fallback={<PageLoadingFallback message="Loading Accounting…" />}>
          <AccountingManagement />
        </Suspense>
      </RequireRole>
    ),
  },
  // v17.5/v18.0 business modules — tenant role + plan gates live in each route boundary.
  { path: '/modules', element: <BusinessModulesHome /> },
  { path: '/people', element: <PeopleDirectoryRoute /> },
  { path: '/people/:employeeId/ai-readiness', element: <SuperEmployeeRoute /> },
  { path: '/training', element: <TrainingTrackerRoute /> },
  { path: '/culture/metrics', element: <CultureMetricsRoute /> },
  { path: '/ai/costs', element: <AiCostsRoute /> },
  { path: '/ai/scheduler', element: <AiSchedulerRoute /> },
  { path: '/structure/org-chart', element: <OrgChartRoute /> },
  { path: '/structure/role-network', element: <RoleNetworkRoute /> },
  { path: '/quality/anomalies', element: <QcAnomaliesRoute /> },
  { path: '/ai/quotation-drafts', element: <AiQuotationDraftsRoute /> },
  { path: '/culture/leadership-actions', element: <LeadershipActionsRoute /> },
  // Legacy safety route - redirect to diagnostics
  {
    path: '/safety',
    element: <Navigate to="/diagnostics/safety" replace />,
  },
  // Safety diagnostics (local-only, not authoritative) - O3: Lazy loaded
  {
    path: '/diagnostics/safety',
    element: (
      <Suspense fallback={<PageLoadingFallback message="Loading Safety Diagnostics…" />}>
        <SafetyGatePage />
      </Suspense>
    ),
  },
  // v16.4: Super Admin Dashboard — platform operators only
  {
    path: '/admin',
    element: (
      <Suspense fallback={<PageLoadingFallback message="Loading Admin Dashboard…" />}>
        <SuperAdminDashboardComponent />
      </Suspense>
    ),
  },
  // v16.4: Notification Preferences — any authenticated user
  {
    path: '/settings/notifications',
    element: (
      <Suspense fallback={<PageLoadingFallback message="Loading Notification Settings…" />}>
        <NotificationPreferencesComponent />
      </Suspense>
    ),
  },
  // 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

// ============================================================================
// Router Provider Component
// ============================================================================

export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
