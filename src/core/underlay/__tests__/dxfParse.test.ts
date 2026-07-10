/** FP-2 (ADR-062) DXF parser ขั้นต่ำ — LINE/LWPOLYLINE/CIRCLE/ARC, no-guess */
import { describe, it, expect } from 'vitest';
import { parseDxf } from '../dxfParse';

const dxf = (entities: string) => ['0', 'SECTION', '2', 'ENTITIES', entities.trim(), '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('parseDxf', () => {
  it('LINE → 1 segment ตรงพิกัด', () => {
    const r = parseDxf(dxf(['0', 'LINE', '10', '0', '20', '0', '11', '1000', '21', '500'].join('\n')));
    expect(r.segments).toEqual([{ x1: 0, y1: 0, x2: 1000, y2: 500 }]);
    expect(r.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 500 });
  });

  it('LWPOLYLINE ปิด (flag 70=1) → ต่อครบวง', () => {
    const r = parseDxf(dxf([
      '0', 'LWPOLYLINE', '90', '3', '70', '1',
      '10', '0', '20', '0', '10', '100', '20', '0', '10', '100', '20', '100',
    ].join('\n')));
    expect(r.segments).toHaveLength(3); // 2 ด้าน + เส้นปิด
    expect(r.segments[2]).toEqual({ x1: 100, y1: 100, x2: 0, y2: 0 });
  });

  it('LWPOLYLINE เปิด → ไม่ปิดวง', () => {
    const r = parseDxf(dxf([
      '0', 'LWPOLYLINE', '90', '3', '70', '0',
      '10', '0', '20', '0', '10', '100', '20', '0', '10', '100', '20', '100',
    ].join('\n')));
    expect(r.segments).toHaveLength(2);
  });

  it('CIRCLE → tessellate ครบวง (จุดปลายบรรจบ)', () => {
    const r = parseDxf(dxf(['0', 'CIRCLE', '10', '50', '20', '50', '40', '10'].join('\n')));
    expect(r.segments.length).toBeGreaterThanOrEqual(16);
    const first = r.segments[0];
    const last = r.segments[r.segments.length - 1];
    expect(last.x2).toBeCloseTo(first.x1, 6);
    expect(last.y2).toBeCloseTo(first.y1, 6);
  });

  it('ARC 90° → sweep ถูกทิศ (ทวนเข็ม)', () => {
    const r = parseDxf(dxf(['0', 'ARC', '10', '0', '20', '0', '40', '100', '50', '0', '51', '90'].join('\n')));
    const first = r.segments[0];
    const last = r.segments[r.segments.length - 1];
    expect(first.x1).toBeCloseTo(100, 4);
    expect(first.y1).toBeCloseTo(0, 4);
    expect(last.x2).toBeCloseTo(0, 4);
    expect(last.y2).toBeCloseTo(100, 4);
  });

  it('entity ไม่รู้จัก = ข้าม + นับ (no-guess)', () => {
    const r = parseDxf(dxf(['0', 'SPLINE', '10', '0', '0', 'LINE', '10', '0', '20', '0', '11', '5', '21', '5'].join('\n')));
    expect(r.segments).toHaveLength(1);
    expect(r.skippedEntities).toBe(1);
  });

  it('ไฟล์ว่าง/ไม่มี ENTITIES → ว่างแบบ fail-safe', () => {
    expect(parseDxf('').segments).toHaveLength(0);
    expect(parseDxf('0\nEOF').bounds).toBeNull();
  });
});
