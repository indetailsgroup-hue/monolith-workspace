/**
 * dashboard-generator.test.ts — Home links + Mermaid blocks
 * Feature: daph-obsidian-second-brain, Task 12.2 / Req 8.1, 8.2, 8.5, 9.2
 */

import { describe, expect, it } from 'vitest';

import { generateHome } from './dashboard-generator.js';

describe('dashboard-generator — Task 12.2: Home', () => {
  const home = generateHome();

  it('สร้างที่ Home.md ราก Vault', () => {
    expect(home.relativePath).toBe('Home.md');
  });

  it('มีลิงก์ไป group MOC ทั้งสามกลุ่ม + Hardware + ทรัพยากร', () => {
    expect(home.content).toContain('[[Office-MOC|Office]]');
    expect(home.content).toContain('[[Factory-MOC|Factory]]');
    expect(home.content).toContain('[[Installation-MOC|Installation]]');
    expect(home.content).toContain('[[Hardware-MOC|');
    expect(home.content).toContain('[[Glossary|');
    expect(home.content).toContain('[[Master-Matrix|');
  });

  it('ฝัง Mermaid flowchart และครบสามกลุ่ม', () => {
    expect(home.content).toContain('```mermaid');
    expect(home.content).toContain('flowchart TD');
    expect(home.content).toContain('subgraph Office');
    expect(home.content).toContain('subgraph Factory');
    expect(home.content).toContain('subgraph Installation');
  });
});
