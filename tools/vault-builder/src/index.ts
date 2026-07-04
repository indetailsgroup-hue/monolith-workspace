/**
 * index.ts — CLI entry ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 14.1)
 *
 * รัน pipeline สร้าง Obsidian Vault จากข้อมูล DAPH จริง
 * ใช้งาน: `npm run build:vault` (ดู package.json) หรือ `node --import tsx src/index.ts`
 */

import { runPipeline } from './pipeline.js';
import { VAULT_OUTPUT } from './paths.js';

async function main(): Promise<void> {
  console.log('[vault-builder] เริ่มสร้าง Vault ...');
  const result = await runPipeline();
  console.log('[vault-builder] เสร็จสิ้น:');
  console.log(`  - สแกนไฟล์: ${result.scanned}`);
  console.log(`  - คัดลอกไฟล์เข้า Vault: ${result.copied}`);
  console.log(`  - Index_Note: ${result.notes}`);
  console.log(`  - MOC: ${result.mocs}`);
  console.log(`  - Static assets: ${result.staticAssets}`);
  console.log(`  - ปลายทาง: ${VAULT_OUTPUT}`);
}

main().catch((err) => {
  console.error('[vault-builder] ล้มเหลว:', err);
  process.exitCode = 1;
});
