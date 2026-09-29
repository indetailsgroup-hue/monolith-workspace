/**
 * src/jobs/ProcessTemplateList.tsx
 *
 * MONOLITH v17.0 — Process Templates List UI
 *
 * Features:
 *  - Category filter dropdown
 *  - Active/global toggle
 *  - Search input (debounced 300ms)
 *  - Plan gate badge (STARTER / PROFESSIONAL)
 *  - Template cards showing stage count, estimated hours, category icon
 *  - Clone global template action (creates org-specific copy)
 *  - Empty state & loading skeleton
 *
 * Plan Gate: STARTER+ required to view templates
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useProcessTemplateStore } from './processTemplateStore';
import {
  JOB_TEMPLATE_CATEGORY_LABELS,
  JOB_TEMPLATE_CATEGORY_ICONS,
  meetsplanGate,
  type JobTemplateCategory,
  type JobTemplateSummary,
} from './processTemplateTypes';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessTemplateListProps {
  orgId: string;
  orgPlan: OrgPlan;
  /** Called when a template card is selected for viewing / editing */
  onSelectTemplate?: (template: JobTemplateSummary) => void;
  /** Called when user requests "Apply to Job" */
  onApplyTemplate?: (template: JobTemplateSummary) => void;
  /** Show admin actions (clone, delete) — ADMIN+ only */
  isAdmin?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const PLAN_GATE_BADGE_CLASSES: Record<string, string> = {
  FREE:         'bg-gray-100 text-gray-600',
  STARTER:      'bg-blue-100 text-blue-700',
  PROFESSIONAL: 'bg-indigo-100 text-indigo-700',
  ENTERPRISE:   'bg-purple-100 text-purple-700',
};

function PlanGateBadge({ planGate }: { planGate: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_GATE_BADGE_CLASSES[planGate] ?? 'bg-gray-100 text-gray-600'}`}
      data-testid="plan-gate-badge"
    >
      {planGate}+
    </span>
  );
}

function SkeletonCard() {
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse"
      data-testid="template-skeleton"
    >
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/4" />
    </div>
  );
}

// ============================================================================
// TEMPLATE CARD
// ============================================================================

interface TemplateCardProps {
  template: JobTemplateSummary;
  orgPlan: OrgPlan;
  isAdmin: boolean;
  onSelect: (t: JobTemplateSummary) => void;
  onApply: (t: JobTemplateSummary) => void;
  onClone: (t: JobTemplateSummary) => void;
}

function TemplateCard({
  template,
  orgPlan,
  isAdmin,
  onSelect,
  onApply,
  onClone,
}: TemplateCardProps) {
  const canUse = meetsplanGate(orgPlan, template.planGate);
  const icon = JOB_TEMPLATE_CATEGORY_ICONS[template.category] ?? '📋';
  const categoryLabel = JOB_TEMPLATE_CATEGORY_LABELS[template.category] ?? template.category;

  return (
    <div
      className={`bg-white border rounded-lg p-4 transition-shadow ${
        canUse
          ? 'border-gray-200 hover:shadow-md cursor-pointer'
          : 'border-gray-100 opacity-60 cursor-not-allowed'
      }`}
      data-testid="template-card"
      data-template-id={template.id}
      onClick={() => canUse && onSelect(template)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
          <span
            className="font-medium text-gray-900 truncate"
            data-testid="template-name"
          >
            {template.name}
          </span>
        </div>
        <PlanGateBadge planGate={template.planGate} />
      </div>

      {/* Category + global tag */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">{categoryLabel}</span>
        {template.isGlobal && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700"
            data-testid="global-badge"
          >
            Global
          </span>
        )}
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        {template.estimatedTotalHours != null && (
          <span data-testid="estimated-hours">
            ⏱ {template.estimatedTotalHours} ชม.
          </span>
        )}
        <span>v{template.version}</span>
      </div>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Plan gate warning */}
      {!canUse && (
        <p className="text-xs text-indigo-600 font-medium mb-2">
          ต้องการแผน {template.planGate}+ เพื่อใช้ template นี้
        </p>
      )}

      {/* Actions */}
      {canUse && (
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            className="flex-1 text-sm text-center py-1.5 px-3 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            data-testid="apply-template-btn"
            onClick={(e) => {
              e.stopPropagation();
              onApply(template);
            }}
          >
            ใช้ Template นี้
          </button>
          {isAdmin && template.isGlobal && (
            <button
              type="button"
              className="text-sm py-1.5 px-3 border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition-colors"
              data-testid="clone-template-btn"
              title="Clone เป็น template ขององค์กร"
              onClick={(e) => {
                e.stopPropagation();
                onClone(template);
              }}
            >
              Clone
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProcessTemplateList({
  orgId,
  orgPlan,
  onSelectTemplate,
  onApplyTemplate,
  isAdmin = false,
}: ProcessTemplateListProps) {
  const { templates, filters, isLoading, error, fetchTemplates, setFilters, cloneGlobalTemplate, clearError } =
    useProcessTemplateStore();

  // ── Search debounce ─────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setFilters({ search: value });
      }, 300);
    },
    [setFilters]
  );

  // ── Initial load + filter-triggered refetch ──────────────────────────────
  useEffect(() => {
    if (meetsplanGate(orgPlan, 'STARTER')) {
      fetchTemplates(orgId, filters);
    }
  }, [orgId, orgPlan, filters, fetchTemplates]);

  // ── Clone handler ────────────────────────────────────────────────────────
  const handleClone = useCallback(
    async (template: JobTemplateSummary) => {
      try {
        await cloneGlobalTemplate(template.id, orgId);
      } catch (err) {
        console.error('Clone failed:', err);
      }
    },
    [cloneGlobalTemplate, orgId]
  );

  // ── Plan gate guard ──────────────────────────────────────────────────────
  if (!meetsplanGate(orgPlan, 'STARTER')) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="plan-gate-wall"
      >
        <span className="text-4xl mb-4">🔒</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Process Templates ต้องการแผน STARTER+
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          อัปเกรดแผนเพื่อสร้างและใช้ Job Templates สำหรับสายการผลิตของคุณ
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="process-template-list">
      {/* ── Filters bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="search"
            placeholder="ค้นหา template…"
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            data-testid="template-search-input"
          />
        </div>

        {/* Category filter */}
        <select
          value={filters.category ?? ''}
          onChange={(e) =>
            setFilters({ category: (e.target.value as JobTemplateCategory) || null })
          }
          className="py-2 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          data-testid="category-filter"
        >
          <option value="">ทุกหมวดหมู่</option>
          {(Object.keys(JOB_TEMPLATE_CATEGORY_LABELS) as JobTemplateCategory[]).map((cat) => (
            <option key={cat} value={cat}>
              {JOB_TEMPLATE_CATEGORY_ICONS[cat]} {JOB_TEMPLATE_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        {/* Global filter */}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.isGlobal ?? false}
            onChange={(e) => setFilters({ isGlobal: e.target.checked || undefined })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            data-testid="global-filter-checkbox"
          />
          Global เท่านั้น
        </label>

        {/* Result count */}
        <span className="text-sm text-gray-400 ml-auto">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
          data-testid="error-banner"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-red-500 hover:text-red-700 ml-4"
            aria-label="ปิด error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {isLoading && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="template-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── Template grid ────────────────────────────────────────────────── */}
      {!isLoading && templates.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="template-grid"
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              orgPlan={orgPlan}
              isAdmin={isAdmin}
              onSelect={onSelectTemplate ?? (() => {})}
              onApply={onApplyTemplate ?? (() => {})}
              onClone={handleClone}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && templates.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="template-empty-state"
        >
          <span className="text-4xl mb-4">📋</span>
          <h3 className="text-base font-medium text-gray-700 mb-1">
            ยังไม่มี Process Templates
          </h3>
          <p className="text-sm text-gray-400">
            {filters.category
              ? `ไม่พบ template ในหมวดหมู่ "${JOB_TEMPLATE_CATEGORY_LABELS[filters.category]}"`
              : 'สร้าง template แรกของคุณ หรือ clone จาก Global Templates'}
          </p>
        </div>
      )}
    </div>
  );
}

export default ProcessTemplateList;
