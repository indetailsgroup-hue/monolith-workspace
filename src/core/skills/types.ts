/**
 * Skills System - Type Definitions
 *
 * Simple, deterministic skills for cabinet manufacturing.
 * No AI required - just predefined workflows.
 *
 * @version 1.0.0
 */

import type { Cabinet } from '../types/Cabinet';

// ============================================
// SKILL CONTEXT
// ============================================

export interface SkillContext {
  /** Active cabinet being processed */
  cabinet?: Cabinet;
  /** All cabinets in the project */
  cabinets?: Cabinet[];
  /** Project metadata */
  projectId?: string;
  /** Additional parameters */
  params?: Record<string, unknown>;
}

// ============================================
// SKILL RESULT
// ============================================

export type SkillStatus = 'success' | 'warning' | 'error';

export interface SkillIssue {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  /** Which component has the issue */
  location?: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface SkillResult<T = unknown> {
  status: SkillStatus;
  data?: T;
  issues: SkillIssue[];
  /** Execution time in ms */
  duration: number;
  /** Summary message */
  summary: string;
}

// ============================================
// SKILL DEFINITION
// ============================================

export interface Skill<TInput = SkillContext, TOutput = unknown> {
  /** Unique skill ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category for grouping */
  category: 'verify' | 'generate' | 'calculate' | 'export';
  /** Icon (emoji or icon name) */
  icon: string;
  /** Execute the skill */
  execute: (context: TInput) => Promise<SkillResult<TOutput>>;
}

// ============================================
// SKILL REGISTRY
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySkill = Skill<any, any>;

export interface SkillRegistry {
  skills: Map<string, AnySkill>;
  register: (skill: AnySkill) => void;
  get: (id: string) => AnySkill | undefined;
  execute: <T>(id: string, context: SkillContext) => Promise<SkillResult<T>>;
  list: () => AnySkill[];
  listByCategory: (category: Skill['category']) => AnySkill[];
}

// ============================================
// VERIFY SKILL TYPES
// ============================================

export interface VerifyResult {
  passed: boolean;
  checks: VerifyCheck[];
  score: number; // 0-100
}

export interface VerifyCheck {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// ============================================
// GENERATE SKILL TYPES
// ============================================

export interface CutListItem {
  partId: string;
  partName: string;
  material: string;
  thickness: number;
  width: number;
  height: number;
  quantity: number;
  edgeBanding: {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
  };
  grain: 'horizontal' | 'vertical' | 'none';
  notes?: string;
}

export interface CutListResult {
  items: CutListItem[];
  totalParts: number;
  totalArea: number; // mm²
  materials: Record<string, { count: number; area: number }>;
}

export interface BOMItem {
  sku: string;
  name: string;
  category: 'hardware' | 'material' | 'accessory';
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface BOMResult {
  items: BOMItem[];
  totalItems: number;
  estimatedCost?: number;
}
