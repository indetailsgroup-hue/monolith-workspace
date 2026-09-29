import type { Organization, OrgMember, OrgPlan, OrgRole } from '../tenant/types';

export type BusinessModuleRelease = '17.0' | '17.5' | '18.0';

export interface BusinessModuleDefinition {
  id:
    | 'people'
    | 'super-employees'
    | 'training'
    | 'culture-metrics'
    | 'ai-costs'
    | 'ai-scheduler'
    | 'org-chart'
    | 'role-network'
    | 'qc-anomalies'
    | 'ai-quotation-drafts'
    | 'leadership-actions';
  path: string;
  label: string;
  description: string;
  release: BusinessModuleRelease;
  minimumPlan: OrgPlan;
  roles: OrgRole[];
}

const ALL_ACTIVE_ROLES: OrgRole[] = [
  'OWNER',
  'ADMIN',
  'DESIGNER',
  'FACTORY',
  'INSTALLER',
  'FINANCE',
  'VIEWER',
];

export const BUSINESS_MODULES: BusinessModuleDefinition[] = [
  {
    id: 'people',
    path: '/people',
    label: 'People Directory',
    description: 'ข้อมูลพนักงาน ทักษะ และเส้นทาง Super Employee',
    release: '17.0',
    minimumPlan: 'STARTER',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'super-employees',
    path: '/people/:employeeId/ai-readiness',
    label: 'Super Employee Tracker',
    description: 'ความพร้อม AI รายบุคคลและ skill gaps',
    release: '17.5',
    minimumPlan: 'PROFESSIONAL',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'training',
    path: '/training',
    label: 'Training Tracker',
    description: 'หลักสูตร การมอบหมาย และผลการฝึกอบรม',
    release: '17.5',
    minimumPlan: 'PROFESSIONAL',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'culture-metrics',
    path: '/culture/metrics',
    label: 'Culture Metrics',
    description: 'eNPS, feedback และสุขภาพองค์กร',
    release: '17.5',
    minimumPlan: 'PROFESSIONAL',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'ai-costs',
    path: '/ai/costs',
    label: 'AI Cost Estimation',
    description: 'ต้นทุน AI, budget และ ROI',
    release: '17.5',
    minimumPlan: 'ENTERPRISE',
    roles: ['OWNER', 'ADMIN', 'FINANCE'],
  },
  {
    id: 'ai-scheduler',
    path: '/ai/scheduler',
    label: 'AI Production Scheduler',
    description: 'วางแผนกำลังผลิตและอนุมัติ schedule',
    release: '17.5',
    minimumPlan: 'ENTERPRISE',
    roles: ['OWNER', 'ADMIN', 'FACTORY'],
  },
  {
    id: 'org-chart',
    path: '/structure/org-chart',
    label: 'Interactive OrgChart',
    description: 'โครงสร้างองค์กรและ reporting lines',
    release: '18.0',
    minimumPlan: 'PROFESSIONAL',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'role-network',
    path: '/structure/role-network',
    label: 'Role Network',
    description: 'เครือข่ายบทบาทและความสัมพันธ์ข้ามทีม',
    release: '18.0',
    minimumPlan: 'ENTERPRISE',
    roles: ALL_ACTIVE_ROLES,
  },
  {
    id: 'qc-anomalies',
    path: '/quality/anomalies',
    label: 'QC Anomaly Detection',
    description: 'threshold, anomaly และการตอบสนองด้านคุณภาพ',
    release: '18.0',
    minimumPlan: 'ENTERPRISE',
    roles: ['OWNER', 'ADMIN', 'FACTORY'],
  },
  {
    id: 'ai-quotation-drafts',
    path: '/ai/quotation-drafts',
    label: 'AI Quotation Draft',
    description: 'ร่างใบเสนอราคาและ human review workflow',
    release: '18.0',
    minimumPlan: 'ENTERPRISE',
    roles: ['OWNER', 'ADMIN', 'FINANCE'],
  },
  {
    id: 'leadership-actions',
    path: '/culture/leadership-actions',
    label: 'Leadership Actions',
    description: 'ติดตาม action, owner, blocker และผลลัพธ์',
    release: '18.0',
    minimumPlan: 'ENTERPRISE',
    roles: ['OWNER', 'ADMIN'],
  },
];

export type BusinessModuleId = BusinessModuleDefinition['id'];

const PLAN_RANK: Record<OrgPlan, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export function hasRequiredPlan(current: OrgPlan, minimum: OrgPlan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[minimum];
}

export function canUseTenantContext(
  organization: Pick<Organization, 'orgId' | 'status'>,
  member: Pick<OrgMember, 'orgId' | 'userId' | 'isActive'>,
  authenticatedUserId?: string,
): boolean {
  const organizationIsUsable = organization.status === 'ACTIVE' || organization.status === 'TRIAL';
  const sessionMatchesMember = authenticatedUserId === undefined || member.userId === authenticatedUserId;
  return organizationIsUsable
    && member.isActive
    && member.orgId === organization.orgId
    && sessionMatchesMember;
}

export function canAccessBusinessModule(
  definition: BusinessModuleDefinition,
  plan: OrgPlan,
  role: OrgRole,
  isActive: boolean,
): boolean {
  return isActive && definition.roles.includes(role) && hasRequiredPlan(plan, definition.minimumPlan);
}

export function getBusinessModule(id: BusinessModuleId): BusinessModuleDefinition {
  const definition = BUSINESS_MODULES.find((module) => module.id === id);
  if (!definition) throw new Error(`Unknown business module: ${id}`);
  return definition;
}

export function concreteModulePath(definition: BusinessModuleDefinition): string {
  return definition.path.includes(':employeeId') ? '/people' : definition.path;
}
