import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MODULES,
  canAccessBusinessModule,
  canUseTenantContext,
  concreteModulePath,
  getBusinessModule,
  hasRequiredPlan,
} from '../businessModuleRegistry';

describe('business module route registry', () => {
  it('uses unique ids and routes', () => {
    expect(new Set(BUSINESS_MODULES.map((module) => module.id)).size).toBe(BUSINESS_MODULES.length);
    expect(new Set(BUSINESS_MODULES.map((module) => module.path)).size).toBe(BUSINESS_MODULES.length);
  });

  it('registers every v17.5 and v18.0 module that has a production UI', () => {
    expect(BUSINESS_MODULES.filter((module) => module.release === '17.5').map((module) => module.id)).toEqual([
      'super-employees',
      'training',
      'culture-metrics',
      'ai-costs',
      'ai-scheduler',
    ]);
    expect(BUSINESS_MODULES.filter((module) => module.release === '18.0').map((module) => module.id)).toEqual([
      'org-chart',
      'role-network',
      'qc-anomalies',
      'ai-quotation-drafts',
      'leadership-actions',
    ]);
  });

  it('enforces monotonic plan levels', () => {
    expect(hasRequiredPlan('FREE', 'STARTER')).toBe(false);
    expect(hasRequiredPlan('PROFESSIONAL', 'PROFESSIONAL')).toBe(true);
    expect(hasRequiredPlan('ENTERPRISE', 'PROFESSIONAL')).toBe(true);
    expect(hasRequiredPlan('PROFESSIONAL', 'ENTERPRISE')).toBe(false);
  });

  it('routes parameterized Super Employee cards through People Directory', () => {
    expect(concreteModulePath(getBusinessModule('super-employees'))).toBe('/people');
  });

  it('combines active membership, tenant role, and plan for route access', () => {
    const module = getBusinessModule('ai-costs');
    expect(canAccessBusinessModule(module, 'ENTERPRISE', 'FINANCE', true)).toBe(true);
    expect(canAccessBusinessModule(module, 'ENTERPRISE', 'FACTORY', true)).toBe(false);
    expect(canAccessBusinessModule(module, 'PROFESSIONAL', 'FINANCE', true)).toBe(false);
    expect(canAccessBusinessModule(module, 'ENTERPRISE', 'FINANCE', false)).toBe(false);
  });

  it('requires an active tenant and a membership matching the authenticated user', () => {
    const organization = { orgId: 'org-a', status: 'ACTIVE' as const };
    const member = { orgId: 'org-a', userId: 'user-a', isActive: true };
    expect(canUseTenantContext(organization, member, 'user-a')).toBe(true);
    expect(canUseTenantContext(organization, member, 'user-b')).toBe(false);
    expect(canUseTenantContext({ ...organization, status: 'SUSPENDED' }, member, 'user-a')).toBe(false);
    expect(canUseTenantContext(organization, { ...member, isActive: false }, 'user-a')).toBe(false);
  });
});
