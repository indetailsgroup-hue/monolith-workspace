/**
 * ADR-061: connector density profile — จำนวน Minifix ตามตัวเลือกผู้ใช้
 */

import { describe, it, expect } from 'vitest';
import {
  computeConnectorCount,
  computeConnectorCountForDensity,
  AWI_MAX_SPACING_MM,
} from '../generateDrillMap';

describe('computeConnectorCountForDensity', () => {
  it('CAD_STANDARD = กติกาเดิม (≤400→2, >400→3)', () => {
    expect(computeConnectorCountForDensity(400, 37, 'CAD_STANDARD')).toBe(computeConnectorCount(400));
    expect(computeConnectorCountForDensity(560, 37, 'CAD_STANDARD')).toBe(3);
  });

  it('AWI_PREMIUM: ตู้ลึก 560 → 5 ตัว (gap ~121.5 ≤ 128)', () => {
    // span = 560 - 37*2 = 486 → ceil(486/128)+1 = 5
    const count = computeConnectorCountForDensity(560, 37, 'AWI_PREMIUM');
    expect(count).toBe(5);
    const span = 560 - 37 * 2;
    expect(span / (count - 1)).toBeLessThanOrEqual(AWI_MAX_SPACING_MM);
  });

  it('AWI_PREMIUM: ตู้สั้น gap ไม่เกินอยู่แล้ว → เท่ากติกา CAD', () => {
    // 300: span=226, ceil(226/128)+1=3 > base 2 → AWI ยกเป็น 3
    expect(computeConnectorCountForDensity(300, 37, 'AWI_PREMIUM')).toBe(3);
    // 190: span=116 ≤128 → 2 = base
    expect(computeConnectorCountForDensity(190, 37, 'AWI_PREMIUM')).toBe(2);
  });

  it('AWI ไม่มีวันน้อยกว่ากติกา CAD', () => {
    for (const len of [100, 250, 400, 401, 560, 800, 1200]) {
      expect(computeConnectorCountForDensity(len, 37, 'AWI_PREMIUM'))
        .toBeGreaterThanOrEqual(computeConnectorCount(len));
    }
  });
});
