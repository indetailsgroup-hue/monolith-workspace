/**
 * dashboard-generator.ts — DashboardGenerator ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 12.1)
 * Requirements: 8.1, 8.2, 8.5, 9.1, 9.2, 9.3, 9.4
 *
 * สร้าง `Home.md` ที่รากของ Vault เป็นศูนย์รวมการนำทาง + ฝัง Process Flow
 * (Mermaid) แสดงทั้งสามกลุ่มกระบวนการตามลำดับ พร้อมลิงก์ไป MOC ของแต่ละหน่วย/กลุ่ม
 */

import { CANONICAL_GROUPS, CANONICAL_UNITS_BY_GROUP } from './constants.js';
import { groupMocName, unitMocName, type GeneratedNote } from './moc-generator.js';

/** สร้างบล็อก Mermaid flowchart ของกระบวนการสามกลุ่ม (Req 9.1, 9.2) */
function buildMermaidFlow(): string {
  const lines: string[] = ['```mermaid', 'flowchart TD'];

  // subgraph ต่อกลุ่ม + โหนดต่อหน่วย
  for (const group of CANONICAL_GROUPS) {
    lines.push(`  subgraph ${group}`);
    const units = CANONICAL_UNITS_BY_GROUP[group];
    units.forEach((unit, i) => {
      const id = `${group}_${i}`;
      lines.push(`    ${id}["${unit}"]`);
      if (i > 0) {
        lines.push(`    ${group}_${i - 1} --> ${id}`);
      }
    });
    lines.push('  end');
  }

  // เชื่อมระหว่างกลุ่ม: หน่วยสุดท้ายของกลุ่มก่อน → หน่วยแรกของกลุ่มถัดไป
  for (let g = 0; g < CANONICAL_GROUPS.length - 1; g++) {
    const cur = CANONICAL_GROUPS[g];
    const next = CANONICAL_GROUPS[g + 1];
    const lastIdx = CANONICAL_UNITS_BY_GROUP[cur].length - 1;
    lines.push(`  ${cur}_${lastIdx} --> ${next}_0`);
  }

  lines.push('```');
  return lines.join('\n');
}

/** สร้าง Home.md (Req 8.1, 8.2, 8.5) */
export function generateHome(): GeneratedNote {
  const lines: string[] = [
    '---',
    'type: home-dashboard',
    'tags: [home, moc]',
    '---',
    '',
    '# 🏠 DAPH Second Brain — Home',
    '',
    'ศูนย์รวมการนำทางของ Obsidian Vault รวมสองโดเมน: **Hardware** และ **Process (QMS)**',
    '',
    '## โดเมน',
    '- 🔧 [[Hardware-MOC|Hardware — อุปกรณ์เฟอร์นิเจอร์]]',
    '',
    '## กลุ่มกระบวนการ (Process)',
  ];

  for (const group of CANONICAL_GROUPS) {
    lines.push(`- 📋 [[${groupMocName(group)}|${group}]]`);
  }

  lines.push('');
  lines.push('## แผนผังกระบวนการ (Process Flow)');
  lines.push(buildMermaidFlow());
  lines.push('');
  lines.push('### เข้าถึงแต่ละหน่วยกระบวนการ');
  for (const group of CANONICAL_GROUPS) {
    lines.push(`**${group}**: ` +
      CANONICAL_UNITS_BY_GROUP[group].map((u) => `[[${unitMocName(u)}|${u}]]`).join(' · '));
  }

  lines.push('');
  lines.push('## ทรัพยากร (Resources)');
  lines.push('- 📖 [[Glossary|อภิธานศัพท์]]');
  lines.push('- 🗂️ [[Master-Matrix|Master Process Matrix (สำหรับคุณชุ)]]');
  lines.push('- 📝 [[Project-Template|เทมเพลตโครงการลูกค้าใหม่]]');
  lines.push('- 🔌 [[Plugin-Guide|คำแนะนำปลั๊กอิน]]');
  lines.push('- 🏷️ [[Tag-Reference|รายการแท็ก]]');

  return { relativePath: 'Home.md', content: `${lines.join('\n')}\n` };
}
