/**
 * Generate Cut List Skill
 *
 * Generates a detailed cut list from cabinet configuration.
 * Uses the actual panel data from the Cabinet type.
 *
 * @version 1.0.1
 */

import type { Skill, SkillContext, SkillResult, CutListResult, CutListItem } from '../types';
import type { Cabinet, CabinetPanel } from '../../types/Cabinet';

// ============================================
// TYPES
// ============================================

interface CutListContext extends SkillContext {
  cabinet?: Cabinet;
  cabinets?: Cabinet[];
}

// ============================================
// CUT LIST GENERATION
// ============================================

function panelToCutListItem(panel: CabinetPanel, prefix: string): CutListItem {
  // Determine grain direction
  const grain = panel.grainDirection === 'HORIZONTAL' ? 'horizontal' :
                panel.grainDirection === 'VERTICAL' ? 'vertical' : 'none';

  // Determine edge banding from panel edges
  const edgeBanding = {
    left: panel.edges.left !== null,
    right: panel.edges.right !== null,
    top: panel.edges.top !== null,
    bottom: panel.edges.bottom !== null,
  };

  return {
    partId: `${prefix}-${panel.id.substring(0, 6)}`,
    partName: panel.name,
    material: panel.coreMaterialId,
    thickness: panel.computed.realThickness,
    width: panel.finishWidth,
    height: panel.finishHeight,
    quantity: 1,
    edgeBanding,
    grain,
    notes: panel.role,
  };
}

function generateCabinetCutList(cabinet: Cabinet): CutListItem[] {
  // Cabinet ID prefix for part naming
  const prefix = cabinet.name?.substring(0, 3).toUpperCase() ?? 'CAB';

  // Convert all panels to cut list items
  return cabinet.panels
    .filter(panel => panel.visible)
    .map(panel => panelToCutListItem(panel, prefix));
}

function calculateTotals(items: CutListItem[]): {
  totalParts: number;
  totalArea: number;
  materials: Record<string, { count: number; area: number }>;
} {
  const materials: Record<string, { count: number; area: number }> = {};
  let totalParts = 0;
  let totalArea = 0;

  items.forEach(item => {
    const area = item.width * item.height * item.quantity;
    totalParts += item.quantity;
    totalArea += area;

    if (!materials[item.material]) {
      materials[item.material] = { count: 0, area: 0 };
    }
    materials[item.material].count += item.quantity;
    materials[item.material].area += area;
  });

  return { totalParts, totalArea, materials };
}

// ============================================
// SKILL DEFINITION
// ============================================

async function execute(context: CutListContext): Promise<SkillResult<CutListResult>> {
  const startTime = performance.now();

  // Get cabinets to process
  const cabinets = context.cabinets ?? (context.cabinet ? [context.cabinet] : []);

  if (cabinets.length === 0) {
    return {
      status: 'error',
      issues: [{
        code: 'NO_CABINETS',
        message: 'No cabinets provided for cut list generation',
        severity: 'error',
      }],
      duration: performance.now() - startTime,
      summary: 'No cabinets to process',
    };
  }

  // Generate cut list for all cabinets
  const allItems: CutListItem[] = [];
  const issues: { code: string; message: string; severity: 'info' | 'warning' | 'error' }[] = [];

  cabinets.forEach((cabinet, index) => {
    try {
      const items = generateCabinetCutList(cabinet);
      allItems.push(...items);
    } catch (error) {
      issues.push({
        code: 'GENERATION_ERROR',
        message: `Cabinet ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'warning',
      });
    }
  });

  // Calculate totals
  const { totalParts, totalArea, materials } = calculateTotals(allItems);

  const duration = performance.now() - startTime;

  return {
    status: issues.length > 0 ? 'warning' : 'success',
    data: {
      items: allItems,
      totalParts,
      totalArea,
      materials,
    },
    issues,
    duration,
    summary: `Generated cut list: ${totalParts} parts from ${cabinets.length} cabinet(s), ${(totalArea / 1000000).toFixed(2)} m² total`,
  };
}

export const generateCutListSkill: Skill<CutListContext, CutListResult> = {
  id: 'generate-cut-list',
  name: 'Generate Cut List',
  description: 'Creates a detailed cut list with dimensions and edge banding',
  category: 'generate',
  icon: '📋',
  execute,
};
