/**
 * Verify Cabinet Skill
 *
 * Validates cabinet configuration for manufacturing readiness.
 * Checks dimensions, materials, and structural integrity.
 *
 * @version 1.0.1
 */

import type { Skill, SkillContext, SkillResult, VerifyResult, VerifyCheck } from '../types';
import type { Cabinet } from '../../types/Cabinet';

// ============================================
// VERIFICATION CHECKS
// ============================================

interface VerifyContext extends SkillContext {
  cabinet: Cabinet;
}

function checkDimensions(cabinet: Cabinet): VerifyCheck {
  const { width, height, depth } = cabinet.dimensions;

  // Standard manufacturing limits
  const MIN_DIM = 100;  // 100mm minimum
  const MAX_WIDTH = 1200;  // 1200mm max width
  const MAX_HEIGHT = 2400;  // 2400mm max height
  const MAX_DEPTH = 800;   // 800mm max depth

  const issues: string[] = [];

  if (width < MIN_DIM) issues.push(`Width ${width}mm is below minimum ${MIN_DIM}mm`);
  if (height < MIN_DIM) issues.push(`Height ${height}mm is below minimum ${MIN_DIM}mm`);
  if (depth < MIN_DIM) issues.push(`Depth ${depth}mm is below minimum ${MIN_DIM}mm`);

  if (width > MAX_WIDTH) issues.push(`Width ${width}mm exceeds maximum ${MAX_WIDTH}mm`);
  if (height > MAX_HEIGHT) issues.push(`Height ${height}mm exceeds maximum ${MAX_HEIGHT}mm`);
  if (depth > MAX_DEPTH) issues.push(`Depth ${depth}mm exceeds maximum ${MAX_DEPTH}mm`);

  return {
    id: 'dimensions',
    name: 'Dimension Limits',
    passed: issues.length === 0,
    message: issues.length === 0
      ? `Dimensions OK: ${width}×${height}×${depth}mm`
      : issues.join('; '),
    severity: issues.length === 0 ? 'info' : 'error',
  };
}

function checkPanelCount(cabinet: Cabinet): VerifyCheck {
  const panelCount = cabinet.panels.length;
  const visiblePanels = cabinet.panels.filter(p => p.visible).length;

  // A valid cabinet should have at least 4 panels (2 sides, top, bottom)
  const isValid = panelCount >= 4;

  return {
    id: 'panel-count',
    name: 'Panel Count',
    passed: isValid,
    message: isValid
      ? `${visiblePanels} visible panels (${panelCount} total)`
      : `Only ${panelCount} panels - cabinet needs at least 4 panels`,
    severity: isValid ? 'info' : 'error',
  };
}

function checkShelfSpan(cabinet: Cabinet): VerifyCheck {
  const { width } = cabinet.dimensions;

  // Get first panel to estimate material thickness
  const firstPanel = cabinet.panels[0];
  const thickness = firstPanel?.computed.realThickness ?? 18;

  // Maximum unsupported shelf span based on thickness
  const MAX_SPAN: Record<number, number> = {
    12: 400,
    15: 500,
    16: 550,
    18: 600,
    19: 650,
    22: 750,
    25: 900,
  };

  // Find closest thickness
  const closestThickness = Object.keys(MAX_SPAN)
    .map(Number)
    .reduce((prev, curr) =>
      Math.abs(curr - thickness) < Math.abs(prev - thickness) ? curr : prev
    );

  const maxSpan = MAX_SPAN[closestThickness] ?? 600;
  const needsSupport = width > maxSpan;

  return {
    id: 'shelf-span',
    name: 'Shelf Span',
    passed: !needsSupport,
    message: needsSupport
      ? `Width ${width}mm exceeds max unsupported span ${maxSpan}mm for ~${closestThickness}mm material. Add center support.`
      : `Shelf span OK for ~${closestThickness}mm material`,
    severity: needsSupport ? 'warning' : 'info',
  };
}

function checkDoorHardware(cabinet: Cabinet): VerifyCheck {
  // Find door panels (FRONT role)
  const doorPanels = cabinet.panels.filter(p => p.role === 'FRONT');

  if (doorPanels.length === 0) {
    return {
      id: 'door-hardware',
      name: 'Door Hardware',
      passed: true,
      message: 'No doors configured',
      severity: 'info',
    };
  }

  const issues: string[] = [];

  doorPanels.forEach((door, index) => {
    const height = door.finishHeight;

    // Hinge count based on door height
    let requiredHinges = 2;
    if (height > 1000) requiredHinges = 3;
    if (height > 1500) requiredHinges = 4;
    if (height > 2000) requiredHinges = 5;

    // Since we don't have hinge count in the panel, just note the requirement
    if (height > 1000) {
      issues.push(`Door ${index + 1} (${height}mm) needs ${requiredHinges} hinges`);
    }
  });

  return {
    id: 'door-hardware',
    name: 'Door Hardware',
    passed: true,  // Just informational
    message: issues.length === 0
      ? `Door hardware OK (${doorPanels.length} doors, standard height)`
      : issues.join('; '),
    severity: 'info',
  };
}

function checkStructuralIntegrity(cabinet: Cabinet): VerifyCheck {
  const { width, height, depth } = cabinet.dimensions;

  // Aspect ratio checks
  const heightToWidth = height / width;
  const depthToWidth = depth / width;

  const issues: string[] = [];

  // Tall narrow cabinets need wall mounting
  if (heightToWidth > 4) {
    issues.push(`Height/width ratio ${heightToWidth.toFixed(1)} too tall - needs wall mounting`);
  }

  // Deep narrow cabinets may tip
  if (depthToWidth > 2 && height > 600) {
    issues.push(`Deep narrow cabinet may be unstable - consider wider base`);
  }

  return {
    id: 'structural',
    name: 'Structural Integrity',
    passed: issues.length === 0,
    message: issues.length === 0
      ? 'Structural proportions OK'
      : issues.join('; '),
    severity: issues.length === 0 ? 'info' : 'warning',
  };
}

function checkMaterialAssignment(cabinet: Cabinet): VerifyCheck {
  const issues: string[] = [];

  // Check if all panels have materials assigned
  cabinet.panels.forEach(panel => {
    if (!panel.coreMaterialId) {
      issues.push(`Panel "${panel.name}" has no core material`);
    }
  });

  return {
    id: 'material-assignment',
    name: 'Material Assignment',
    passed: issues.length === 0,
    message: issues.length === 0
      ? 'All panels have materials assigned'
      : issues.join('; '),
    severity: issues.length === 0 ? 'info' : 'error',
  };
}

// ============================================
// SKILL DEFINITION
// ============================================

async function execute(context: VerifyContext): Promise<SkillResult<VerifyResult>> {
  const startTime = performance.now();
  const { cabinet } = context;

  if (!cabinet) {
    return {
      status: 'error',
      issues: [{
        code: 'NO_CABINET',
        message: 'No cabinet provided for verification',
        severity: 'error',
      }],
      duration: performance.now() - startTime,
      summary: 'No cabinet to verify',
    };
  }

  // Run all checks
  const checks: VerifyCheck[] = [
    checkDimensions(cabinet),
    checkPanelCount(cabinet),
    checkShelfSpan(cabinet),
    checkDoorHardware(cabinet),
    checkStructuralIntegrity(cabinet),
    checkMaterialAssignment(cabinet),
  ];

  // Calculate score
  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  // Determine overall pass/fail
  const hasErrors = checks.some(c => c.severity === 'error' && !c.passed);
  const passed = !hasErrors;

  const duration = performance.now() - startTime;

  // Build issues list from failed checks
  const issues = checks
    .filter(c => !c.passed)
    .map(c => ({
      code: c.id.toUpperCase().replace(/-/g, '_'),
      message: c.message,
      severity: c.severity,
      location: c.name,
    }));

  return {
    status: passed ? (issues.length > 0 ? 'warning' : 'success') : 'error',
    data: {
      passed,
      checks,
      score,
    },
    issues,
    duration,
    summary: passed
      ? `Cabinet verified: ${score}% (${passedCount}/${checks.length} checks passed)`
      : `Cabinet failed verification: ${checks.filter(c => !c.passed).length} issues found`,
  };
}

export const verifyCabinetSkill: Skill<VerifyContext, VerifyResult> = {
  id: 'verify-cabinet',
  name: 'Verify Cabinet',
  description: 'Validates cabinet configuration for manufacturing readiness',
  category: 'verify',
  icon: '✓',
  execute,
};
