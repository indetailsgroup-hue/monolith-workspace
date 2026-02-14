/**
 * G9 Persistence Gate Tests
 *
 * NORTH STAR: "No unvalidated external state enters OperationGraph"
 *
 * These tests verify the G9 boundary correctly validates data
 * and produces the expected ValidationResult types.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateProject,
  validateCabinet,
  validatePanel,
  validateCabinets,
  hasBlockingIssues,
  getValidationSummary,
  G9_ERROR_CODES,
} from '../gate09';
import {
  isValidationSuccess,
  isValidationFailure,
  CANONICAL_SCHEMA_VERSION,
} from '../types';

// ============================================
// TEST DATA FIXTURES
// ============================================

const validPanelData = {
  id: 'panel-001',
  role: 'LEFT_SIDE',
  name: 'Left Side Panel',
  finishWidth: 500,
  finishHeight: 700,
  coreMaterialId: 'melamine-white-18',
  faces: {
    faceA: 'surface-white',
    faceB: null,
  },
  edges: {
    top: 'edge-white-2',
    bottom: 'edge-white-2',
    left: null,
    right: null,
  },
  grainDirection: 'VERTICAL',
  computed: {
    realThickness: 18,
    cutWidth: 498,
    cutHeight: 698,
    surfaceArea: 348600,
    edgeLength: 2396,
    cost: 125.5,
    co2: 2.5,
  },
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  visible: true,
};

const validCabinetData = {
  id: 'cabinet-001',
  name: 'Base Cabinet',
  type: 'BASE',
  dimensions: {
    width: 600,
    height: 720,
    depth: 560,
    toeKickHeight: 100,
  },
  structure: {
    topJoint: 'INSET',
    bottomJoint: 'INSET',
    hasBackPanel: true,
    backPanelInset: 5,
    shelfCount: 1,
    dividerCount: 0,
  },
  materials: {
    defaultCore: 'melamine-white-18',
    defaultSurface: 'surface-white',
    defaultEdge: 'edge-white-2',
  },
  manufacturing: {
    glueThickness: 0.5,
    preMilling: 1,
    grooveDepth: 8,
    clearance: 0.5,
    shelfSetbackFront: 30,
    backPanelConstruction: 'inset',
    backVoid: 5,
    backThickness: 5,
    safetyGap: 2,
  },
  panels: [validPanelData],
  computed: {
    totalCost: 350,
    totalCO2: 8.5,
    panelCount: 5,
    totalSurfaceArea: 1500000,
    totalEdgeLength: 12000,
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const validProjectData = {
  schemaVersion: CANONICAL_SCHEMA_VERSION,
  meta: {
    id: 'project-001',
    name: 'Test Project',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  cabinets: [validCabinetData],
  materialLibrary: {
    cores: [{
      id: 'melamine-white-18',
      name: 'White Melamine 18mm',
      thickness: 18,
      costPerSqm: 45,
      co2PerSqm: 1.2,
    }],
    surfaces: [{
      id: 'surface-white',
      name: 'White Surface',
      thickness: 0.4,
      costPerSqm: 12,
      co2PerSqm: 0.3,
      color: '#ffffff',
    }],
    edges: [{
      id: 'edge-white-2',
      name: 'White Edge 2mm',
      code: 'EB-W2',
      thickness: 2,
      height: 22,
      costPerMeter: 3.5,
      color: '#ffffff',
    }],
  },
};

// ============================================
// PROJECT VALIDATION TESTS
// ============================================

describe('validateProject', () => {
  it('should validate a correct project', () => {
    const result = validateProject(validProjectData);

    expect(isValidationSuccess(result)).toBe(true);
    if (isValidationSuccess(result)) {
      expect(result.value.meta.id).toBe('project-001');
      expect(result.value.cabinets).toHaveLength(1);
    }
  });

  it('should reject null data', () => {
    const result = validateProject(null);

    expect(isValidationFailure(result)).toBe(true);
    if (isValidationFailure(result)) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe(G9_ERROR_CODES.PARSE_ERROR);
    }
  });

  it('should reject unsupported schema version', () => {
    const result = validateProject({
      ...validProjectData,
      schemaVersion: '99.0.0',
    });

    expect(isValidationFailure(result)).toBe(true);
    if (isValidationFailure(result)) {
      expect(result.issues[0].code).toBe(G9_ERROR_CODES.VERSION_UNSUPPORTED);
    }
  });

  it('should reject project with missing required fields', () => {
    const result = validateProject({
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      // missing meta, cabinets, materialLibrary
    });

    expect(isValidationFailure(result)).toBe(true);
    if (isValidationFailure(result)) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('should reject project with invalid dimensions', () => {
    const invalidData = {
      ...validProjectData,
      cabinets: [{
        ...validCabinetData,
        dimensions: {
          ...validCabinetData.dimensions,
          width: -100, // Invalid: negative width
        },
      }],
    };

    const result = validateProject(invalidData);

    expect(isValidationFailure(result)).toBe(true);
    if (isValidationFailure(result)) {
      const hasWidthError = result.issues.some(
        (i) => i.path?.includes('width') || i.message.includes('positive')
      );
      expect(hasWidthError).toBe(true);
    }
  });
});

// ============================================
// CABINET VALIDATION TESTS
// ============================================

describe('validateCabinet', () => {
  it('should validate a correct cabinet', () => {
    const result = validateCabinet(validCabinetData);

    expect(isValidationSuccess(result)).toBe(true);
    if (isValidationSuccess(result)) {
      expect(result.value.id).toBe('cabinet-001');
      expect(result.value.type).toBe('BASE');
    }
  });

  it('should reject cabinet with invalid type', () => {
    const result = validateCabinet({
      ...validCabinetData,
      type: 'INVALID_TYPE',
    });

    expect(isValidationFailure(result)).toBe(true);
  });

  it('should reject cabinet with empty id', () => {
    const result = validateCabinet({
      ...validCabinetData,
      id: '',
    });

    expect(isValidationFailure(result)).toBe(true);
  });

  it('should reject cabinet with zero height', () => {
    const result = validateCabinet({
      ...validCabinetData,
      dimensions: {
        ...validCabinetData.dimensions,
        height: 0,
      },
    });

    expect(isValidationFailure(result)).toBe(true);
  });
});

// ============================================
// PANEL VALIDATION TESTS
// ============================================

describe('validatePanel', () => {
  it('should validate a correct panel', () => {
    const result = validatePanel(validPanelData);

    expect(isValidationSuccess(result)).toBe(true);
    if (isValidationSuccess(result)) {
      expect(result.value.id).toBe('panel-001');
      expect(result.value.role).toBe('LEFT_SIDE');
    }
  });

  it('should reject panel with invalid role', () => {
    const result = validatePanel({
      ...validPanelData,
      role: 'INVALID_ROLE',
    });

    expect(isValidationFailure(result)).toBe(true);
  });

  it('should reject panel with invalid grain direction', () => {
    const result = validatePanel({
      ...validPanelData,
      grainDirection: 'DIAGONAL', // Invalid
    });

    expect(isValidationFailure(result)).toBe(true);
  });

  it('should allow null edge references', () => {
    const result = validatePanel({
      ...validPanelData,
      edges: {
        top: null,
        bottom: null,
        left: null,
        right: null,
      },
    });

    expect(isValidationSuccess(result)).toBe(true);
  });
});

// ============================================
// BATCH VALIDATION TESTS
// ============================================

describe('validateCabinets', () => {
  it('should validate multiple cabinets', () => {
    const result = validateCabinets([validCabinetData, validCabinetData]);

    expect(isValidationSuccess(result)).toBe(true);
    if (isValidationSuccess(result)) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('should fail if any cabinet is invalid', () => {
    const invalidCabinet = { ...validCabinetData, id: '' };
    const result = validateCabinets([validCabinetData, invalidCabinet]);

    expect(isValidationFailure(result)).toBe(true);
    if (isValidationFailure(result)) {
      // Should have path prefix
      const hasIndexedPath = result.issues.some((i) => i.path?.includes('cabinets[1]'));
      expect(hasIndexedPath).toBe(true);
    }
  });

  it('should validate empty array', () => {
    const result = validateCabinets([]);

    expect(isValidationSuccess(result)).toBe(true);
    if (isValidationSuccess(result)) {
      expect(result.value).toHaveLength(0);
    }
  });
});

// ============================================
// UTILITY FUNCTION TESTS
// ============================================

describe('hasBlockingIssues', () => {
  it('should return false for successful validation', () => {
    const result = validateProject(validProjectData);
    expect(hasBlockingIssues(result)).toBe(false);
  });

  it('should return true for failed validation', () => {
    const result = validateProject(null);
    expect(hasBlockingIssues(result)).toBe(true);
  });
});

describe('getValidationSummary', () => {
  it('should return correct summary for success', () => {
    const result = validateProject(validProjectData);
    const summary = getValidationSummary(result);

    expect(summary.ok).toBe(true);
    expect(summary.blockCount).toBe(0);
    expect(summary.warnCount).toBe(0);
  });

  it('should return correct summary for failure', () => {
    const result = validateProject({});
    const summary = getValidationSummary(result);

    expect(summary.ok).toBe(false);
    expect(summary.blockCount).toBeGreaterThan(0);
  });
});

// ============================================
// CI GATE ASSERTIONS
// ============================================

describe('CI Gate Assertions', () => {
  it('[G9-CI] should pass validation for well-formed project data', () => {
    const result = validateProject(validProjectData);
    expect(isValidationSuccess(result)).toBe(true);
  });

  it('[G9-CI] should block malformed data from entering system', () => {
    // This is the key CI assertion - malformed data MUST fail
    const malformedData = {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      meta: { id: '', name: '' }, // Invalid: empty strings
      cabinets: [{ invalid: true }],
      materialLibrary: { cores: [], surfaces: [], edges: [] },
    };

    const result = validateProject(malformedData);
    expect(isValidationFailure(result)).toBe(true);
  });

  it('[G9-CI] should validate all required dimension constraints', () => {
    // Dimensions must be positive
    const testCases = [
      { field: 'width', value: 0 },
      { field: 'height', value: -1 },
      { field: 'depth', value: 0 },
    ];

    for (const tc of testCases) {
      const data = {
        ...validCabinetData,
        dimensions: {
          ...validCabinetData.dimensions,
          [tc.field]: tc.value,
        },
      };
      const result = validateCabinet(data);
      expect(isValidationFailure(result)).toBe(true);
    }
  });

  it('[G9-CI] should validate all panel role enums', () => {
    const validRoles = [
      'LEFT_SIDE', 'RIGHT_SIDE', 'TOP', 'BOTTOM', 'BACK',
      'SHELF', 'DIVIDER', 'FRONT', 'DRAWER_FRONT', 'DRAWER_SIDE',
      'DRAWER_BACK', 'DRAWER_BOTTOM', 'DOOR', 'DOOR_LEFT', 'DOOR_RIGHT',
    ];

    for (const role of validRoles) {
      const data = { ...validPanelData, role };
      const result = validatePanel(data);
      expect(isValidationSuccess(result)).toBe(true);
    }
  });
});
