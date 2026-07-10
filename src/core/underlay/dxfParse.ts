/**
 * dxfParse — FP-2 (ADR-062): parser DXF ขั้นต่ำสำหรับชั้นอ้างอิง
 *
 * รองรับ entity พื้นฐานที่พอสำหรับแปลนบ้าน: LINE / LWPOLYLINE / CIRCLE / ARC
 * ผลลัพธ์ = เส้น segment 2D ล้วน (หน่วยตามไฟล์ ผู้ใช้เทียบสเกลเอง)
 *
 * หลักเหล็ก human-in-loop เดิม: ผลลัพธ์เป็น "ภาพอ้างอิง" เท่านั้น —
 * ไม่มี wall/door detection, ไม่สร้าง geometry ผลิต, ขนาดจริงต้องวัดหน้างาน
 * fail-safe no-guess: entity ที่ไม่รู้จัก = ข้าม ไม่เดา
 */

export interface DxfSegment {
  x1: number; y1: number; x2: number; y2: number;
}

export interface DxfParseResult {
  segments: DxfSegment[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** จำนวน entity ที่ข้ามเพราะไม่รองรับ (โปร่งใสต่อผู้ใช้) */
  skippedEntities: number;
}

const CIRCLE_TESSELLATION = 32;

/** อ่านคู่ group-code/value ของ DXF (บรรทัดคู่-คี่) */
function readPairs(text: string): Array<[number, string]> {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isFinite(code)) pairs.push([code, lines[i + 1].trim()]);
  }
  return pairs;
}

function tessellateArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
  out: DxfSegment[],
): void {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360; // DXF arc เดินทวนเข็มเสมอ
  const steps = Math.max(4, Math.ceil((sweep / 360) * CIRCLE_TESSELLATION));
  let px = cx + r * Math.cos((startDeg * Math.PI) / 180);
  let py = cy + r * Math.sin((startDeg * Math.PI) / 180);
  for (let i = 1; i <= steps; i++) {
    const a = ((startDeg + (sweep * i) / steps) * Math.PI) / 180;
    const nx = cx + r * Math.cos(a);
    const ny = cy + r * Math.sin(a);
    out.push({ x1: px, y1: py, x2: nx, y2: ny });
    px = nx; py = ny;
  }
}

/**
 * แปลง DXF text → เส้นอ้างอิง 2D
 */
export function parseDxf(text: string): DxfParseResult {
  const pairs = readPairs(text);
  const segments: DxfSegment[] = [];
  let skipped = 0;

  // หา ENTITIES section
  let i = 0;
  let inEntities = false;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code === 2 && value === 'ENTITIES') inEntities = true;
    if (inEntities && code === 0 && value === 'ENDSEC') break;

    if (inEntities && code === 0 && value !== 'SECTION') {
      const type = value;
      // เก็บ group codes ของ entity นี้จนถึง 0 ตัวถัดไป
      const g: Record<number, number[]> = {};
      let j = i + 1;
      while (j < pairs.length && pairs[j][0] !== 0) {
        const [c, v] = pairs[j];
        const n = parseFloat(v);
        if (Number.isFinite(n)) (g[c] ??= []).push(n);
        j++;
      }

      if (type === 'LINE' && g[10] && g[20] && g[11] && g[21]) {
        segments.push({ x1: g[10][0], y1: g[20][0], x2: g[11][0], y2: g[21][0] });
      } else if (type === 'LWPOLYLINE' && g[10] && g[20] && g[10].length >= 2) {
        const closed = ((g[70]?.[0] ?? 0) & 1) === 1;
        const n = Math.min(g[10].length, g[20].length);
        for (let k = 1; k < n; k++) {
          segments.push({ x1: g[10][k - 1], y1: g[20][k - 1], x2: g[10][k], y2: g[20][k] });
        }
        if (closed && n >= 3) {
          segments.push({ x1: g[10][n - 1], y1: g[20][n - 1], x2: g[10][0], y2: g[20][0] });
        }
      } else if (type === 'CIRCLE' && g[10] && g[20] && g[40]) {
        tessellateArc(g[10][0], g[20][0], g[40][0], 0, 360, segments);
      } else if (type === 'ARC' && g[10] && g[20] && g[40] && g[50] && g[51]) {
        tessellateArc(g[10][0], g[20][0], g[40][0], g[50][0], g[51][0], segments);
      } else if (type !== 'ENDSEC') {
        skipped++;
      }
      i = j;
      continue;
    }
    i++;
  }

  let bounds: DxfParseResult['bounds'] = null;
  if (segments.length > 0) {
    bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const s of segments) {
      bounds.minX = Math.min(bounds.minX, s.x1, s.x2);
      bounds.minY = Math.min(bounds.minY, s.y1, s.y2);
      bounds.maxX = Math.max(bounds.maxX, s.x1, s.x2);
      bounds.maxY = Math.max(bounds.maxY, s.y1, s.y2);
    }
  }

  return { segments, bounds, skippedEntities: skipped };
}
