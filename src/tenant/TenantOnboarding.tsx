/**
 * tenant/TenantOnboarding.tsx — Self-service tenant registration flow
 *
 * Steps:
 * 1. Organization info (name, industry)
 * 2. Admin user details (already logged in via Supabase Auth)
 * 3. Plan selection
 * 4. Workspace setup (locale, prefix, etc.)
 * 5. Confirmation + redirect to dashboard
 *
 * Route: /onboarding
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { Organization, OrgMember, OrgPlan, OrgSettings } from './types';
import { generateOrgSlug, PLAN_LIMITS } from './types';
import { useTenantStore } from './tenantStore';

// ============================================================================
// Step Types
// ============================================================================

type OnboardingStep = 'org_info' | 'plan_select' | 'workspace_setup' | 'confirmation';

interface OrgInfoForm {
  name: string;
  industry: string;
  phone: string;
  address: string;
}

interface WorkspaceForm {
  locale: string;
  currency: string;
  timezone: string;
  jobCodePrefix: string;
  quotationPrefix: string;
}

// ============================================================================
// Component
// ============================================================================

export interface TenantOnboardingProps {
  /** Current user (from Supabase Auth) */
  userId: string;
  userEmail: string;
  userDisplayName: string;
  /** Callback after onboarding completes */
  onComplete: (org: Organization) => void;
}

export function TenantOnboarding({ userId, userEmail, userDisplayName, onComplete }: TenantOnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('org_info');
  const [orgInfo, setOrgInfo] = useState<OrgInfoForm>({ name: '', industry: '', phone: '', address: '' });
  const [selectedPlan, setSelectedPlan] = useState<OrgPlan>('STARTER');
  const [workspace, setWorkspace] = useState<WorkspaceForm>({
    locale: 'th-TH',
    currency: 'THB',
    timezone: 'Asia/Bangkok',
    jobCodePrefix: '',
    quotationPrefix: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const store = useTenantStore();

  // Generate slug from name
  const slug = useMemo(() => generateOrgSlug(orgInfo.name), [orgInfo.name]);

  // Prefix default from name
  const defaultPrefix = useMemo(() => {
    return orgInfo.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 4) || 'ORG';
  }, [orgInfo.name]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleOrgInfoNext = useCallback(() => {
    if (!orgInfo.name.trim()) return;
    setWorkspace((w) => ({
      ...w,
      jobCodePrefix: w.jobCodePrefix || defaultPrefix,
      quotationPrefix: w.quotationPrefix || defaultPrefix,
    }));
    setStep('plan_select');
  }, [orgInfo.name, defaultPrefix]);

  const handlePlanNext = useCallback(() => {
    setStep('workspace_setup');
  }, []);

  const handleWorkspaceNext = useCallback(() => {
    setStep('confirmation');
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const limits = PLAN_LIMITS[selectedPlan];

      const org: Organization = {
        orgId: crypto.randomUUID(),
        name: orgInfo.name.trim(),
        slug,
        plan: selectedPlan,
        status: selectedPlan === 'FREE' ? 'ACTIVE' : 'TRIAL',
        maxUsers: limits.maxUsers,
        maxJobsPerMonth: limits.maxJobsPerMonth,
        settings: {
          locale: workspace.locale,
          currency: workspace.currency,
          timezone: workspace.timezone,
          enableCurvedPanels: limits.features.includes('curved_panels'),
          enableNesting: limits.features.includes('nesting'),
          enableDxfExport: limits.features.includes('dxf_export'),
          quotationPrefix: workspace.quotationPrefix || defaultPrefix,
          jobCodePrefix: workspace.jobCodePrefix || defaultPrefix,
        },
        createdAt: now,
        updatedAt: now,
        trialEndsAt: selectedPlan !== 'FREE'
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
      };

      const member: OrgMember = {
        memberId: crypto.randomUUID(),
        orgId: org.orgId,
        userId,
        email: userEmail,
        displayName: userDisplayName,
        role: 'OWNER',
        isActive: true,
        joinedAt: now,
      };

      // In production: POST to /api/orgs + Supabase insert
      // For now: set in store directly
      store.setCurrentOrg(org, member);
      store.setUserOrgs([org]);
      store.setMembers([member]);

      onComplete(org);
    } finally {
      setIsSubmitting(false);
    }
  }, [orgInfo, selectedPlan, workspace, slug, userId, userEmail, userDisplayName, defaultPrefix, store, onComplete]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {(['org_info', 'plan_select', 'workspace_setup', 'confirmation'] as OnboardingStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step === s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Step 1: Org Info */}
        {step === 'org_info' && (
          <div data-testid="step-org-info">
            <h2 className="text-2xl font-bold mb-2">สร้างองค์กรใหม่</h2>
            <p className="text-gray-500 mb-6">ตั้งค่าบริษัทของคุณบนแพลตฟอร์ม MONOLITH</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อบริษัท *</label>
                <input
                  type="text"
                  className="w-full border rounded-lg p-3"
                  placeholder="เช่น DAPH Decor"
                  value={orgInfo.name}
                  onChange={(e) => setOrgInfo({ ...orgInfo, name: e.target.value })}
                  data-testid="org-name-input"
                />
                {slug && <p className="text-xs text-gray-400 mt-1">URL: monolith.app/{slug}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ประเภทธุรกิจ</label>
                <select
                  className="w-full border rounded-lg p-3"
                  value={orgInfo.industry}
                  onChange={(e) => setOrgInfo({ ...orgInfo, industry: e.target.value })}
                >
                  <option value="">เลือก...</option>
                  <option value="furniture">เฟอร์นิเจอร์ / ตกแต่งภายใน</option>
                  <option value="kitchen">ครัว / Kitchen</option>
                  <option value="joinery">งานไม้ / Joinery</option>
                  <option value="signage">ป้าย / Signage</option>
                  <option value="metalwork">งานโลหะ / Metalwork</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เบอร์โทร</label>
                <input
                  type="tel"
                  className="w-full border rounded-lg p-3"
                  placeholder="02-xxx-xxxx"
                  value={orgInfo.phone}
                  onChange={(e) => setOrgInfo({ ...orgInfo, phone: e.target.value })}
                />
              </div>
            </div>

            <button
              className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              onClick={handleOrgInfoNext}
              disabled={!orgInfo.name.trim()}
              data-testid="next-btn"
            >
              ถัดไป →
            </button>
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 'plan_select' && (
          <div data-testid="step-plan-select">
            <h2 className="text-2xl font-bold mb-2">เลือกแพลนที่เหมาะกับคุณ</h2>
            <p className="text-gray-500 mb-6">ทดลองใช้ฟรี 14 วัน สำหรับแพลนที่มีค่าบริการ</p>

            <div className="grid grid-cols-2 gap-4">
              {(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as OrgPlan[]).map((plan) => {
                const limits = PLAN_LIMITS[plan];
                return (
                  <button
                    key={plan}
                    className={`p-4 border-2 rounded-xl text-left transition ${
                      selectedPlan === plan ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedPlan(plan)}
                    data-testid={`plan-${plan.toLowerCase()}`}
                  >
                    <div className="font-bold text-lg">{plan}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      สูงสุด {limits.maxUsers} ผู้ใช้ / {limits.maxJobsPerMonth} งาน/เดือน
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      {limits.features.length} ฟีเจอร์
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button className="flex-1 border py-3 rounded-lg" onClick={() => setStep('org_info')}>
                ← ย้อนกลับ
              </button>
              <button
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                onClick={handlePlanNext}
                data-testid="next-btn"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Workspace Setup */}
        {step === 'workspace_setup' && (
          <div data-testid="step-workspace-setup">
            <h2 className="text-2xl font-bold mb-2">ตั้งค่า Workspace</h2>
            <p className="text-gray-500 mb-6">กำหนดค่าเริ่มต้นสำหรับการทำงาน</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">ภาษา</label>
                  <select
                    className="w-full border rounded-lg p-3"
                    value={workspace.locale}
                    onChange={(e) => setWorkspace({ ...workspace, locale: e.target.value })}
                  >
                    <option value="th-TH">ไทย</option>
                    <option value="en-US">English</option>
                    <option value="zh-CN">中文</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">สกุลเงิน</label>
                  <select
                    className="w-full border rounded-lg p-3"
                    value={workspace.currency}
                    onChange={(e) => setWorkspace({ ...workspace, currency: e.target.value })}
                  >
                    <option value="THB">฿ บาท (THB)</option>
                    <option value="USD">$ Dollar (USD)</option>
                    <option value="EUR">€ Euro (EUR)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <select
                  className="w-full border rounded-lg p-3"
                  value={workspace.timezone}
                  onChange={(e) => setWorkspace({ ...workspace, timezone: e.target.value })}
                >
                  <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                  <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                  <option value="America/New_York">America/New_York (GMT-5)</option>
                  <option value="Europe/London">Europe/London (GMT+0)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Prefix รหัสงาน</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-3"
                    placeholder="เช่น DAPH"
                    value={workspace.jobCodePrefix}
                    onChange={(e) => setWorkspace({ ...workspace, jobCodePrefix: e.target.value.toUpperCase() })}
                    maxLength={6}
                    data-testid="job-prefix-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prefix ใบเสนอราคา</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-3"
                    placeholder="เช่น QT"
                    value={workspace.quotationPrefix}
                    onChange={(e) => setWorkspace({ ...workspace, quotationPrefix: e.target.value.toUpperCase() })}
                    maxLength={6}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="flex-1 border py-3 rounded-lg" onClick={() => setStep('plan_select')}>
                ← ย้อนกลับ
              </button>
              <button
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                onClick={handleWorkspaceNext}
                data-testid="next-btn"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirmation' && (
          <div data-testid="step-confirmation">
            <h2 className="text-2xl font-bold mb-2">ยืนยันการสร้างองค์กร</h2>
            <p className="text-gray-500 mb-6">ตรวจสอบข้อมูลก่อนเริ่มใช้งาน</p>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ชื่อบริษัท</span>
                <span className="font-medium">{orgInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">URL</span>
                <span className="font-mono text-xs">monolith.app/{slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">แพลน</span>
                <span className="font-medium">{selectedPlan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ภาษา / สกุลเงิน</span>
                <span>{workspace.locale} / {workspace.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Prefix งาน</span>
                <span className="font-mono">{workspace.jobCodePrefix || defaultPrefix}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Admin</span>
                <span>{userEmail}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="flex-1 border py-3 rounded-lg" onClick={() => setStep('workspace_setup')}>
                ← แก้ไข
              </button>
              <button
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="confirm-btn"
              >
                {isSubmitting ? 'กำลังสร้าง...' : '✓ สร้างองค์กร'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
