/**
 * DXF Normalization Utilities
 *
 * Functions for normalizing and comparing DXF output for golden tests.
 */

export const CNC_PRECISION_MM = 0.001;

export function roundToPrecision(value: number, precision: number = CNC_PRECISION_MM): number {
  const factor = 1 / precision;
  return Math.round(value * factor) / factor;
}

export function normalizeDxf(dxfContent: string): string {
  return dxfContent.trim().replace(/\r\n/g, '\n');
}

export interface DxfComparisonResult {
  match: boolean;
  differences?: string[];
}

export function compareDxf(actual: string, expected: string): DxfComparisonResult {
  const match = normalizeDxf(actual) === normalizeDxf(expected);
  return { match };
}

export interface DxfStats {
  entityCount: number;
  layerCount: number;
  circleCount: number;
  lineCount: number;
}

export function getDxfStats(dxfContent: string): DxfStats {
  const lines = dxfContent.split('\n');
  return {
    entityCount: lines.filter(l => l.trim() === 'CIRCLE' || l.trim() === 'LINE').length,
    layerCount: new Set(lines.filter((_, i) => i > 0 && lines[i - 1]?.trim() === '8').map(l => l.trim())).size,
    circleCount: lines.filter(l => l.trim() === 'CIRCLE').length,
    lineCount: lines.filter(l => l.trim() === 'LINE').length,
  };
}

export interface DxfEntity {
  type: string;
  layer?: string;
  x: number;
  y: number;
  z?: number;
  radius?: number;
}

export function parseEntities(dxfContent: string): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const lines = dxfContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === 'CIRCLE' || trimmed === 'LINE' || trimmed === 'ARC') {
      const entity: DxfEntity = { type: trimmed, x: 0, y: 0 };
      // Parse group codes following entity type
      for (let j = i + 1; j < lines.length && j < i + 30; j++) {
        const code = lines[j]?.trim();
        const value = lines[j + 1]?.trim();
        if (!code || !value) break;
        if (code === '0') break; // Next entity
        if (code === '8') entity.layer = value;
        if (code === '10') entity.x = parseFloat(value);
        if (code === '20') entity.y = parseFloat(value);
        if (code === '30') entity.z = parseFloat(value);
        if (code === '40') entity.radius = parseFloat(value);
        j++; // Skip value line
      }
      entities.push(entity);
    }
  }
  return entities;
}
