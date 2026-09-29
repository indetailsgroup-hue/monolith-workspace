/**
 * tenant/TenantProvider.tsx — React context provider for multi-tenant scope
 *
 * Wraps the app and ensures all child components have access to:
 * - Current organization context
 * - Org-scoped data fetching
 * - Feature gates based on plan
 * - Role-based access within the org
 */

import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useTenantStore } from './tenantStore';
import type { Organization, OrgMember, TenantContext, TenantPermissions } from './types';

// ============================================================================
// Context
// ============================================================================

interface TenantContextValue {
  /** Current org (null if not loaded yet) */
  org: Organization | null;
  /** Current user's membership */
  member: OrgMember | null;
  /** Computed permissions */
  permissions: TenantPermissions;
  /** Full tenant context */
  tenantContext: TenantContext | null;
  /** Check feature access */
  hasFeature: (feature: string) => boolean;
  /** Check role */
  hasRole: (role: import('./types').OrgRole) => boolean;
  /** Is data loading */
  isLoading: boolean;
  /** Switch organization */
  switchOrg: (orgId: string) => void;
}

const TenantCtx = createContext<TenantContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface TenantProviderProps {
  children: ReactNode;
  /** Optional: override org for testing/storybook */
  overrideOrg?: Organization;
  overrideMember?: OrgMember;
}

export function TenantProvider({ children, overrideOrg, overrideMember }: TenantProviderProps) {
  const store = useTenantStore();

  // If overrides provided (test/storybook), set them
  useEffect(() => {
    if (overrideOrg && overrideMember) {
      store.setCurrentOrg(overrideOrg, overrideMember);
    }
  }, [overrideOrg, overrideMember]);

  const value = useMemo<TenantContextValue>(() => ({
    org: store.currentOrg,
    member: store.currentMember,
    permissions: store.getPermissions(),
    tenantContext: store.getTenantContext(),
    hasFeature: store.hasFeature,
    hasRole: store.hasRole,
    isLoading: store.isLoading,
    switchOrg: store.switchOrg,
  }), [
    store.currentOrg,
    store.currentMember,
    store.isLoading,
  ]);

  return (
    <TenantCtx.Provider value={value}>
      {children}
    </TenantCtx.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/** Access tenant context — throws if not within TenantProvider */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantCtx);
  if (!ctx) {
    throw new Error('useTenant must be used within <TenantProvider>');
  }
  return ctx;
}

/** Get current org ID or throw */
export function useOrgId(): string {
  const { org } = useTenant();
  if (!org) throw new Error('No organization selected');
  return org.orgId;
}

/** Feature gate hook — returns false if feature not in plan */
export function useFeatureGate(feature: string): boolean {
  const { hasFeature, org } = useTenant();
  if (!org) return false;
  return hasFeature(feature);
}

// ============================================================================
// Guard Component
// ============================================================================

interface OrgGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders children only when an org is loaded */
export function OrgGuard({ children, fallback }: OrgGuardProps) {
  const { org, isLoading } = useTenant();

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-gray-400">กำลังโหลด...</div>;
  }

  if (!org) {
    return fallback ? <>{fallback}</> : (
      <div className="flex items-center justify-center p-8 text-gray-500">
        กรุณาเลือกองค์กร
      </div>
    );
  }

  return <>{children}</>;
}

/** Renders children only if user has the feature in their plan */
export function FeatureGate({ feature, children, fallback }: { feature: string; children: ReactNode; fallback?: ReactNode }) {
  const available = useFeatureGate(feature);
  if (!available) {
    return fallback ? <>{fallback}</> : (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
        ฟีเจอร์นี้ไม่รวมอยู่ในแพลนปัจจุบัน — <a href="/settings/billing" className="underline">อัปเกรด</a>
      </div>
    );
  }
  return <>{children}</>;
}
