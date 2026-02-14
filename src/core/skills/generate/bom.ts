/**
 * Generate BOM (Bill of Materials) Skill
 *
 * Generates a comprehensive hardware and materials list.
 * Includes hinges, slides, screws, and other accessories.
 *
 * @version 1.0.0
 */

import type { Skill, SkillContext, SkillResult, BOMResult, BOMItem } from '../types';
import type { Cabinet } from '../../types/Cabinet';

// ============================================
// TYPES
// ============================================

interface BOMContext extends SkillContext {
  cabinet?: Cabinet;
  cabinets?: Cabinet[];
}

// ============================================
// HARDWARE DATABASE
// ============================================

const HARDWARE_PRICES: Record<string, { price: number; unit: string }> = {
  'HINGE-SOFT-CLOSE': { price: 85, unit: 'pc' },
  'HINGE-STANDARD': { price: 45, unit: 'pc' },
  'SLIDE-BALL-BEARING': { price: 120, unit: 'pair' },
  'SLIDE-UNDERMOUNT': { price: 450, unit: 'pair' },
  'SLIDE-FULL-EXT': { price: 280, unit: 'pair' },
  'SHELF-PIN': { price: 5, unit: 'pc' },
  'SCREW-4X30': { price: 0.5, unit: 'pc' },
  'SCREW-4X40': { price: 0.6, unit: 'pc' },
  'SCREW-5X50': { price: 0.8, unit: 'pc' },
  'CAM-LOCK': { price: 15, unit: 'pc' },
  'DOWEL-8X30': { price: 2, unit: 'pc' },
  'HANDLE-MODERN': { price: 180, unit: 'pc' },
  'HANDLE-CLASSIC': { price: 120, unit: 'pc' },
  'KNOB-ROUND': { price: 65, unit: 'pc' },
  'LEG-ADJUSTABLE': { price: 45, unit: 'pc' },
  'KICK-CLIP': { price: 8, unit: 'pc' },
};

// ============================================
// BOM GENERATION
// ============================================

function generateCabinetBOM(cabinet: Cabinet): BOMItem[] {
  const items: BOMItem[] = [];
  const { width, height } = cabinet.dimensions;

  // Count doors and drawers from panels
  const doorPanels = cabinet.panels.filter(p => p.role === 'FRONT');
  const drawerPanels = cabinet.panels.filter(p => p.role === 'DRAWER_FRONT');

  // ─────────────────────────────────────────────────────────────────────
  // HINGES (for doors)
  // ─────────────────────────────────────────────────────────────────────

  if (doorPanels.length > 0) {
    let totalHinges = 0;

    doorPanels.forEach(door => {
      const doorHeight = door.finishHeight;

      // Hinge count based on door height
      let hingeCount = 2;
      if (doorHeight > 1000) hingeCount = 3;
      if (doorHeight > 1500) hingeCount = 4;
      if (doorHeight > 2000) hingeCount = 5;

      totalHinges += hingeCount;
    });

    // Default to soft-close hinges
    const hingeType = 'HINGE-SOFT-CLOSE';
    const hingePrice = HARDWARE_PRICES[hingeType];

    items.push({
      sku: hingeType,
      name: 'Soft-Close Hinge 110°',
      category: 'hardware',
      quantity: totalHinges,
      unit: hingePrice.unit,
      unitPrice: hingePrice.price,
      totalPrice: hingePrice.price * totalHinges,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // DRAWER SLIDES
  // ─────────────────────────────────────────────────────────────────────

  if (drawerPanels.length > 0) {
    // Default to ball bearing slides
    const sku = 'SLIDE-BALL-BEARING';
    const slidePrice = HARDWARE_PRICES[sku];

    items.push({
      sku,
      name: 'Ball Bearing Slide',
      category: 'hardware',
      quantity: drawerPanels.length,
      unit: slidePrice.unit,
      unitPrice: slidePrice.price,
      totalPrice: slidePrice.price * drawerPanels.length,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // SHELF PINS
  // ─────────────────────────────────────────────────────────────────────

  const shelfCount = cabinet.structure.shelfCount;
  if (shelfCount > 0) {
    const pinsPerShelf = 4;  // 4 pins per adjustable shelf
    const totalPins = shelfCount * pinsPerShelf;

    items.push({
      sku: 'SHELF-PIN',
      name: 'Shelf Support Pin 5mm',
      category: 'hardware',
      quantity: totalPins,
      unit: 'pc',
      unitPrice: HARDWARE_PRICES['SHELF-PIN'].price,
      totalPrice: HARDWARE_PRICES['SHELF-PIN'].price * totalPins,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // ASSEMBLY HARDWARE
  // ─────────────────────────────────────────────────────────────────────

  // Cam locks for carcass assembly (typical 8 per cabinet)
  const camLocks = 8;
  items.push({
    sku: 'CAM-LOCK',
    name: 'Cam Lock Fastener',
    category: 'hardware',
    quantity: camLocks,
    unit: 'pc',
    unitPrice: HARDWARE_PRICES['CAM-LOCK'].price,
    totalPrice: HARDWARE_PRICES['CAM-LOCK'].price * camLocks,
  });

  // Dowels for alignment
  const dowels = 12;
  items.push({
    sku: 'DOWEL-8X30',
    name: 'Wooden Dowel 8×30mm',
    category: 'hardware',
    quantity: dowels,
    unit: 'pc',
    unitPrice: HARDWARE_PRICES['DOWEL-8X30'].price,
    totalPrice: HARDWARE_PRICES['DOWEL-8X30'].price * dowels,
  });

  // ─────────────────────────────────────────────────────────────────────
  // SCREWS
  // ─────────────────────────────────────────────────────────────────────

  // Hinge screws (6 per hinge)
  const hingeCount = doorPanels.reduce((acc, door) => {
    const h = door.finishHeight;
    return acc + (h > 2000 ? 5 : h > 1500 ? 4 : h > 1000 ? 3 : 2);
  }, 0);

  if (hingeCount > 0) {
    items.push({
      sku: 'SCREW-4X30',
      name: 'Euro Screw 4×30mm',
      category: 'hardware',
      quantity: hingeCount * 6,
      unit: 'pc',
      unitPrice: HARDWARE_PRICES['SCREW-4X30'].price,
      totalPrice: HARDWARE_PRICES['SCREW-4X30'].price * hingeCount * 6,
    });
  }

  // Back panel screws (every 200mm perimeter)
  const perimeter = 2 * (width + height);
  const backScrews = Math.ceil(perimeter / 200);
  items.push({
    sku: 'SCREW-4X30',
    name: 'Pan Head Screw 4×30mm',
    category: 'hardware',
    quantity: backScrews,
    unit: 'pc',
    unitPrice: HARDWARE_PRICES['SCREW-4X30'].price,
    totalPrice: HARDWARE_PRICES['SCREW-4X30'].price * backScrews,
  });

  // ─────────────────────────────────────────────────────────────────────
  // HANDLES
  // ─────────────────────────────────────────────────────────────────────

  const handleCount = doorPanels.length + drawerPanels.length;
  if (handleCount > 0) {
    // Default to modern handles
    const sku = 'HANDLE-MODERN';
    const handlePrice = HARDWARE_PRICES[sku];

    items.push({
      sku,
      name: 'Modern Bar Handle 160mm',
      category: 'hardware',
      quantity: handleCount,
      unit: handlePrice.unit,
      unitPrice: handlePrice.price,
      totalPrice: handlePrice.price * handleCount,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // LEGS & KICK BOARD
  // ─────────────────────────────────────────────────────────────────────

  if (cabinet.type === 'BASE' || cabinet.type === 'TALL') {
    // 4 legs per base cabinet
    items.push({
      sku: 'LEG-ADJUSTABLE',
      name: 'Adjustable Cabinet Leg 100-130mm',
      category: 'hardware',
      quantity: 4,
      unit: 'pc',
      unitPrice: HARDWARE_PRICES['LEG-ADJUSTABLE'].price,
      totalPrice: HARDWARE_PRICES['LEG-ADJUSTABLE'].price * 4,
    });

    // Kick board clips
    items.push({
      sku: 'KICK-CLIP',
      name: 'Kick Board Clip',
      category: 'hardware',
      quantity: 4,
      unit: 'pc',
      unitPrice: HARDWARE_PRICES['KICK-CLIP'].price,
      totalPrice: HARDWARE_PRICES['KICK-CLIP'].price * 4,
    });
  }

  return items;
}

function consolidateBOM(items: BOMItem[]): BOMItem[] {
  const consolidated = new Map<string, BOMItem>();

  items.forEach(item => {
    const existing = consolidated.get(item.sku);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice = (existing.unitPrice ?? 0) * existing.quantity;
    } else {
      consolidated.set(item.sku, { ...item });
    }
  });

  return Array.from(consolidated.values());
}

// ============================================
// SKILL DEFINITION
// ============================================

async function execute(context: BOMContext): Promise<SkillResult<BOMResult>> {
  const startTime = performance.now();

  // Get cabinets to process
  const cabinets = context.cabinets ?? (context.cabinet ? [context.cabinet] : []);

  if (cabinets.length === 0) {
    return {
      status: 'error',
      issues: [{
        code: 'NO_CABINETS',
        message: 'No cabinets provided for BOM generation',
        severity: 'error',
      }],
      duration: performance.now() - startTime,
      summary: 'No cabinets to process',
    };
  }

  // Generate BOM for all cabinets
  const allItems: BOMItem[] = [];
  const issues: { code: string; message: string; severity: 'info' | 'warning' | 'error' }[] = [];

  cabinets.forEach((cabinet, index) => {
    try {
      const items = generateCabinetBOM(cabinet);
      allItems.push(...items);
    } catch (error) {
      issues.push({
        code: 'GENERATION_ERROR',
        message: `Cabinet ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'warning',
      });
    }
  });

  // Consolidate duplicate items
  const consolidatedItems = consolidateBOM(allItems);

  // Calculate totals
  const totalItems = consolidatedItems.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedCost = consolidatedItems.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);

  const duration = performance.now() - startTime;

  return {
    status: issues.length > 0 ? 'warning' : 'success',
    data: {
      items: consolidatedItems,
      totalItems,
      estimatedCost,
    },
    issues,
    duration,
    summary: `Generated BOM: ${consolidatedItems.length} line items, ${totalItems} total pieces, ฿${estimatedCost.toLocaleString()} estimated`,
  };
}

export const generateBOMSkill: Skill<BOMContext, BOMResult> = {
  id: 'generate-bom',
  name: 'Generate Bill of Materials',
  description: 'Creates a hardware and materials list with pricing',
  category: 'generate',
  icon: '📦',
  execute,
};
