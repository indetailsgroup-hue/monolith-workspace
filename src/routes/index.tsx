/**
 * routes/index.tsx - React Router v6 Route Configuration
 *
 * Priority 3: Full routing for IIMOS
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
 * /factory                     - Factory dashboard (FACTORY role)
 * /factory/jobs/:jobId         - Factory job detail (FACTORY role)
 * /finance                     - Finance screen (FINANCE role)
 * /safety                      - Redirect to /diagnostics/safety
 * /diagnostics/safety          - Safety diagnostics (local-only, not authoritative)
 *
 * @version 0.12.2
 */

import { useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, useParams, useNavigate } from 'react-router-dom';
import { App } from '../App';
import { SafetyGatePage } from '../components/pages/SafetyGatePage';
import { ValidationScreen } from '../pages/ValidationScreen';
import { FactoryApp } from '../factory/FactoryApp';
import { JobDetail } from '../factory/pages/JobDetail';
import { RequireRole } from '../core/auth/guards';
import { useCabinetStore } from '../core/store/useCabinetStore';
import { useSpecStore } from '../core/store/useSpecStore';

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

function SwimlaneStep({ step, projectId }: { step: SwimlaneStep; projectId: string }) {
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
      // Replace :projectId in route
      const fullRoute = step.route.replace(':projectId', projectId);
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
  const cabinet = useCabinetStore((s) => s.cabinet);
  const specState = useSpecStore((s) => s.specState);

  // Derive swimlane status from spec state
  // Gate authority = server verify (Factory Check). Export unlocks only on PASS.
  const swimlaneSteps = useMemo<SwimlaneStep[]>(() => {
    const designComplete = specState !== 'DRAFT';
    const gateComplete = specState === 'RELEASED'; // PASS-only gate

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
        status: !designComplete ? 'pending' : gateComplete ? 'complete' : 'in_progress',
        route: '/projects/:projectId/validation',
        icon: '🛡️',
      },
      {
        id: 'export',
        label: 'Export',
        labelThai: 'ส่งออก',
        status: !gateComplete ? 'pending' : 'in_progress',
        route: '/factory/jobs/:projectId', // Direct to Factory JobDetail
        icon: '📦',
      },
    ];
  }, [specState]);

  const effectiveProjectId = projectId || 'current';
  const projectName = cabinet?.name || 'Untitled Project';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: 'white',
      padding: '32px',
    }}>
      {/* Header */}
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
            Project ID: {effectiveProjectId} • Spec: {specState}
          </p>
        </div>
        <div style={{
          padding: '12px 20px',
          background: specState === 'RELEASED' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          border: `1px solid ${specState === 'RELEASED' ? '#22c55e' : '#3b82f6'}`,
          borderRadius: '8px',
        }}>
          <span style={{ color: specState === 'RELEASED' ? '#86efac' : '#93c5fd', fontWeight: 600 }}>
            {specState}
          </span>
        </div>
      </div>

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
              <SwimlaneStep step={step} projectId={effectiveProjectId} />
              {idx < swimlaneSteps.length - 1 && (
                <SwimlaneConnector status={step.status} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
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
      </div>
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

  // Mock project list (in real app, fetch from API)
  const projects = [
    {
      id: 'current',
      name: cabinet?.name || 'Current Project',
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
    },
  ];

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
              <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>{project.name}</h3>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Status: {project.status} • Updated: {new Date(project.updatedAt).toLocaleDateString()}
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

function FinancePage() {
  return (
    <RequireRole allow={['FINANCE', 'ADMIN']} fallback={<Navigate to="/" replace />}>
      <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
        <h1 className="text-2xl font-bold mb-4">Finance</h1>
        <p className="text-gray-400">Cost breakdowns and invoicing - Coming soon</p>
        <a href="/" className="text-green-400 hover:underline mt-4 inline-block">
          ← Back to Designer
        </a>
      </div>
    </RequireRole>
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

export const router = createBrowserRouter([
  // Designer Workspace (default)
  {
    path: '/',
    element: <App />,
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
  // Project Designer
  {
    path: '/projects/:projectId/design',
    element: <App />,
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
  // Factory dashboard (role-protected)
  {
    path: '/factory',
    element: (
      <RequireRole allow={['FACTORY', 'ADMIN']} fallback={<Navigate to="/" replace />}>
        <FactoryApp useMockApi={false} />
      </RequireRole>
    ),
  },
  // Factory job detail (role-protected, URL-based)
  {
    path: '/factory/jobs/:jobId',
    element: (
      <RequireRole allow={['FACTORY', 'ADMIN']} fallback={<Navigate to="/" replace />}>
        <FactoryJobDetailPage />
      </RequireRole>
    ),
  },
  // Finance page (role-protected)
  {
    path: '/finance',
    element: <FinancePage />,
  },
  // Legacy safety route - redirect to diagnostics
  {
    path: '/safety',
    element: <Navigate to="/diagnostics/safety" replace />,
  },
  // Safety diagnostics (local-only, not authoritative)
  {
    path: '/diagnostics/safety',
    element: <SafetyGatePage />,
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
