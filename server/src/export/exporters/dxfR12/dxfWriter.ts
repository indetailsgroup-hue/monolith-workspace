/**
 * DXF R12 Writer
 *
 * Step 10: Correct DXF R12 format writer
 *
 * Generates valid AutoCAD R12 DXF files that can be opened in:
 * - AutoCAD
 * - LibreCAD
 * - FreeCAD
 * - Most CNC/CAM software
 *
 * Structure:
 * - HEADER section (version, units, extents)
 * - TABLES section (layers)
 * - ENTITIES section (geometry)
 * - EOF
 */

import type { DxfDocument, DxfEntity, DxfLayer, DxfUnits } from './dxfTypes.js';

// ============================================================================
// DXF Group Code Helpers
// ============================================================================

/**
 * Write a DXF group code and value pair.
 */
function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/**
 * Convert units to $INSUNITS value.
 * AutoCAD: 4 = mm, 1 = inches
 */
function unitsToCode(units: DxfUnits): number {
  return units === 'MM' ? 4 : 1;
}

// ============================================================================
// Section Writers
// ============================================================================

function writeHeader(doc: DxfDocument): string {
  let out = '';

  // Section start
  out += pair(0, 'SECTION');
  out += pair(2, 'HEADER');

  // AutoCAD version (AC1009 = R12)
  out += pair(9, '$ACADVER');
  out += pair(1, 'AC1009');

  // Units
  out += pair(9, '$INSUNITS');
  out += pair(70, unitsToCode(doc.units));

  // Drawing units format
  out += pair(9, '$LUNITS');
  out += pair(70, 2); // Decimal

  // Precision
  out += pair(9, '$LUPREC');
  out += pair(70, 4); // 4 decimal places

  // Insert base point
  out += pair(9, '$INSBASE');
  out += pair(10, '0.0');
  out += pair(20, '0.0');
  out += pair(30, '0.0');

  // Extents
  if (doc.extents) {
    out += pair(9, '$EXTMIN');
    out += pair(10, doc.extents.min.x.toFixed(4));
    out += pair(20, doc.extents.min.y.toFixed(4));
    out += pair(30, (doc.extents.min.z ?? 0).toFixed(4));

    out += pair(9, '$EXTMAX');
    out += pair(10, doc.extents.max.x.toFixed(4));
    out += pair(20, doc.extents.max.y.toFixed(4));
    out += pair(30, (doc.extents.max.z ?? 0).toFixed(4));
  }

  // Section end
  out += pair(0, 'ENDSEC');

  return out;
}

function writeTables(doc: DxfDocument): string {
  let out = '';

  // Section start
  out += pair(0, 'SECTION');
  out += pair(2, 'TABLES');

  // LTYPE table (line types)
  out += pair(0, 'TABLE');
  out += pair(2, 'LTYPE');
  out += pair(70, 2); // Number of entries

  // CONTINUOUS line type
  out += pair(0, 'LTYPE');
  out += pair(2, 'CONTINUOUS');
  out += pair(70, 0);
  out += pair(3, 'Solid line');
  out += pair(72, 65);
  out += pair(73, 0);
  out += pair(40, '0.0');

  // DASHED line type
  out += pair(0, 'LTYPE');
  out += pair(2, 'DASHED');
  out += pair(70, 0);
  out += pair(3, 'Dashed line');
  out += pair(72, 65);
  out += pair(73, 2);
  out += pair(40, '6.0');
  out += pair(49, '3.0');
  out += pair(49, '-3.0');

  out += pair(0, 'ENDTAB');

  // LAYER table
  out += pair(0, 'TABLE');
  out += pair(2, 'LAYER');
  out += pair(70, doc.layers.length);

  for (const layer of doc.layers) {
    out += pair(0, 'LAYER');
    out += pair(2, layer.name);
    out += pair(70, 0);  // Layer flags (0 = normal)
    out += pair(62, layer.color);
    out += pair(6, layer.lineType || 'CONTINUOUS');
  }

  out += pair(0, 'ENDTAB');

  // Section end
  out += pair(0, 'ENDSEC');

  return out;
}

function writeEntity(entity: DxfEntity): string {
  let out = '';

  switch (entity.type) {
    case 'LINE':
      out += pair(0, 'LINE');
      out += pair(8, entity.layer);
      out += pair(10, entity.p1.x.toFixed(4));
      out += pair(20, entity.p1.y.toFixed(4));
      out += pair(30, (entity.p1.z ?? 0).toFixed(4));
      out += pair(11, entity.p2.x.toFixed(4));
      out += pair(21, entity.p2.y.toFixed(4));
      out += pair(31, (entity.p2.z ?? 0).toFixed(4));
      break;

    case 'CIRCLE':
      out += pair(0, 'CIRCLE');
      out += pair(8, entity.layer);
      out += pair(10, entity.center.x.toFixed(4));
      out += pair(20, entity.center.y.toFixed(4));
      out += pair(30, (entity.center.z ?? 0).toFixed(4));
      out += pair(40, entity.radius.toFixed(4));
      break;

    case 'ARC':
      out += pair(0, 'ARC');
      out += pair(8, entity.layer);
      out += pair(10, entity.center.x.toFixed(4));
      out += pair(20, entity.center.y.toFixed(4));
      out += pair(30, (entity.center.z ?? 0).toFixed(4));
      out += pair(40, entity.radius.toFixed(4));
      out += pair(50, entity.startAngle.toFixed(4));
      out += pair(51, entity.endAngle.toFixed(4));
      break;

    case 'TEXT':
      out += pair(0, 'TEXT');
      out += pair(8, entity.layer);
      out += pair(10, entity.position.x.toFixed(4));
      out += pair(20, entity.position.y.toFixed(4));
      out += pair(30, (entity.position.z ?? 0).toFixed(4));
      out += pair(40, entity.height.toFixed(4));
      out += pair(1, entity.text);
      if (entity.rotation !== undefined) {
        out += pair(50, entity.rotation.toFixed(4));
      }
      // Horizontal justification
      if (entity.hAlign) {
        const hCode = entity.hAlign === 'LEFT' ? 0 : entity.hAlign === 'CENTER' ? 1 : 2;
        out += pair(72, hCode);
      }
      // Vertical justification
      if (entity.vAlign) {
        const vCode = entity.vAlign === 'BASELINE' ? 0 :
                      entity.vAlign === 'BOTTOM' ? 1 :
                      entity.vAlign === 'MIDDLE' ? 2 : 3;
        out += pair(73, vCode);
      }
      break;

    case 'POINT':
      out += pair(0, 'POINT');
      out += pair(8, entity.layer);
      out += pair(10, entity.position.x.toFixed(4));
      out += pair(20, entity.position.y.toFixed(4));
      out += pair(30, (entity.position.z ?? 0).toFixed(4));
      break;

    case 'POLYLINE':
      out += pair(0, 'POLYLINE');
      out += pair(8, entity.layer);
      out += pair(66, 1);  // Vertices follow flag
      out += pair(70, entity.closed ? 1 : 0);  // Closed polyline flag

      for (const point of entity.points) {
        out += pair(0, 'VERTEX');
        out += pair(8, entity.layer);
        out += pair(10, point.x.toFixed(4));
        out += pair(20, point.y.toFixed(4));
        out += pair(30, (point.z ?? 0).toFixed(4));
      }

      out += pair(0, 'SEQEND');
      out += pair(8, entity.layer);
      break;
  }

  return out;
}

function writeEntities(doc: DxfDocument): string {
  let out = '';

  // Section start
  out += pair(0, 'SECTION');
  out += pair(2, 'ENTITIES');

  // Write all entities
  for (const entity of doc.entities) {
    out += writeEntity(entity);
  }

  // Section end
  out += pair(0, 'ENDSEC');

  return out;
}

// ============================================================================
// Main Writer
// ============================================================================

/**
 * Write a DXF document to R12 format string.
 */
export function writeDxfR12(doc: DxfDocument): string {
  // Calculate extents if not provided
  if (!doc.extents && doc.entities.length > 0) {
    doc.extents = calculateExtents(doc.entities);
  }

  let out = '';

  out += writeHeader(doc);
  out += writeTables(doc);
  out += writeEntities(doc);

  // End of file
  out += pair(0, 'EOF');

  return out;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate bounding box of entities.
 */
function calculateExtents(entities: DxfEntity[]): { min: { x: number; y: number }; max: { x: number; y: number } } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const entity of entities) {
    switch (entity.type) {
      case 'LINE':
        minX = Math.min(minX, entity.p1.x, entity.p2.x);
        minY = Math.min(minY, entity.p1.y, entity.p2.y);
        maxX = Math.max(maxX, entity.p1.x, entity.p2.x);
        maxY = Math.max(maxY, entity.p1.y, entity.p2.y);
        break;

      case 'CIRCLE':
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        maxX = Math.max(maxX, entity.center.x + entity.radius);
        maxY = Math.max(maxY, entity.center.y + entity.radius);
        break;

      case 'ARC':
        // Simplified: use center +/- radius
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        maxX = Math.max(maxX, entity.center.x + entity.radius);
        maxY = Math.max(maxY, entity.center.y + entity.radius);
        break;

      case 'TEXT':
      case 'POINT':
        minX = Math.min(minX, entity.position.x);
        minY = Math.min(minY, entity.position.y);
        maxX = Math.max(maxX, entity.position.x);
        maxY = Math.max(maxY, entity.position.y);
        break;

      case 'POLYLINE':
        for (const p of entity.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        break;
    }
  }

  // Handle empty case
  if (!isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
