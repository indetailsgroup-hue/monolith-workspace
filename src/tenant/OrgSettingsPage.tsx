/**
 * tenant/OrgSettingsPage.tsx — Organization Settings with Member Management
 *
 * Tabs:
 * 1. General — org name, logo, branding
 * 2. Members — list, invite, role change, remove
 * 3. Workspace — locale, currency, timezone, prefixes
 * 4. Billing — link to BillingPage
 *
 * Route: /settings
 */

import React, { useState, useCallback } from 'react';
import type { OrgMember, OrgRole, OrgInvitation } from './types';
import { ORG_ROLE_HIERARCHY, isOwnerOrAdmin } from './types';
import { useTenantStore } from './tenantStore';

// ============================================================================
// Settings Tab Type
// ============================================================================

type SettingsTab = 'general' | 'members' | 'workspace';

// ============================================================================
// Main Component
// ============================================================================

export function OrgSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { currentOrg, currentMember } = useTenantStore();

  if (!currentOrg || !currentMember) {
    return <div className="p-8 text-gray-500">กรุณาเข้าสู่ระบบ</div>;
  }

  if (!isOwnerOrAdmin(currentMember)) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg">⚠️ ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm mt-2">เฉพาะ Owner และ Admin เท่านั้นที่สามารถจัดการการตั้งค่าได้</p>
      </div>
    );
  }

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'ทั่วไป' },
    { key: 'members', label: 'สมาชิก' },
    { key: 'workspace', label: 'Workspace' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6" data-testid="org-settings-page">
      <h1 className="text-2xl font-bold mb-6">ตั้งค่าองค์กร</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && <GeneralSettingsTab />}
      {activeTab === 'members' && <MembersTab />}
      {activeTab === 'workspace' && <WorkspaceSettingsTab />}
    </div>
  );
}

// ============================================================================
// General Settings Tab
// ============================================================================

function GeneralSettingsTab() {
  const { currentOrg, updateSettings } = useTenantStore();
  const [name, setName] = useState(currentOrg?.name || '');
  const [saved, setSaved] = useState(false);

  if (!currentOrg) return null;

  const handleSave = () => {
    // In production: PATCH /api/orgs/:orgId
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6" data-testid="general-settings">
      <div>
        <label className="block text-sm font-medium mb-1">ชื่อองค์กร</label>
        <input
          type="text"
          className="w-full border rounded-lg p-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="org-name-input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Slug (URL)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">monolith.app/</span>
          <input
            type="text"
            className="flex-1 border rounded-lg p-3 bg-gray-50"
            value={currentOrg.slug}
            disabled
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Logo URL</label>
        <input
          type="url"
          className="w-full border rounded-lg p-3"
          placeholder="https://..."
          defaultValue={currentOrg.logoUrl || ''}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Primary Color</label>
        <input
          type="color"
          className="w-16 h-10 border rounded"
          defaultValue={currentOrg.primaryColor || '#3b82f6'}
        />
      </div>
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700"
        data-testid="save-general-btn"
      >
        {saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
      </button>
    </div>
  );
}

// ============================================================================
// Members Tab — List + Invite + Role Management
// ============================================================================

function MembersTab() {
  const { members, invitations, currentMember, currentOrg, addMember, removeMember, updateMemberRole, createInvitation, revokeInvitation } = useTenantStore();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('DESIGNER');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (!currentOrg || !currentMember) return null;

  const handleInvite = useCallback(() => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) return;

    const invitation: OrgInvitation = {
      inviteId: crypto.randomUUID(),
      orgId: currentOrg.orgId,
      email: inviteEmail.trim(),
      role: inviteRole,
      status: 'PENDING',
      invitedBy: currentMember.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      token: crypto.randomUUID(),
    };

    createInvitation(invitation);
    setInviteEmail('');
    setShowInviteForm(false);
  }, [inviteEmail, inviteRole, currentOrg, currentMember, createInvitation]);

  const handleRemoveMember = useCallback((memberId: string) => {
    removeMember(memberId);
    setConfirmRemove(null);
  }, [removeMember]);

  const allRoles: OrgRole[] = ['OWNER', 'ADMIN', 'DESIGNER', 'FACTORY', 'INSTALLER', 'FINANCE', 'VIEWER'];
  const assignableRoles = allRoles.filter((r) => ORG_ROLE_HIERARCHY[r] < ORG_ROLE_HIERARCHY[currentMember.role]);

  return (
    <div data-testid="members-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {members.length} สมาชิก (สูงสุด {currentOrg.maxUsers})
        </p>
        <button
          onClick={() => setShowInviteForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          data-testid="invite-btn"
        >
          + เชิญสมาชิก
        </button>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4" data-testid="invite-form">
          <h4 className="font-medium mb-3">เชิญสมาชิกใหม่</h4>
          <div className="flex gap-3">
            <input
              type="email"
              className="flex-1 border rounded-lg p-2.5 text-sm"
              placeholder="email@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              data-testid="invite-email-input"
            />
            <select
              className="border rounded-lg p-2.5 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              data-testid="invite-role-select"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.includes('@')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              data-testid="send-invite-btn"
            >
              ส่งคำเชิญ
            </button>
            <button
              onClick={() => setShowInviteForm(false)}
              className="border px-3 py-2 rounded-lg text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="border rounded-lg divide-y" data-testid="members-list">
        {members.map((member) => (
          <div key={member.memberId} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{member.displayName || member.email}</p>
              <p className="text-sm text-gray-400">{member.email}</p>
            </div>
            <div className="flex items-center gap-3">
              {member.memberId === currentMember.memberId ? (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">คุณ</span>
              ) : null}
              <select
                className="border rounded p-1.5 text-sm"
                value={member.role}
                onChange={(e) => updateMemberRole(member.memberId, e.target.value as OrgRole)}
                disabled={member.role === 'OWNER' || member.memberId === currentMember.memberId}
                data-testid={`role-select-${member.memberId}`}
              >
                {allRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {member.role !== 'OWNER' && member.memberId !== currentMember.memberId && (
                <>
                  {confirmRemove === member.memberId ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRemoveMember(member.memberId)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded"
                        data-testid={`confirm-remove-${member.memberId}`}
                      >
                        ยืนยัน
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs border px-2 py-1 rounded"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(member.memberId)}
                      className="text-xs text-red-500 hover:text-red-700"
                      data-testid={`remove-btn-${member.memberId}`}
                    >
                      ลบ
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">ยังไม่มีสมาชิก</div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.filter((i) => i.status === 'PENDING').length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-3 text-sm">คำเชิญที่รอการตอบรับ</h4>
          <div className="border rounded-lg divide-y" data-testid="invitations-list">
            {invitations
              .filter((i) => i.status === 'PENDING')
              .map((inv) => (
                <div key={inv.inviteId} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm">{inv.email}</p>
                    <p className="text-xs text-gray-400">Role: {inv.role} | หมดอายุ: {new Date(inv.expiresAt).toLocaleDateString('th-TH')}</p>
                  </div>
                  <button
                    onClick={() => revokeInvitation(inv.inviteId)}
                    className="text-xs text-red-500 hover:text-red-700"
                    data-testid={`revoke-${inv.inviteId}`}
                  >
                    ยกเลิก
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Workspace Settings Tab
// ============================================================================

function WorkspaceSettingsTab() {
  const { currentOrg, updateSettings } = useTenantStore();
  const [saved, setSaved] = useState(false);
  const [locale, setLocale] = useState(currentOrg?.settings.locale || 'th-TH');
  const [currency, setCurrency] = useState(currentOrg?.settings.currency || 'THB');
  const [timezone, setTimezone] = useState(currentOrg?.settings.timezone || 'Asia/Bangkok');
  const [jobPrefix, setJobPrefix] = useState(currentOrg?.settings.jobCodePrefix || '');
  const [quotationPrefix, setQuotationPrefix] = useState(currentOrg?.settings.quotationPrefix || '');

  if (!currentOrg) return null;

  const handleSave = () => {
    updateSettings({
      locale,
      currency,
      timezone,
      jobCodePrefix: jobPrefix,
      quotationPrefix,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6" data-testid="workspace-settings">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">ภาษา</label>
          <select className="w-full border rounded-lg p-3" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="th-TH">ไทย</option>
            <option value="en-US">English</option>
            <option value="zh-CN">中文</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">สกุลเงิน</label>
          <select className="w-full border rounded-lg p-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="THB">฿ บาท (THB)</option>
            <option value="USD">$ Dollar (USD)</option>
            <option value="EUR">€ Euro (EUR)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Timezone</label>
        <select className="w-full border rounded-lg p-3" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
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
            value={jobPrefix}
            onChange={(e) => setJobPrefix(e.target.value.toUpperCase())}
            maxLength={6}
            data-testid="job-prefix-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prefix ใบเสนอราคา</label>
          <input
            type="text"
            className="w-full border rounded-lg p-3"
            value={quotationPrefix}
            onChange={(e) => setQuotationPrefix(e.target.value.toUpperCase())}
            maxLength={6}
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700"
        data-testid="save-workspace-btn"
      >
        {saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
      </button>
    </div>
  );
}
