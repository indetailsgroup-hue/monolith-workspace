/**
 * src/training/__tests__/trainingTypes.test.ts
 *
 * MONOLITH v17.5 — Training Tracker module type tests
 * Framework: Vitest (pure TypeScript — no DOM required)
 *
 * Coverage:
 *  - canAccessTrainingTracker()     plan gate helper
 *  - TRAINING_PLAN_GATE             constant value
 *  - TRAINING_CATEGORY_LABELS       completeness (all 8 categories, Thai labels)
 *  - TRAINING_CATEGORY_ICONS        completeness (all 8 categories, emoji)
 *  - TRAINING_STATUS_LABELS         completeness (all 4 statuses, Thai labels)
 *  - TRAINING_STATUS_COLORS         completeness (all 4 statuses, valid hex)
 *  - DEFAULT_TRAINING_COURSE_FILTERS  defaults contract
 *  - DEFAULT_ENROLLMENT_FILTERS       defaults contract
 *  - Interface shape assertions     compile-time satisfies checks
 */

import { describe, it, expect } from 'vitest';
import {
  canAccessTrainingTracker,
  TRAINING_PLAN_GATE,
  TRAINING_CATEGORY_LABELS,
  TRAINING_CATEGORY_ICONS,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_COLORS,
  DEFAULT_TRAINING_COURSE_FILTERS,
  DEFAULT_ENROLLMENT_FILTERS,
  type TrainingCourseCategory,
  type TrainingStatus,
  type TrainingCourse,
  type TrainingEnrollment,
  type TrainingCompletion,
  type TrainingCourseFilters,
  type TrainingEnrollmentFilters,
} from '../trainingTypes';

// ============================================================================
// TRAINING_PLAN_GATE constant
// ============================================================================

describe('TRAINING_PLAN_GATE', () => {
  it('equals PROFESSIONAL', () => {
    expect(TRAINING_PLAN_GATE).toBe('PROFESSIONAL');
  });

  it('is a string literal type (not undefined)', () => {
    expect(typeof TRAINING_PLAN_GATE).toBe('string');
  });
});

// ============================================================================
// canAccessTrainingTracker
// ============================================================================

describe('canAccessTrainingTracker', () => {
  describe('plans that DO NOT meet PROFESSIONAL+', () => {
    it('returns false for FREE', () => {
      expect(canAccessTrainingTracker('FREE')).toBe(false);
    });

    it('returns false for STARTER', () => {
      expect(canAccessTrainingTracker('STARTER')).toBe(false);
    });
  });

  describe('plans that DO meet PROFESSIONAL+', () => {
    it('returns true for PROFESSIONAL', () => {
      expect(canAccessTrainingTracker('PROFESSIONAL')).toBe(true);
    });

    it('returns true for ENTERPRISE', () => {
      expect(canAccessTrainingTracker('ENTERPRISE')).toBe(true);
    });
  });

  it('is a pure function — same input always returns same output', () => {
    expect(canAccessTrainingTracker('PROFESSIONAL')).toBe(canAccessTrainingTracker('PROFESSIONAL'));
    expect(canAccessTrainingTracker('FREE')).toBe(canAccessTrainingTracker('FREE'));
  });
});

// ============================================================================
// TRAINING_CATEGORY_LABELS — completeness
// ============================================================================

const ALL_CATEGORIES: TrainingCourseCategory[] = [
  'SAFETY',
  'QUALITY',
  'TECHNICAL',
  'LEADERSHIP',
  'COMPLIANCE',
  'ONBOARDING',
  'AI_LITERACY',
  'CUSTOM',
];

describe('TRAINING_CATEGORY_LABELS', () => {
  it('has a label for every category (8 total)', () => {
    expect(Object.keys(TRAINING_CATEGORY_LABELS)).toHaveLength(8);
  });

  it('has a non-empty Thai label for each category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(TRAINING_CATEGORY_LABELS[cat], `missing label for ${cat}`)
        .toBeTruthy();
      expect(typeof TRAINING_CATEGORY_LABELS[cat]).toBe('string');
    }
  });

  it('covers exactly the defined categories (no missing, no extra)', () => {
    const keys = Object.keys(TRAINING_CATEGORY_LABELS).sort();
    expect(keys).toEqual([...ALL_CATEGORIES].sort());
  });

  it('AI_LITERACY label mentions AI', () => {
    expect(TRAINING_CATEGORY_LABELS['AI_LITERACY']).toMatch(/AI/i);
  });

  it('SAFETY label is in Thai', () => {
    // Thai character range U+0E00–U+0E7F
    expect(TRAINING_CATEGORY_LABELS['SAFETY']).toMatch(/[\u0E00-\u0E7F]/);
  });
});

// ============================================================================
// TRAINING_CATEGORY_ICONS — completeness
// ============================================================================

describe('TRAINING_CATEGORY_ICONS', () => {
  it('has an icon for every category (8 total)', () => {
    expect(Object.keys(TRAINING_CATEGORY_ICONS)).toHaveLength(8);
  });

  it('has a non-empty emoji string for each category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(TRAINING_CATEGORY_ICONS[cat], `missing icon for ${cat}`)
        .toBeTruthy();
      expect(typeof TRAINING_CATEGORY_ICONS[cat]).toBe('string');
    }
  });

  it('covers exactly the defined categories', () => {
    const keys = Object.keys(TRAINING_CATEGORY_ICONS).sort();
    expect(keys).toEqual([...ALL_CATEGORIES].sort());
  });

  it('AI_LITERACY icon is a robot emoji or similar', () => {
    // The emoji can be 🤖 or similar; just confirm it is non-empty
    expect(TRAINING_CATEGORY_ICONS['AI_LITERACY'].length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TRAINING_STATUS_LABELS — completeness
// ============================================================================

const ALL_STATUSES: TrainingStatus[] = [
  'ENROLLED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

describe('TRAINING_STATUS_LABELS', () => {
  it('has a label for every status (4 total)', () => {
    expect(Object.keys(TRAINING_STATUS_LABELS)).toHaveLength(4);
  });

  it('has a non-empty label for each status', () => {
    for (const s of ALL_STATUSES) {
      expect(TRAINING_STATUS_LABELS[s], `missing label for ${s}`)
        .toBeTruthy();
      expect(typeof TRAINING_STATUS_LABELS[s]).toBe('string');
    }
  });

  it('covers exactly the defined statuses', () => {
    const keys = Object.keys(TRAINING_STATUS_LABELS).sort();
    expect(keys).toEqual([...ALL_STATUSES].sort());
  });

  it('COMPLETED label is different from ENROLLED label', () => {
    expect(TRAINING_STATUS_LABELS['COMPLETED']).not.toBe(
      TRAINING_STATUS_LABELS['ENROLLED']
    );
  });
});

// ============================================================================
// TRAINING_STATUS_COLORS — completeness + hex format
// ============================================================================

describe('TRAINING_STATUS_COLORS', () => {
  it('has a color for every status (4 total)', () => {
    expect(Object.keys(TRAINING_STATUS_COLORS)).toHaveLength(4);
  });

  it('all colors are valid 6-digit hex strings', () => {
    for (const color of Object.values(TRAINING_STATUS_COLORS)) {
      expect(color, `invalid hex: ${color}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('covers exactly the defined statuses', () => {
    const keys = Object.keys(TRAINING_STATUS_COLORS).sort();
    expect(keys).toEqual([...ALL_STATUSES].sort());
  });

  it('COMPLETED color is different from CANCELLED color', () => {
    expect(TRAINING_STATUS_COLORS['COMPLETED']).not.toBe(
      TRAINING_STATUS_COLORS['CANCELLED']
    );
  });

  it('all status colors are unique', () => {
    const colors = Object.values(TRAINING_STATUS_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});

// ============================================================================
// DEFAULT_TRAINING_COURSE_FILTERS
// ============================================================================

describe('DEFAULT_TRAINING_COURSE_FILTERS', () => {
  it('has null category (no filter applied by default)', () => {
    expect(DEFAULT_TRAINING_COURSE_FILTERS.category).toBeNull();
  });

  it('has null requiredForStage (no stage filter by default)', () => {
    expect(DEFAULT_TRAINING_COURSE_FILTERS.requiredForStage).toBeNull();
  });

  it('has isActive = true (show active courses by default)', () => {
    expect(DEFAULT_TRAINING_COURSE_FILTERS.isActive).toBe(true);
  });

  it('has isGlobal = undefined (show both global + org by default)', () => {
    expect(DEFAULT_TRAINING_COURSE_FILTERS.isGlobal).toBeUndefined();
  });

  it('has empty search string by default', () => {
    expect(DEFAULT_TRAINING_COURSE_FILTERS.search).toBe('');
  });

  it('has exactly the expected keys', () => {
    const keys = Object.keys(DEFAULT_TRAINING_COURSE_FILTERS).sort();
    expect(keys).toEqual(
      ['category', 'isActive', 'isGlobal', 'requiredForStage', 'search'].sort()
    );
  });

  it('is referentially safe — spread creates a new object', () => {
    const copy = { ...DEFAULT_TRAINING_COURSE_FILTERS };
    copy.category = 'SAFETY';
    expect(DEFAULT_TRAINING_COURSE_FILTERS.category).toBeNull();
  });
});

// ============================================================================
// DEFAULT_ENROLLMENT_FILTERS
// ============================================================================

describe('DEFAULT_ENROLLMENT_FILTERS', () => {
  it('has null status (no status filter by default)', () => {
    expect(DEFAULT_ENROLLMENT_FILTERS.status).toBeNull();
  });

  it('has null courseId (no course filter by default)', () => {
    expect(DEFAULT_ENROLLMENT_FILTERS.courseId).toBeNull();
  });

  it('has null employeeId (no employee filter by default)', () => {
    expect(DEFAULT_ENROLLMENT_FILTERS.employeeId).toBeNull();
  });

  it('has overdueOnly = false by default', () => {
    expect(DEFAULT_ENROLLMENT_FILTERS.overdueOnly).toBe(false);
  });

  it('has exactly the expected keys', () => {
    const keys = Object.keys(DEFAULT_ENROLLMENT_FILTERS).sort();
    expect(keys).toEqual(
      ['courseId', 'employeeId', 'overdueOnly', 'status'].sort()
    );
  });

  it('is referentially safe — spread creates a new object', () => {
    const copy = { ...DEFAULT_ENROLLMENT_FILTERS };
    copy.overdueOnly = true;
    expect(DEFAULT_ENROLLMENT_FILTERS.overdueOnly).toBe(false);
  });
});

// ============================================================================
// TrainingCourseFilters interface contract
// ============================================================================

describe('TrainingCourseFilters interface', () => {
  it('allows a fully-specified filter object', () => {
    const filters: TrainingCourseFilters = {
      category: 'AI_LITERACY',
      requiredForStage: 'AI_PARTNER',
      isActive: true,
      isGlobal: false,
      search: 'safety',
    };
    expect(filters.category).toBe('AI_LITERACY');
    expect(filters.requiredForStage).toBe('AI_PARTNER');
  });

  it('allows a partial filter object (all fields optional)', () => {
    const filters: TrainingCourseFilters = {};
    expect(filters.category).toBeUndefined();
  });

  it('allows null for nullable filter fields', () => {
    const filters: TrainingCourseFilters = {
      category: null,
      requiredForStage: null,
    };
    expect(filters.category).toBeNull();
    expect(filters.requiredForStage).toBeNull();
  });
});

// ============================================================================
// TrainingEnrollmentFilters interface contract
// ============================================================================

describe('TrainingEnrollmentFilters interface', () => {
  it('allows a fully-specified filter object', () => {
    const filters: TrainingEnrollmentFilters = {
      status: 'IN_PROGRESS',
      courseId: 'course-uuid',
      employeeId: 'emp-uuid',
      overdueOnly: true,
    };
    expect(filters.status).toBe('IN_PROGRESS');
    expect(filters.overdueOnly).toBe(true);
  });

  it('allows a partial / empty filter object', () => {
    const filters: TrainingEnrollmentFilters = {};
    expect(filters.status).toBeUndefined();
  });
});

// ============================================================================
// TrainingCourse interface — compile-time shape check (satisfies)
// ============================================================================

describe('TrainingCourse interface shape', () => {
  it('accepts a minimal-but-valid course object', () => {
    const course = {
      id: 'c1',
      orgId: 'org1',
      title: 'AI Basics',
      category: 'AI_LITERACY' as TrainingCourseCategory,
      planGate: 'PROFESSIONAL' as const,
      durationHours: null,
      passingScore: null,
      requiredForStage: null,
      isActive: true,
      isGlobal: false,
      version: 1,
      tags: [],
      createdAt: '2027-01-01T00:00:00Z',
      updatedAt: '2027-01-01T00:00:00Z',
    } satisfies TrainingCourse;

    expect(course.title).toBe('AI Basics');
    expect(course.category).toBe('AI_LITERACY');
    expect(course.isGlobal).toBe(false);
  });

  it('orgId can be null (global seed course)', () => {
    const course = {
      id: 'global-1',
      orgId: null,
      title: 'Global Safety 101',
      category: 'SAFETY' as TrainingCourseCategory,
      planGate: 'PROFESSIONAL' as const,
      durationHours: 2,
      passingScore: 80,
      requiredForStage: null,
      isActive: true,
      isGlobal: true,
      version: 1,
      tags: ['global', 'safety'],
      createdAt: '2027-01-01T00:00:00Z',
      updatedAt: '2027-01-01T00:00:00Z',
    } satisfies TrainingCourse;

    expect(course.orgId).toBeNull();
    expect(course.isGlobal).toBe(true);
  });

  it('requiredForStage can be a valid SuperEmployeeStage', () => {
    const course = {
      id: 'ai-1',
      orgId: null,
      title: 'AI Partnership Skills',
      category: 'AI_LITERACY' as TrainingCourseCategory,
      planGate: 'PROFESSIONAL' as const,
      durationHours: 4,
      passingScore: 70,
      requiredForStage: 'AI_PARTNER' as const,
      isActive: true,
      isGlobal: true,
      version: 1,
      tags: ['ai', 'stage-gate'],
      createdAt: '2027-01-01T00:00:00Z',
      updatedAt: '2027-01-01T00:00:00Z',
    } satisfies TrainingCourse;

    expect(course.requiredForStage).toBe('AI_PARTNER');
  });
});

// ============================================================================
// TrainingEnrollment interface — compile-time shape check
// ============================================================================

describe('TrainingEnrollment interface shape', () => {
  it('accepts a valid enrollment object', () => {
    const enrollment = {
      id: 'enroll-1',
      orgId: 'org1',
      courseId: 'course-1',
      employeeId: 'emp-1',
      enrolledAt: '2027-01-15T08:00:00Z',
      dueDate: '2027-02-15',
      status: 'ENROLLED' as TrainingStatus,
      updatedAt: '2027-01-15T08:00:00Z',
    } satisfies TrainingEnrollment;

    expect(enrollment.status).toBe('ENROLLED');
    expect(enrollment.courseId).toBe('course-1');
  });

  it('dueDate can be null', () => {
    const enrollment = {
      id: 'enroll-2',
      orgId: 'org1',
      courseId: 'course-2',
      employeeId: 'emp-2',
      enrolledAt: '2027-01-15T08:00:00Z',
      dueDate: null,
      status: 'IN_PROGRESS' as TrainingStatus,
      updatedAt: '2027-01-15T08:00:00Z',
    } satisfies TrainingEnrollment;

    expect(enrollment.dueDate).toBeNull();
  });
});

// ============================================================================
// TrainingCompletion interface — compile-time shape check
// ============================================================================

describe('TrainingCompletion interface shape', () => {
  it('accepts a valid completion with score', () => {
    const completion = {
      id: 'comp-1',
      orgId: 'org1',
      courseId: 'course-1',
      enrollmentId: 'enroll-1',
      employeeId: 'emp-1',
      completedAt: '2027-01-20T10:00:00Z',
      score: 85,
      isPassed: true,
      createdAt: '2027-01-20T10:00:00Z',
    } satisfies TrainingCompletion;

    expect(completion.score).toBe(85);
    expect(completion.isPassed).toBe(true);
  });

  it('score can be null when no assessment', () => {
    const completion = {
      id: 'comp-2',
      orgId: 'org1',
      courseId: 'course-2',
      enrollmentId: 'enroll-2',
      employeeId: 'emp-2',
      completedAt: '2027-01-21T09:00:00Z',
      score: null,
      isPassed: null,
      createdAt: '2027-01-21T09:00:00Z',
    } satisfies TrainingCompletion;

    expect(completion.score).toBeNull();
    expect(completion.isPassed).toBeNull();
  });
});

// ============================================================================
// SuperEmployeeStage integration — courses linked to AI readiness progression
// ============================================================================

describe('SuperEmployeeStage linkage in TrainingCourse', () => {
  const STAGE_PROGRESSION = [
    'AI_UNAWARE',
    'AI_AWARE',
    'AI_ASSISTED',
    'AI_PARTNER',
    'SUPER_EMPLOYEE',
  ] as const;

  it('all SuperEmployeeStage values are valid strings', () => {
    for (const stage of STAGE_PROGRESSION) {
      expect(typeof stage).toBe('string');
      expect(stage.length).toBeGreaterThan(0);
    }
  });

  it('SUPER_EMPLOYEE is the last stage', () => {
    expect(STAGE_PROGRESSION[STAGE_PROGRESSION.length - 1]).toBe('SUPER_EMPLOYEE');
  });

  it('AI_LITERACY category courses can be linked to each stage', () => {
    for (const stage of STAGE_PROGRESSION) {
      const course: TrainingCourse = {
        id: `ai-${stage}`,
        orgId: null,
        title: `AI Literacy — ${stage}`,
        category: 'AI_LITERACY',
        planGate: 'PROFESSIONAL',
        durationHours: 2,
        passingScore: 70,
        requiredForStage: stage,
        isActive: true,
        isGlobal: true,
        version: 1,
        tags: [],
        createdAt: '2027-01-01T00:00:00Z',
        updatedAt: '2027-01-01T00:00:00Z',
      };
      expect(course.requiredForStage).toBe(stage);
    }
  });
});
