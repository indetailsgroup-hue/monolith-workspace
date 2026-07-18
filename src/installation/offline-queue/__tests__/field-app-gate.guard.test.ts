// Feature: S18 fix-review (l3-field-app) — gate guard กัน "vacuous green" ของชุดเทส field-app
//
// Root Vitest config จงใจ exclude packages/field-app/** (แพ็กเกจมี jsdom config ของตัวเอง)
// ดังนั้นคำสั่ง lane-verify แบบ `npx vitest run packages/field-app src/installation`
// จะเก็บเทสจาก field-app ได้ ศูนย์ ไฟล์ — เขียวลอย ๆ โดยไม่ได้รันอะไรเลย
// เกตจริงอยู่ใน CI:
//   - .github/workflows/verify-full.yml    → job "field": npm run test:run -w @daph/field-app (ทุก PR)
//   - .github/workflows/field-app-pages.yml → gate deploy ด้วยคำสั่งเดียวกัน (FS-B1-04)
// การ์ดนี้อยู่ใน suite ที่ root เก็บจริง (path เดียวใน L3 scope ที่ root config เก็บ)
// และจะแดงทันทีถ้าคำสั่งเกตใน CI หรือสคริปต์เทสของแพ็กเกจหายไป —
// lane-verify ท้องถิ่นจึงเขียวไม่ได้อีกแล้วถ้าชุดเทส field-app หลุดจากเกต
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** คำสั่งเกตชุดเทส field-app — ต้องตรงกับที่ CI ใช้ทุกตัวอักษร */
const FIELD_APP_TEST_CMD = 'npm run test:run -w @daph/field-app';

function readRepoFile(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

function hasFieldAppGate(workflowYaml: string): boolean {
  return workflowYaml.includes(FIELD_APP_TEST_CMD);
}

describe('field-app test gate — ต้องมีเกตจริง ไม่ใช่เขียวลอย (S18 fix-review #1)', () => {
  it('verify-full.yml ยังมี job ที่รันชุดเทส field-app และ trigger บน pull_request', () => {
    const yml = readRepoFile('.github/workflows/verify-full.yml');
    expect(hasFieldAppGate(yml)).toBe(true);
    // เกตต้องครอบ PR ของ lane ทุกใบ — ไม่ใช่แค่ push main
    expect(yml).toMatch(/^\s*pull_request:/m);
  });

  it('field-app-pages.yml ยัง gate การ deploy ด้วยชุดเทสเดียวกัน (FS-B1-04)', () => {
    expect(hasFieldAppGate(readRepoFile('.github/workflows/field-app-pages.yml'))).toBe(true);
  });

  it('@daph/field-app ยังมีสคริปต์ test:run ให้เกตเรียก (vitest run ใต้ config ของแพ็กเกจเอง)', () => {
    const pkg = JSON.parse(readRepoFile('packages/field-app/package.json'));
    expect(pkg.name).toBe('@daph/field-app');
    expect(pkg.scripts['test:run']).toBe('vitest run');
  });

  it('ตัวตรวจไม่ vacuous — workflow ที่คำสั่งเกตหายไปต้องตรวจเจอ', () => {
    // จำลอง failure scenario ตรง ๆ: มีคนลบบรรทัดเกตออกจาก verify-full.yml
    const stripped = readRepoFile('.github/workflows/verify-full.yml')
      .split('\n')
      .filter((line) => !line.includes(FIELD_APP_TEST_CMD))
      .join('\n');
    expect(hasFieldAppGate(stripped)).toBe(false);
  });
});
