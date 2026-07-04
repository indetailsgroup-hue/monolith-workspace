/**
 * classifier.test.ts — ชุดทดสอบของ Classifier (`classify`)
 *
 * Feature: daph-obsidian-second-brain
 * ครอบคลุม Task:
 *   3.2 Property 1 — Total classification (Req 1.2, 1.3, 2.1)
 *   3.3 Property 2 — Junk exclusivity   (Req 1.4, 10.1)
 *   3.4 Property 3 — Status tag domain  (Req 11.4, 10.3)
 *   3.5 Property 4 — Multi-unit tagging (Req 2.5, 2.6, 11.2)
 *   3.6 Unit tests  — กรณีจัดประเภทตายตัว (Req 6.1, 3.5, 2.2, 2.3, 2.4)
 *
 * ใช้ Vitest + fast-check; แต่ละ property รัน >= 100 iterations (ตั้งค่า numRuns ชัดเจน)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { classify } from './classifier.js';
import {
  OFFICE_UNITS,
  FACTORY_UNITS,
  INSTALLATION_UNITS,
  CANONICAL_UNITS_BY_GROUP,
} from './constants.js';
import type {
  DocumentType,
  ExtractIndex,
  SourceFile,
  StatusTag,
  SubProcessGroup,
} from './types.js';

// ---------------------------------------------------------------------------
// ค่าคงที่/เซ็ตที่กำหนดจากดีไซน์ (ใช้ตรวจ membership)
// ---------------------------------------------------------------------------

const ALLOWED_DOC_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'SOS',
  'JES',
  'PFMEA',
  'Process Control Plan',
  'Template',
  'Master Matrix',
  'Project Doc',
  'Other',
]);

const ALLOWED_GROUPS: ReadonlySet<SubProcessGroup | null> = new Set<SubProcessGroup | null>([
  'Office',
  'Factory',
  'Installation',
  null,
]);

const ALLOWED_STATUS: ReadonlySet<StatusTag> = new Set<StatusTag>([
  'active',
  'draft',
  'revise',
  'archived',
]);

/** จำนวน iterations ต่อ property (>= 100 ตามข้อกำหนด) */
const NUM_RUNS = 200;

/** index ว่าง (ไม่มี extract) — Classifier จะถอยไปใช้กฎจากชื่อไฟล์ */
const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** prefix ของชื่อเอกสารจริงในชุดข้อมูล DAPH */
const DOC_PREFIXES = [
  '1.SOS DAPH',
  '2.JES DAPH',
  'DAPH PFMEA',
  'DAPH Process control plan',
  'Installation',
  'สำหรับคุณชุ',
  'Citadines Arch ID KDR cklst',
  'Template Feasibility By Daph decor send 251019',
  'interior-designer-sample-spec sheet-template',
  'แผนการทำงานช่างติดตั้ง ประจำวัน',
] as const;

/** token ระบุหน่วย/หลายหน่วย ที่ต่อท้าย prefix ('' = ไม่มี) */
const UNIT_TOKENS = [
  '',
  ', Main Process',
  ', Sale',
  ', Area measurement',
  ', Designer',
  ', 3D Perspective',
  ', Production Planning',
  ', INSTALLATION',
  ', Laminate',
  ', Cutting',
  ', Edging',
  ', CNC',
  ', Asm',
  ', Packing',
] as const;

const OWNER_TOKENS = ['', ", P'oil", ", P'Mean"] as const;
const STATUS_TOKENS = ['', ' Draft', ' (Revise 1)', '(1)'] as const;

function makeSourceFile(originalName: string, domainHint: 'Hardware' | 'Process', ext: string): SourceFile {
  return {
    originalName,
    absolutePath: `/source/${domainHint}/${originalName}`,
    domainHint,
    ext,
    sizeBytes: 4096,
  };
}

/**
 * Generator แบบกว้าง: ชื่อไฟล์ DAPH ที่เป็นไปได้หลากหลาย รวมไฟล์ junk (`~$`, `.tmp`)
 * ใช้กับ Property 1/2/3 ที่ค่าต้องอยู่ในโดเมนเสมอไม่ว่าชื่ออะไร
 */
const broadSourceFileArb: fc.Arbitrary<SourceFile> = fc
  .record({
    junkPrefix: fc.constantFrom('', '~$'),
    prefix: fc.constantFrom(...DOC_PREFIXES),
    unit: fc.constantFrom(...UNIT_TOKENS),
    owner: fc.constantFrom(...OWNER_TOKENS),
    status: fc.constantFrom(...STATUS_TOKENS),
    ext: fc.constantFrom('.xlsx', '.xls', '.tmp'),
    domainHint: fc.constantFrom('Hardware', 'Process'),
  })
  .map(({ junkPrefix, prefix, unit, owner, status, ext, domainHint }) => {
    const originalName = `${junkPrefix}${prefix}${unit}${owner}${status}${ext}`;
    return makeSourceFile(originalName, domainHint as 'Hardware' | 'Process', ext);
  });

/**
 * Generator แบบจำกัด: เอกสาร QMS ฝั่ง Process โดยใช้ prefix ที่ "ไม่ฝังคำหน่วย"
 * และต่อ token หน่วยได้ไม่เกินหนึ่งตัว เพื่อสะท้อน input space จริง
 * (ใช้กับ Property 4 ที่ตรวจความสอดคล้องของ units กับ group)
 */
const QMS_PREFIXES = [
  '1.SOS DAPH',
  '2.JES DAPH',
  'DAPH PFMEA',
  'DAPH Process control plan',
] as const;

const processQmsArb: fc.Arbitrary<SourceFile> = fc
  .record({
    junkPrefix: fc.constantFrom('', '~$'),
    prefix: fc.constantFrom(...QMS_PREFIXES),
    unit: fc.constantFrom(...UNIT_TOKENS),
    owner: fc.constantFrom(...OWNER_TOKENS),
    status: fc.constantFrom(...STATUS_TOKENS),
    ext: fc.constantFrom('.xlsx', '.xls', '.tmp'),
  })
  .map(({ junkPrefix, prefix, unit, owner, status, ext }) => {
    const originalName = `${junkPrefix}${prefix}${unit}${owner}${status}${ext}`;
    return makeSourceFile(originalName, 'Process', ext);
  });

// ===========================================================================
// Task 3.2 — Property 1: Total classification และค่าอยู่ในเซ็ตที่กำหนด
// ===========================================================================

describe('Classifier — Property 1: Total classification', () => {
  // Feature: daph-obsidian-second-brain, Property 1: ทุกไฟล์ได้ domain เสมอ และไฟล์ Process ที่ไม่ใช่ junk ได้ documentType ในเซ็ตที่กำหนด พร้อม group ใน {Office,Factory,Installation,null}
  it('assigns domain in {Hardware,Process}, valid documentType/group for every file', () => {
    fc.assert(
      fc.property(broadSourceFileArb, (file) => {
        const c = classify(file, EMPTY_INDEX);

        // domain อยู่ในเซ็ตเสมอ
        expect(c.domain === 'Hardware' || c.domain === 'Process').toBe(true);

        // group อยู่ในเซ็ต {Office, Factory, Installation, null} เสมอ
        expect(ALLOWED_GROUPS.has(c.group)).toBe(true);

        // documentType: null ได้เฉพาะ junk; มิฉะนั้นต้องอยู่ในเซ็ตที่กำหนด
        if (c.documentType === null) {
          expect(c.isJunk).toBe(true);
        } else {
          expect(ALLOWED_DOC_TYPES.has(c.documentType)).toBe(true);
        }

        // ไฟล์ Process ที่ไม่ใช่ junk ต้องถูกจัดประเภทเสมอ (ไม่มี documentType === null)
        if (c.domain === 'Process' && !c.isJunk) {
          expect(c.documentType).not.toBeNull();
        }

        // units เป็น array เสมอ (ผลคือ classification เดียวต่อไฟล์)
        expect(Array.isArray(c.units)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Task 3.3 — Property 2: Junk exclusivity
// ===========================================================================

describe('Classifier — Property 2: Junk exclusivity', () => {
  // Feature: daph-obsidian-second-brain, Property 2: isJunk === true ⟺ documentType === null และ junk เสมอได้ statusTag 'archived'
  it('isJunk iff documentType is null, and junk implies archived', () => {
    fc.assert(
      fc.property(broadSourceFileArb, (file) => {
        const c = classify(file, EMPTY_INDEX);

        // ความสมมูล: isJunk === true ⟺ documentType === null
        expect(c.isJunk).toBe(c.documentType === null);

        // junk → statusTag 'archived' เสมอ
        if (c.isJunk) {
          expect(c.statusTag).toBe('archived');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Task 3.4 — Property 3: Status tag domain
// ===========================================================================

describe('Classifier — Property 3: Status tag domain', () => {
  // Feature: daph-obsidian-second-brain, Property 3: statusTag อยู่ในเซ็ต {active, draft, revise, archived} เสมอ
  it('statusTag is always one of {active,draft,revise,archived}', () => {
    fc.assert(
      fc.property(broadSourceFileArb, (file) => {
        const c = classify(file, EMPTY_INDEX);
        expect(ALLOWED_STATUS.has(c.statusTag)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Task 3.5 — Property 4: Multi-unit tagging correctness
// ===========================================================================

describe('Classifier — Property 4: Multi-unit tagging correctness', () => {
  // Feature: daph-obsidian-second-brain, Property 4: เซ็ต units ต้องสอดคล้องกับ group (units ทุกตัวอยู่ในลำดับ canonical ของ group) และ group === null ⟹ units ว่าง
  it('units are consistent with the assigned group (subset of canonical units)', () => {
    fc.assert(
      fc.property(processQmsArb, (file) => {
        const c = classify(file, EMPTY_INDEX);

        // หนึ่งไฟล์ = หนึ่ง classification (units เป็น array เดียว)
        expect(Array.isArray(c.units)).toBe(true);

        if (c.group === null) {
          // ไม่สังกัดกลุ่ม → ต้องไม่มีหน่วย
          expect(c.units).toEqual([]);
        } else {
          // ทุกหน่วยต้องอยู่ในลำดับ canonical ของกลุ่มนั้น
          const canonical = CANONICAL_UNITS_BY_GROUP[c.group];
          for (const unit of c.units) {
            expect(canonical).toContain(unit);
          }
          // ไม่มีหน่วยซ้ำ
          expect(new Set(c.units).size).toBe(c.units.length);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('multi-unit files receive all units of their group while staying one classification', () => {
    // Office multi-unit: "Main Process" = 5 แผนก Office
    const mainProcess = classify(
      makeSourceFile('1.SOS DAPH, Main Process.xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(mainProcess.group).toBe('Office');
    expect(mainProcess.units).toEqual([...OFFICE_UNITS]);

    // Installation multi-unit: 16 ขั้นตอน
    const installation = classify(
      makeSourceFile('1.SOS DAPH, INSTALLATION.xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(installation.group).toBe('Installation');
    expect(installation.units).toEqual([...INSTALLATION_UNITS]);

    // Factory multi-unit (bare SOS, ไม่มี extract): 6 สถานี
    const factorySos = classify(
      makeSourceFile('1.SOS DAPH.xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(factorySos.group).toBe('Factory');
    expect(factorySos.units).toEqual([...FACTORY_UNITS]);

    // single-unit ยังคงเป็นหน่วยเดียว
    const sale = classify(
      makeSourceFile('DAPH PFMEA, Sale.xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(sale.units).toEqual(['Sale']);
  });
});

// ===========================================================================
// Task 3.6 — Unit tests: กรณีจัดประเภทตายตัว
// ===========================================================================

describe('Classifier — fixed classification cases (Task 3.6)', () => {
  it('สำหรับคุณชุ.xlsx → Master Matrix (Req 6.1)', () => {
    const c = classify(makeSourceFile('สำหรับคุณชุ.xlsx', 'Process', '.xlsx'), EMPTY_INDEX);
    expect(c.documentType).toBe('Master Matrix');
    expect(c.isJunk).toBe(false);
    expect(c.group).toBeNull();
    expect(c.units).toEqual([]);
    expect(c.statusTag).toBe('active');
  });

  it('Citadines Arch ID KDR cklst.xls → Project Doc (Req 3.5)', () => {
    const c = classify(
      makeSourceFile('Citadines Arch ID KDR cklst.xls', 'Process', '.xls'),
      EMPTY_INDEX,
    );
    expect(c.documentType).toBe('Project Doc');
    expect(c.isJunk).toBe(false);
    expect(c.group).toBeNull();
    expect(c.units).toEqual([]);
  });

  it('~$1.SOS DAPH Draft.xlsx → junk (archived, no documentType)', () => {
    const c = classify(
      makeSourceFile('~$1.SOS DAPH Draft.xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(c.isJunk).toBe(true);
    expect(c.documentType).toBeNull();
    expect(c.statusTag).toBe('archived');
  });

  it("DAPH PFMEA, Sale.xlsx → {PFMEA, Office, [Sale], active} (Req 2.2)", () => {
    const c = classify(makeSourceFile('DAPH PFMEA, Sale.xlsx', 'Process', '.xlsx'), EMPTY_INDEX);
    expect(c.documentType).toBe('PFMEA');
    expect(c.group).toBe('Office');
    expect(c.units).toEqual(['Sale']);
    expect(c.statusTag).toBe('active');
    expect(c.owner).toBeNull();
  });

  it("DAPH PFMEA, INSTALLATION,P'oil.xlsx → owner P'oil, Installation group (Req 2.4)", () => {
    const c = classify(
      makeSourceFile("DAPH PFMEA, INSTALLATION,P'oil.xlsx", 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(c.documentType).toBe('PFMEA');
    expect(c.group).toBe('Installation');
    expect(c.owner).toBe("P'oil");
    expect(c.units).toEqual([...INSTALLATION_UNITS]);
    expect(c.statusTag).toBe('active');
  });

  it('DAPH PFMEA, Main Process (Revise 1).xlsx → revise (Req 2.3 status)', () => {
    const c = classify(
      makeSourceFile('DAPH PFMEA, Main Process (Revise 1).xlsx', 'Process', '.xlsx'),
      EMPTY_INDEX,
    );
    expect(c.documentType).toBe('PFMEA');
    expect(c.group).toBe('Office');
    expect(c.units).toEqual([...OFFICE_UNITS]);
    expect(c.statusTag).toBe('revise');
  });

  it('canonical unit ordering for the three groups is correct (Req 2.2, 2.3, 2.4)', () => {
    expect([...OFFICE_UNITS]).toEqual([
      'Sale',
      'Area Measurement',
      'Designer',
      '3D Perspective',
      'Production Planning',
    ]);
    expect([...FACTORY_UNITS]).toEqual([
      'Laminate HPL',
      'Cutting',
      'Edging',
      'CNC',
      'Assembly',
      'Packing',
    ]);
    expect(INSTALLATION_UNITS.length).toBe(16);
    expect(INSTALLATION_UNITS[0]).toBe('การบรีฟงาน');
    expect(INSTALLATION_UNITS[15]).toBe('การเก็บของ');
  });
});
