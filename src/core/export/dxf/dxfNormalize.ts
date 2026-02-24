/**
 * dxfNormalize.ts - CNC-Grade DXF Normalization
 *
 * NORTH STAR: "Golden DXF = Manufacturing Contract"
 *
 * This module normalizes DXF content for deterministic comparison.
 * Precision is set to 0.01mm (CNC woodworking standard resolution).
 *
 * ## Normalization Rules
 * 1. Newlines: LF only, trimEnd each line, final newline = yes
 * 2. Numeric precision: 0.01mm (2 decimal places)
 * 3. Entity ordering: by layer → type → x → y → z
 * 4. Layer canonicalization: CUT → DRILL order
 * 5. Strip unstable tokens: timestamps, UUIDs, comments
 *
 * ## Philosophy
 * - Insensitive to: newline style, floating point noise
 * - Sensitive to: geometry, drill count, layers, distances
 *
 * @version 1.0.0
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * CNC precision in mm (0.01mm = 10 microns)
 * This is the standard resolution for woodworking CNC machines
 */
export const CNC_PRECISION_MM = 0.01;

/**
 * Decimal places for formatting (0.01mm = 2 decimal places)
 */
export const DECIMAL_PLACES = 2;

/**
 * Layer ordering for canonical DXF
 */
export const LAYER_ORDER = [
  'CUT',
  'CUT_OUT',
  'OUTLINE',
  'PROFILE',
  'DRILL',
  'DRILL_V',
  'DRILL_H',
  'BORE',
  'POCKET',
  'SLOT',
  'SAW_GROOVE',
  'HINGE_CUP',
  'CONTOUR',
  'ANNOTATION',
  'TEXT',
  'LABELS',
] as const;

/**
 * Entity type ordering for sorting
 */
export const ENTITY_ORDER = [
  'LWPOLYLINE',
  'POLYLINE',
  'LINE',
  'CIRCLE',
  'ARC',
  'POINT',
  'TEXT',
  'MTEXT',
] as const;

// ============================================
// TYPES
// ============================================

export interface DxfEntity {
  type: string;
  layer: string;
  x: number;
  y: number;
  z: number;
  raw: string;
}

export interface NormalizeOptions {
  /** Precision in mm (default: 0.01) */
  precision?: number;
  /** Sort entities by position (default: true) */
  sortEntities?: boolean;
  /** Strip comments (default: true) */
  stripComments?: boolean;
  /** Strip timestamps (default: true) */
  stripTimestamps?: boolean;
}

const DEFAULT_OPTIONS: Required<NormalizeOptions> = {
  precision: CNC_PRECISION_MM,
  sortEntities: true,
  stripComments: true,
  stripTimestamps: true,
};

// ============================================
// NUMERIC NORMALIZATION
// ============================================

/**
 * Round number to CNC precision (0.01mm)
 */
export function roundToPrecision(value: number, precision: number = CNC_PRECISION_MM): number {
  if (!isFinite(value)) return 0;
  const factor = 1 / precision;
  const result = Math.round(value * factor) / factor;
  // Handle -0 → 0 (JavaScript quirk)
  return Object.is(result, -0) ? 0 : result;
}

/**
 * Format number to fixed decimal places
 * Handles -0 → 0.00
 */
export function formatNumber(value: number, decimalPlaces: number = DECIMAL_PLACES): string {
  const rounded = roundToPrecision(value);
  // Handle -0 case
  if (Object.is(rounded, -0)) {
    return (0).toFixed(decimalPlaces);
  }
  return rounded.toFixed(decimalPlaces);
}

/**
 * Check if a string is a numeric DXF value
 */
function isNumericLine(line: string): boolean {
  const trimmed = line.trim();
  // DXF numeric values: integers, floats, scientific notation
  return /^-?\d+\.?\d*(?:[eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * Normalize numeric value in DXF line
 */
function normalizeNumericLine(line: string): string {
  const trimmed = line.trim();
  if (!isNumericLine(trimmed)) return trimmed;

  const num = parseFloat(trimmed);
  if (!isFinite(num)) return trimmed;

  // Check if it's an integer group code or actual coordinate
  // Group codes are always integers (0-1071)
  if (Number.isInteger(num) && num >= 0 && num < 2000) {
    return String(Math.round(num));
  }

  // Otherwise format as coordinate/dimension
  return formatNumber(num);
}

// ============================================
// LINE NORMALIZATION
// ============================================

/**
 * Normalize whitespace and line endings
 */
export function normalizeWhitespace(content: string): string {
  return content
    // Normalize line endings to LF
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Split, trim each line, rejoin
    .split('\n')
    .map(line => line.trimEnd())
    // Remove completely empty lines at start/end
    .join('\n')
    .trim()
    // Ensure final newline
    + '\n';
}

/**
 * Strip comment lines (lines starting with 999)
 */
export function stripComments(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 999 is the comment group code in DXF
    if (line === '999') {
      // Skip this line and the next (the comment content)
      i++;
      continue;
    }
    result.push(lines[i]);
  }

  return result.join('\n');
}

/**
 * Strip timestamp patterns
 */
export function stripTimestamps(content: string): string {
  return content
    // ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, 'TIMESTAMP')
    // Unix timestamps (10+ digits)
    .replace(/\b\d{10,13}\b/g, 'TIMESTAMP');
}

// ============================================
// ENTITY PARSING
// ============================================

/**
 * Parse DXF content into entities
 */
export function parseEntities(content: string): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const lines = content.split('\n');

  let inEntities = false;
  let currentEntity: Partial<DxfEntity> | null = null;
  let entityLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect ENTITIES section
    if (line === 'ENTITIES') {
      inEntities = true;
      continue;
    }

    if (line === 'ENDSEC' && inEntities) {
      // Save last entity
      if (currentEntity && currentEntity.type) {
        entities.push({
          type: currentEntity.type,
          layer: currentEntity.layer || '0',
          x: currentEntity.x || 0,
          y: currentEntity.y || 0,
          z: currentEntity.z || 0,
          raw: entityLines.join('\n'),
        });
      }
      inEntities = false;
      continue;
    }

    if (!inEntities) continue;

    // Check for entity start (group code 0)
    if (line === '0' && i + 1 < lines.length) {
      // Save previous entity
      if (currentEntity && currentEntity.type) {
        entities.push({
          type: currentEntity.type,
          layer: currentEntity.layer || '0',
          x: currentEntity.x || 0,
          y: currentEntity.y || 0,
          z: currentEntity.z || 0,
          raw: entityLines.join('\n'),
        });
      }

      // Start new entity
      const entityType = lines[i + 1].trim();
      currentEntity = { type: entityType };
      entityLines = ['0', entityType];
      i++; // Skip entity type line
      continue;
    }

    if (currentEntity) {
      entityLines.push(lines[i]);

      // Parse group codes
      const groupCode = parseInt(line, 10);
      const value = i + 1 < lines.length ? lines[i + 1].trim() : '';

      switch (groupCode) {
        case 8: // Layer
          currentEntity.layer = value;
          break;
        case 10: // X coordinate
          currentEntity.x = parseFloat(value) || 0;
          break;
        case 20: // Y coordinate
          currentEntity.y = parseFloat(value) || 0;
          break;
        case 30: // Z coordinate
          currentEntity.z = parseFloat(value) || 0;
          break;
      }
    }
  }

  return entities;
}

// ============================================
// ENTITY SORTING
// ============================================

/**
 * Get sort key for entity
 */
function getEntitySortKey(entity: DxfEntity): string {
  const layerIndex = LAYER_ORDER.findIndex(l =>
    entity.layer.toUpperCase().startsWith(l)
  );
  const layerOrder = layerIndex >= 0 ? layerIndex : 99;

  const typeIndex = ENTITY_ORDER.indexOf(entity.type as any);
  const typeOrder = typeIndex >= 0 ? typeIndex : 99;

  // Format with fixed width for proper sorting
  const x = formatNumber(entity.x).padStart(12, '0');
  const y = formatNumber(entity.y).padStart(12, '0');
  const z = formatNumber(entity.z).padStart(12, '0');

  return `${String(layerOrder).padStart(2, '0')}|${String(typeOrder).padStart(2, '0')}|${x}|${y}|${z}`;
}

/**
 * Sort entities by layer, type, position
 */
export function sortEntities(entities: DxfEntity[]): DxfEntity[] {
  return [...entities].sort((a, b) => {
    const keyA = getEntitySortKey(a);
    const keyB = getEntitySortKey(b);
    return keyA.localeCompare(keyB);
  });
}

// ============================================
// DXF RECONSTRUCTION
// ============================================

/**
 * Reconstruct DXF from header + sorted entities + footer
 */
function reconstructDxf(content: string, sortedEntities: DxfEntity[]): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inEntities = false;
  let entitiesWritten = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Before ENTITIES section
    if (!inEntities && line !== 'ENTITIES') {
      result.push(lines[i]);
      continue;
    }

    // Start of ENTITIES section
    if (line === 'ENTITIES') {
      inEntities = true;
      result.push(lines[i]);

      // Write sorted entities
      for (const entity of sortedEntities) {
        result.push(entity.raw);
      }
      entitiesWritten = true;
      continue;
    }

    // Skip original entities
    if (inEntities && line !== 'ENDSEC') {
      continue;
    }

    // End of ENTITIES section
    if (inEntities && line === 'ENDSEC') {
      inEntities = false;
      result.push(lines[i]);
      continue;
    }

    // After ENTITIES section
    result.push(lines[i]);
  }

  return result.join('\n');
}

// ============================================
// MAIN NORMALIZE FUNCTION
// ============================================

/**
 * Normalize DXF content for deterministic comparison
 *
 * @param content - Raw DXF content
 * @param options - Normalization options
 * @returns Normalized DXF content
 *
 * @example
 * ```typescript
 * const golden = fs.readFileSync('golden.dxf', 'utf-8');
 * const generated = generateDxf(packet);
 *
 * const normalizedGolden = normalizeDxf(golden);
 * const normalizedGenerated = normalizeDxf(generated);
 *
 * expect(normalizedGenerated).toBe(normalizedGolden);
 * ```
 */
export function normalizeDxf(content: string, options: NormalizeOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let normalized = content;

  // 1. Strip comments
  if (opts.stripComments) {
    normalized = stripComments(normalized);
  }

  // 2. Strip timestamps
  if (opts.stripTimestamps) {
    normalized = stripTimestamps(normalized);
  }

  // 3. Normalize whitespace
  normalized = normalizeWhitespace(normalized);

  // 4. Normalize numeric values
  normalized = normalized
    .split('\n')
    .map(line => normalizeNumericLine(line))
    .join('\n');

  // 5. Sort entities
  if (opts.sortEntities) {
    const entities = parseEntities(normalized);
    if (entities.length > 0) {
      const sorted = sortEntities(entities);
      normalized = reconstructDxf(normalized, sorted);
    }
  }

  // 6. Final whitespace normalization
  normalized = normalizeWhitespace(normalized);

  return normalized;
}

// ============================================
// COMPARISON HELPERS
// ============================================

/**
 * Compare two DXF files with normalization
 */
export function compareDxf(
  actual: string,
  expected: string,
  options?: NormalizeOptions
): { match: boolean; diff?: string } {
  const normalizedActual = normalizeDxf(actual, options);
  const normalizedExpected = normalizeDxf(expected, options);

  if (normalizedActual === normalizedExpected) {
    return { match: true };
  }

  // Generate simple diff
  const actualLines = normalizedActual.split('\n');
  const expectedLines = normalizedExpected.split('\n');

  const diffLines: string[] = [];
  const maxLines = Math.max(actualLines.length, expectedLines.length);

  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] || '';
    const expectedLine = expectedLines[i] || '';

    if (actualLine !== expectedLine) {
      diffLines.push(`Line ${i + 1}:`);
      diffLines.push(`  - ${expectedLine}`);
      diffLines.push(`  + ${actualLine}`);
    }
  }

  return {
    match: false,
    diff: diffLines.slice(0, 30).join('\n') + (diffLines.length > 30 ? '\n...' : ''),
  };
}

/**
 * Get entity statistics for debugging
 */
export function getDxfStats(content: string): {
  entityCount: number;
  byType: Record<string, number>;
  byLayer: Record<string, number>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
} {
  const entities = parseEntities(content);

  const byType: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const entity of entities) {
    byType[entity.type] = (byType[entity.type] || 0) + 1;
    byLayer[entity.layer] = (byLayer[entity.layer] || 0) + 1;

    if (entity.x < minX) minX = entity.x;
    if (entity.x > maxX) maxX = entity.x;
    if (entity.y < minY) minY = entity.y;
    if (entity.y > maxY) maxY = entity.y;
  }

  return {
    entityCount: entities.length,
    byType,
    byLayer,
    bounds: {
      minX: isFinite(minX) ? minX : 0,
      maxX: isFinite(maxX) ? maxX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxY: isFinite(maxY) ? maxY : 0,
    },
  };
}
