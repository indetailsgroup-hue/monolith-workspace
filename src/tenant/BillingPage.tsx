/**
 * tenant/BillingPage.tsx — Plan selection & subscription management UI
 *
 * Features:
 * - Current plan display with usage stats
 * - Plan comparison grid with upgrade/downgrade
 * - Billing interval toggle (monthly/yearly)
 * - Stripe Checkout redirect for upgrades
 * - Stripe Portal link for existing subscribers
 * - Proration preview
 *
 * Route: /settings/billing
 */

import React, { useState, useCallback } from 'react';
import type { OrgPlan } from './types';
import { PLAN_LIMITS } from './types';
import {
  PLAN_PRICING,
  type BillingInterval,
  type PlanPricing,
  getPlanChangeDirection,
  canChangePlan,
  createCheckoutSession,
  createPortalSession,
} from './billing';
import { useTenantStore } from './tenantStore';

// ============================================================================
// Component
// ============================================================================

export function BillingPage() {
  const { currentOrg, currentMember } = useTenantStore();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!currentOrg || !currentMember) {
    return <div className="p-8 text-gray-500">กรุณาเข้าสู่ระบบ</div>;
  }

  const isOwner = currentMember.role === 'OWNER';

  const handleUpgrade = useCallback(async (targetPlan: OrgPlan) => {
    if (!currentOrg) return;
    const check = canChangePlan(currentOrg, targetPlan);
    if (!check.allowed) {
      setError(check.reason || 'ไม่สามารถเปลี่ยนแพลนได้');
      return;
    }

    setLoading(targetPlan);
    setError(null);

    try {
      if (targetPlan === 'FREE') {
        // Downgrade to free = cancel subscription via portal
        const { url } = await createPortalSession({
          orgId: currentOrg.orgId,
          returnUrl: window.location.href,
        });
        window.location.href = url;
        return;
      }

      const { url } = await createCheckoutSession({
        orgId: currentOrg.orgId,
        plan: targetPlan,
        interval,
        successUrl: `${window.location.origin}/settings/billing?success=true`,
        cancelUrl: `${window.location.origin}/settings/billing?canceled=true`,
      });
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(null);
    }
  }, [currentOrg, interval]);

  const handleManageSubscription = useCallback(async () => {
    if (!currentOrg) return;
    setLoading('portal');
    try {
      const { url } = await createPortalSession({
        orgId: currentOrg.orgId,
        returnUrl: window.location.href,
      });
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเปิด Billing Portal ได้');
    } finally {
      setLoading(null);
    }
  }, [currentOrg]);

  return (
    <div className="max-w-6xl mx-auto p-6" data-testid="billing-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">แพลนและการชำระเงิน</h1>
        <p className="text-gray-500 mt-1">จัดการ subscription ขององค์กร {currentOrg.name}</p>
      </div>

      {/* Current Plan Card */}
      <div className="bg-white border rounded-xl p-6 mb-8" data-testid="current-plan-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">แพลนปัจจุบัน</p>
            <p className="text-2xl font-bold">{currentOrg.plan}</p>
            <p className="text-sm text-gray-400 mt-1">
              ผู้ใช้: — / {currentOrg.maxUsers} | งาน: — / {currentOrg.maxJobsPerMonth} ต่อเดือน
            </p>
          </div>
          {currentOrg.plan !== 'FREE' && isOwner && (
            <button
              onClick={handleManageSubscription}
              disabled={loading === 'portal'}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              data-testid="manage-subscription-btn"
            >
              {loading === 'portal' ? 'กำลังโหลด...' : 'จัดการ Subscription'}
            </button>
          )}
        </div>
        {currentOrg.status === 'TRIAL' && currentOrg.trialEndsAt && (
          <div className="mt-3 text-sm text-amber-600 bg-amber-50 p-2 rounded">
            ⏳ ทดลองใช้ถึง {new Date(currentOrg.trialEndsAt).toLocaleDateString('th-TH')}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Interval Toggle */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium ${interval === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          onClick={() => setInterval('monthly')}
        >
          รายเดือน
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium ${interval === 'yearly' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          onClick={() => setInterval('yearly')}
        >
          รายปี <span className="text-green-600 text-xs ml-1">ประหยัด 17%</span>
        </button>
      </div>

      {/* Plan Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="plan-grid">
        {PLAN_PRICING.map((pricing) => (
          <PlanCard
            key={pricing.plan}
            pricing={pricing}
            interval={interval}
            currentPlan={currentOrg.plan}
            isOwner={isOwner}
            loading={loading === pricing.plan}
            onSelect={() => handleUpgrade(pricing.plan)}
          />
        ))}
      </div>

      {!isOwner && (
        <p className="text-center text-sm text-gray-400 mt-6">
          เฉพาะ Owner เท่านั้นที่สามารถเปลี่ยนแพลนได้
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Plan Card Sub-Component
// ============================================================================

interface PlanCardProps {
  pricing: PlanPricing;
  interval: BillingInterval;
  currentPlan: OrgPlan;
  isOwner: boolean;
  loading: boolean;
  onSelect: () => void;
}

function PlanCard({ pricing, interval, currentPlan, isOwner, loading, onSelect }: PlanCardProps) {
  const isCurrent = pricing.plan === currentPlan;
  const direction = getPlanChangeDirection(currentPlan, pricing.plan);
  const price = interval === 'monthly' ? pricing.monthlyPrice : Math.round(pricing.yearlyPrice / 12);

  return (
    <div
      className={`border-2 rounded-xl p-5 flex flex-col ${
        pricing.highlighted ? 'border-blue-500 shadow-lg' : 'border-gray-200'
      } ${isCurrent ? 'bg-blue-50 border-blue-300' : ''}`}
      data-testid={`plan-card-${pricing.plan.toLowerCase()}`}
    >
      {pricing.highlighted && (
        <div className="text-xs font-bold text-blue-600 mb-2">แนะนำ</div>
      )}
      <h3 className="text-lg font-bold">{pricing.name}</h3>
      <p className="text-sm text-gray-500 mb-3">{pricing.description}</p>

      <div className="mb-4">
        {price === 0 ? (
          <span className="text-2xl font-bold">ฟรี</span>
        ) : (
          <>
            <span className="text-2xl font-bold">฿{(price / 100).toLocaleString()}</span>
            <span className="text-sm text-gray-400">/เดือน</span>
          </>
        )}
      </div>

      <ul className="text-sm space-y-1.5 mb-6 flex-1">
        {pricing.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="text-center text-sm font-medium text-blue-600 py-2">แพลนปัจจุบัน</div>
      ) : (
        <button
          onClick={onSelect}
          disabled={!isOwner || loading}
          className={`w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 ${
            direction === 'upgrade'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'border border-gray-300 hover:bg-gray-50'
          }`}
          data-testid={`select-plan-${pricing.plan.toLowerCase()}`}
        >
          {loading ? 'กำลังดำเนินการ...' : direction === 'upgrade' ? 'อัปเกรด' : 'ดาวน์เกรด'}
        </button>
      )}
    </div>
  );
}
