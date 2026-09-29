import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getSupabaseClient } from '../core/auth/supabaseClient';
import { useSessionStore } from '../core/auth/useSessionStore';
import { usePeopleStore } from '../people/peopleStore';
import { useTenantStore } from '../tenant/tenantStore';
import type { OrgPlan } from '../tenant/types';
import type { TrainingCourseSummary } from '../training/trainingTypes';
import {
  BUSINESS_MODULES,
  canAccessBusinessModule,
  canUseTenantContext,
  concreteModulePath,
  getBusinessModule,
  hasRequiredPlan,
  type BusinessModuleId,
} from './businessModuleRegistry';

const PeopleDirectory = lazy(() =>
  import('../people/PeopleDirectory').then((module) => ({ default: module.PeopleDirectory })),
);
const SuperEmployeeProgressPanel = lazy(() =>
  import('../training/SuperEmployeeProgressPanel').then((module) => ({
    default: module.SuperEmployeeProgressPanel,
  })),
);
const TrainingCourseList = lazy(() =>
  import('../training/TrainingCourseList').then((module) => ({ default: module.TrainingCourseList })),
);
const TrainingEnrollmentPanel = lazy(() =>
  import('../training/TrainingEnrollmentPanel').then((module) => ({
    default: module.TrainingEnrollmentPanel,
  })),
);
const CultureDashboard = lazy(() =>
  import('../culture-metrics/CultureDashboard').then((module) => ({ default: module.CultureDashboard })),
);
const AiCostDashboard = lazy(() =>
  import('../ai-cost/AiCostDashboard').then((module) => ({ default: module.AiCostDashboard })),
);
const AiSchedulerBoard = lazy(() =>
  import('../ai-scheduler/AiSchedulerBoard').then((module) => ({ default: module.AiSchedulerBoard })),
);
const OrgChartCanvas = lazy(() => import('../orgchart/OrgChartCanvas'));
const RoleNetworkCanvas = lazy(() =>
  import('../role-network/RoleNetworkCanvas').then((module) => ({ default: module.RoleNetworkCanvas })),
);
const QcAnomalyDashboard = lazy(() =>
  import('../qc-anomaly/QcAnomalyDashboard').then((module) => ({ default: module.QcAnomalyDashboard })),
);
const AiQuotationDraftBoard = lazy(() =>
  import('../ai-quotation/AiQuotationDraftBoard').then((module) => ({
    default: module.AiQuotationDraftBoard,
  })),
);
const LeadershipActionBoard = lazy(() => import('../leadership-actions/LeadershipActionBoard'));

interface ModuleContext {
  orgId: string;
  orgPlan: OrgPlan;
  userId: string;
  isAdmin: boolean;
}

function LoadingModule() {
  return (
    <div role="status" className="p-12 text-center text-sm text-gray-500">
      กำลังโหลดโมดูล…
    </div>
  );
}

function ModuleChrome({ title, children }: { title: string; children: ReactNode }) {
  const currentOrg = useTenantStore((state) => state.currentOrg);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="font-bold text-gray-950 no-underline">MONOLITH</Link>
          <span className="text-gray-300">/</span>
          <Link to="/modules" className="text-sm text-indigo-700 no-underline hover:underline">Modules</Link>
          <span className="text-gray-300">/</span>
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </div>
        {currentOrg && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="max-w-48 truncate">{currentOrg.name}</span>
            <span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
              {currentOrg.plan}
            </span>
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}

function AccessWall({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <ModuleChrome title={title}>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
        <div className="mb-4 text-4xl" aria-hidden="true">🔒</div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="mt-3 text-sm leading-6 text-gray-600">{children}</div>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </ModuleChrome>
  );
}

function useAuthCheck() {
  const session = useSessionStore((state) => state.session);
  const [checked, setChecked] = useState(getSupabaseClient() === null);

  useEffect(() => {
    if (getSupabaseClient() === null) return;
    void useSessionStore.getState().initialize().finally(() => setChecked(true));
  }, []);

  return { checked, session, authConfigured: getSupabaseClient() !== null };
}

function BusinessModuleBoundary({
  moduleId,
  children,
}: {
  moduleId: BusinessModuleId;
  children: (context: ModuleContext) => ReactNode;
}) {
  const definition = getBusinessModule(moduleId);
  const currentOrg = useTenantStore((state) => state.currentOrg);
  const currentMember = useTenantStore((state) => state.currentMember);
  const { checked, session, authConfigured } = useAuthCheck();

  if (!checked) {
    return <ModuleChrome title={definition.label}><LoadingModule /></ModuleChrome>;
  }

  if (authConfigured && !session) {
    return (
      <AccessWall
        title={definition.label}
        action={(
          <Link
            to={`/login?next=${encodeURIComponent(definition.path)}`}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white no-underline"
          >
            Sign in
          </Link>
        )}
      >
        กรุณาเข้าสู่ระบบก่อนใช้งานโมดูลธุรกิจ
      </AccessWall>
    );
  }

  if (!currentOrg || !currentMember || currentMember.orgId !== currentOrg.orgId) {
    return (
      <AccessWall
        title={definition.label}
        action={<Link to="/onboarding" className="text-sm font-semibold text-indigo-700">ตั้งค่าองค์กร</Link>}
      >
        ยังไม่มีองค์กรและสมาชิกที่ใช้งานอยู่ เลือกองค์กรหรือทำ onboarding ก่อน
      </AccessWall>
    );
  }

  if (!canUseTenantContext(
    currentOrg,
    currentMember,
    authConfigured ? session?.user.id : undefined,
  )) {
    return (
      <AccessWall title={definition.label}>
        องค์กรหรือสมาชิกนี้ไม่อยู่ในสถานะใช้งาน หรือ session ไม่ตรงกับสมาชิกที่เลือก
      </AccessWall>
    );
  }

  if (!definition.roles.includes(currentMember.role)) {
    return (
      <AccessWall title={definition.label}>
        บัญชีนี้ไม่มี role ที่อนุญาตสำหรับโมดูลนี้ กรุณาติดต่อผู้ดูแลองค์กร
      </AccessWall>
    );
  }

  if (!hasRequiredPlan(currentOrg.plan, definition.minimumPlan)) {
    return (
      <AccessWall
        title={definition.label}
        action={<Link to="/settings/billing" className="text-sm font-semibold text-indigo-700">ดูแผนและอัปเกรด</Link>}
      >
        โมดูลนี้ต้องการแผน {definition.minimumPlan} ขึ้นไป แผนปัจจุบันคือ {currentOrg.plan}
      </AccessWall>
    );
  }

  return (
    <ModuleChrome title={definition.label}>
      <Suspense fallback={<LoadingModule />}>
        {children({
          orgId: currentOrg.orgId,
          orgPlan: currentOrg.plan,
          userId: currentMember.userId,
          isAdmin: currentMember.role === 'OWNER' || currentMember.role === 'ADMIN',
        })}
      </Suspense>
    </ModuleChrome>
  );
}

export function BusinessModulesHome() {
  const currentOrg = useTenantStore((state) => state.currentOrg);
  const currentMember = useTenantStore((state) => state.currentMember);
  const { checked, session, authConfigured } = useAuthCheck();

  if (!checked) return <ModuleChrome title="Business Modules"><LoadingModule /></ModuleChrome>;
  if (authConfigured && !session) {
    return (
      <AccessWall
        title="Business Modules"
        action={<Link to="/login?next=%2Fmodules" className="font-semibold text-indigo-700">Sign in</Link>}
      >
        กรุณาเข้าสู่ระบบเพื่อดูโมดูลขององค์กร
      </AccessWall>
    );
  }
  if (!currentOrg || !currentMember || currentMember.orgId !== currentOrg.orgId) {
    return (
      <AccessWall
        title="Business Modules"
        action={<Link to="/onboarding" className="font-semibold text-indigo-700">ตั้งค่าองค์กร</Link>}
      >
        ยังไม่มีองค์กรที่ใช้งานอยู่
      </AccessWall>
    );
  }

  if (!canUseTenantContext(
    currentOrg,
    currentMember,
    authConfigured ? session?.user.id : undefined,
  )) {
    return (
      <AccessWall title="Business Modules">
        องค์กรหรือสมาชิกนี้ไม่อยู่ในสถานะใช้งาน หรือ session ไม่ตรงกับสมาชิกที่เลือก
      </AccessWall>
    );
  }

  return (
    <ModuleChrome title="Business Modules">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-gray-600">
          โมดูล v17.5 และ v18.0 ที่เปิดให้ใช้งานตาม role และแผนของ {currentOrg.name}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_MODULES.map((module) => {
            const roleAllowed = module.roles.includes(currentMember.role);
            const accessible = canAccessBusinessModule(
              module,
              currentOrg.plan,
              currentMember.role,
              currentMember.isActive,
            );
            return (
              <article key={module.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-indigo-600">v{module.release}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                    {module.minimumPlan}+
                  </span>
                </div>
                <h2 className="mt-3 text-base font-semibold">{module.label}</h2>
                <p className="mt-2 min-h-10 text-sm leading-5 text-gray-600">{module.description}</p>
                {accessible ? (
                  <Link
                    to={concreteModulePath(module)}
                    className="mt-4 inline-flex text-sm font-semibold text-indigo-700 no-underline hover:underline"
                  >
                    เปิดโมดูล →
                  </Link>
                ) : (
                  <p className="mt-4 text-xs font-medium text-amber-700">
                    {!roleAllowed ? 'Role นี้ไม่มีสิทธิ์' : `ต้องการ ${module.minimumPlan}+`}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </ModuleChrome>
  );
}

export function PeopleDirectoryRoute() {
  const navigate = useNavigate();
  return (
    <BusinessModuleBoundary moduleId="people">
      {({ orgId }) => (
        <div className="mx-auto max-w-7xl p-6">
          <PeopleDirectory
            orgId={orgId}
            onSelectEmployee={(employee) => navigate(`/people/${employee.id}/ai-readiness`)}
          />
        </div>
      )}
    </BusinessModuleBoundary>
  );
}

export function SuperEmployeeRoute() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const employees = usePeopleStore((state) => state.employees);
  const employeeName = useMemo(
    () => employees.find((employee) => employee.id === employeeId)?.name,
    [employeeId, employees],
  );

  if (!employeeId) return <AccessWall title="Super Employee Tracker">ไม่พบรหัสพนักงาน</AccessWall>;

  return (
    <BusinessModuleBoundary moduleId="super-employees">
      {({ orgId, orgPlan, isAdmin }) => (
        <div className="mx-auto max-w-5xl p-6">
          <SuperEmployeeProgressPanel
            orgId={orgId}
            orgPlan={orgPlan}
            employeeId={employeeId}
            employeeName={employeeName}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </BusinessModuleBoundary>
  );
}

export function TrainingTrackerRoute() {
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourseSummary | null>(null);
  return (
    <BusinessModuleBoundary moduleId="training">
      {({ orgId, orgPlan, isAdmin }) => (
        <div className="mx-auto max-w-7xl p-6">
          {selectedCourse ? (
            <TrainingEnrollmentPanel
              orgId={orgId}
              orgPlan={orgPlan}
              courseId={selectedCourse.id}
              courseName={selectedCourse.title}
              onClose={() => setSelectedCourse(null)}
              isAdmin={isAdmin}
            />
          ) : (
            <TrainingCourseList
              orgId={orgId}
              orgPlan={orgPlan}
              isAdmin={isAdmin}
              onEnroll={setSelectedCourse}
            />
          )}
        </div>
      )}
    </BusinessModuleBoundary>
  );
}

export function CultureMetricsRoute() {
  return <BusinessModuleBoundary moduleId="culture-metrics">{(context) => <CultureDashboard {...context} />}</BusinessModuleBoundary>;
}

export function AiCostsRoute() {
  return <BusinessModuleBoundary moduleId="ai-costs">{(context) => <AiCostDashboard {...context} />}</BusinessModuleBoundary>;
}

export function AiSchedulerRoute() {
  return <BusinessModuleBoundary moduleId="ai-scheduler">{(context) => <AiSchedulerBoard {...context} />}</BusinessModuleBoundary>;
}

export function OrgChartRoute() {
  return <BusinessModuleBoundary moduleId="org-chart">{(context) => <OrgChartCanvas {...context} />}</BusinessModuleBoundary>;
}

export function RoleNetworkRoute() {
  return <BusinessModuleBoundary moduleId="role-network">{(context) => <RoleNetworkCanvas {...context} />}</BusinessModuleBoundary>;
}

export function QcAnomaliesRoute() {
  return <BusinessModuleBoundary moduleId="qc-anomalies">{(context) => <QcAnomalyDashboard {...context} />}</BusinessModuleBoundary>;
}

export function AiQuotationDraftsRoute() {
  return (
    <BusinessModuleBoundary moduleId="ai-quotation-drafts">
      {(context) => <AiQuotationDraftBoard {...context} />}
    </BusinessModuleBoundary>
  );
}

export function LeadershipActionsRoute() {
  return (
    <BusinessModuleBoundary moduleId="leadership-actions">
      {(context) => <LeadershipActionBoard {...context} />}
    </BusinessModuleBoundary>
  );
}
