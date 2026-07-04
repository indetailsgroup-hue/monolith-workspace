/**
 * static-assets.test.ts — เนื้อหา static assets ครบถ้วน
 * Feature: daph-obsidian-second-brain, Task 13.5 / Req 6.3, 8, 10, 11, 11.5
 */

import { describe, expect, it } from 'vitest';

import { generateStaticAssets } from './static-assets.js';

describe('static-assets — Task 13.5', () => {
  const assets = generateStaticAssets();
  const byPath = (suffix: string) => assets.find((a) => a.relativePath.endsWith(suffix))?.content ?? '';

  it('สร้างครบ 5 ไฟล์', () => {
    expect(assets.length).toBe(5);
  });

  it('Glossary มีคำย่อหลัก + ซอฟต์แวร์', () => {
    const g = byPath('Glossary.md');
    for (const term of ['SOS', 'JES', 'PFMEA', 'RPN', 'MOC', 'PARA', 'Pytha', 'MaxCut', 'AutoCAD', '3D Max']) {
      expect(g).toContain(term);
    }
  });

  it('Plugin Guide ระบุ Dataview/Templater/Excalidraw', () => {
    const p = byPath('Plugin-Guide.md');
    expect(p).toContain('Dataview');
    expect(p).toContain('Templater');
    expect(p).toContain('Excalidraw');
  });

  it('Project Template มีหัวข้อสามกลุ่ม + frontmatter ลูกค้า/โครงการ/วันที่', () => {
    const t = byPath('Project-Template.md');
    expect(t).toContain('### Office');
    expect(t).toContain('### Factory');
    expect(t).toContain('### Installation');
    expect(t).toContain('client:');
    expect(t).toContain('project:');
    expect(t).toContain('date:');
  });

  it('Master Matrix อ้างไฟล์ต้นฉบับ สำหรับคุณชุ', () => {
    const m = byPath('Master-Matrix.md');
    expect(m).toContain('สำหรับคุณชุ.xlsx');
  });
});
