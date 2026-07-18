/**
 * handleBom.ts - Handles as BOM lines.
 *
 * Handles are bought hardware. They never appear in the cut list or the DXF;
 * they appear here, with a real quantity and a real unit price. There is no
 * zero-cost path: a handle type that buys nothing emits no line at all rather
 * than a free one.
 *
 * Quantity is read from structure.doorConfig / drawerConfig, never from panel
 * roles. bom.ts:54 counts doors with `role === 'FRONT'`, which matches none of
 * the roles the door generator actually emits (DOOR / DOOR_LEFT / DOOR_RIGHT),
 * so depending on that count would silently bill zero handles.
 *
 * @version 1.0.0 - Initial handle BOM
 */

import type { BOMItem } from '../skills/types';
import type { HandleCabinetInput } from './handlePlacement';
import { resolveHandlePlacements } from './handlePlacement';
import { getHandleScrewSpec } from './handleCatalog';

/**
 * Build the hardware BOM lines for every handle on a cabinet.
 *
 * One line per handle SKU, plus one line per mounting-screw SKU consumed.
 * Returns [] when nothing is bought.
 */
export function buildHandleBomItems(cabinet: HandleCabinetInput): BOMItem[] {
  const placements = resolveHandlePlacements(cabinet);
  if (placements.length === 0) return [];

  // Count handles by SKU, and the screws they consume by screw SKU.
  const handleCounts = new Map<string, number>();
  const screwCounts = new Map<string, number>();

  for (const placement of placements) {
    const { spec } = placement;
    handleCounts.set(spec.sku, (handleCounts.get(spec.sku) ?? 0) + 1);
    screwCounts.set(
      spec.screwSku,
      (screwCounts.get(spec.screwSku) ?? 0) + spec.screwCount
    );
  }

  const items: BOMItem[] = [];

  // Handle lines. The spec is carried on the placement, so price and geometry
  // can never come from different catalog entries.
  const specBySku = new Map(placements.map((p) => [p.spec.sku, p.spec]));
  for (const [sku, quantity] of handleCounts) {
    const spec = specBySku.get(sku);
    if (!spec) continue;

    items.push({
      sku,
      name: spec.name,
      category: 'hardware',
      quantity,
      unit: 'pc',
      unitPrice: spec.priceTHB,
      totalPrice: spec.priceTHB * quantity,
    });
  }

  // Mounting screws, priced as their own consumable.
  for (const [sku, quantity] of screwCounts) {
    const screw = getHandleScrewSpec(sku);
    if (!screw) continue;

    items.push({
      sku,
      name: screw.name,
      category: 'hardware',
      quantity,
      unit: 'pc',
      unitPrice: screw.priceTHB,
      totalPrice: screw.priceTHB * quantity,
    });
  }

  return items;
}
